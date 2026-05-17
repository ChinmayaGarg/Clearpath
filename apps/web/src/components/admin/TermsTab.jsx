import { useState, useEffect } from 'react';
import { api }   from '../../lib/api.js';
import { toast } from '../ui/Toast.jsx';
import Spinner   from '../ui/Spinner.jsx';

const EMPTY_TERM = { label: '', start_date: '', end_date: '' };

export default function TermsTab() {
  const [terms,     setTerms]     = useState([]);
  const [courses,   setCourses]   = useState([]);
  const [offerings, setOfferings] = useState({});   // termId → [offering]
  const [expanded,  setExpanded]  = useState({});   // termId → bool
  const [loading,   setLoading]   = useState(true);
  const [addingTerm, setAddingTerm] = useState(false);
  const [savingTerm, setSavingTerm] = useState(false);
  const [termForm,   setTermForm]  = useState(EMPTY_TERM);
  const [addingOffer, setAddingOffer] = useState({});  // termId → courseId
  const [savingOffer, setSavingOffer] = useState(null); // termId being saved

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [tRes, cRes] = await Promise.all([
        api.get('/institution/terms'),
        api.get('/institution/course-list'),
      ]);
      setTerms(tRes.terms ?? []);
      setCourses(cRes.courses ?? []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadOfferings(termId) {
    try {
      const res = await api.get(`/institution/course-offerings?termId=${termId}`);
      setOfferings(prev => ({ ...prev, [termId]: res.offerings ?? [] }));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleToggleExpand(termId) {
    const next = !expanded[termId];
    setExpanded(prev => ({ ...prev, [termId]: next }));
    if (next && !offerings[termId]) await loadOfferings(termId);
  }

  async function handleAddTerm() {
    if (!termForm.label.trim()) return toast('Term label is required', 'error');
    setSavingTerm(true);
    try {
      const res = await api.post('/institution/terms', {
        label:      termForm.label.trim(),
        start_date: termForm.start_date || null,
        end_date:   termForm.end_date   || null,
      });
      setTerms(prev => [res.term, ...prev]);
      setTermForm(EMPTY_TERM);
      setAddingTerm(false);
      toast('Term created', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingTerm(false);
    }
  }

  async function handleToggleActive(term) {
    try {
      const res = await api.patch(`/institution/terms/${term.id}`, {
        is_active: !term.is_active,
      });
      setTerms(prev => prev.map(t => t.id === term.id ? res.term : t));
      toast(res.term.is_active ? 'Term reactivated' : 'Term archived', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleDeleteTerm(term) {
    if (!confirm(`Delete "${term.label}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/institution/terms/${term.id}`);
      setTerms(prev => prev.filter(t => t.id !== term.id));
      toast('Term deleted', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleAddOffering(termId) {
    const courseId = addingOffer[termId];
    if (!courseId) return toast('Select a course', 'error');
    setSavingOffer(termId);
    try {
      await api.post('/institution/course-offerings', { courseId, termId });
      await loadOfferings(termId);
      setTerms(prev => prev.map(t =>
        t.id === termId ? { ...t, offering_count: (t.offering_count ?? 0) + 1 } : t
      ));
      setAddingOffer(prev => ({ ...prev, [termId]: '' }));
      toast('Course added to term', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingOffer(null);
    }
  }

  async function handleRemoveOffering(termId, offeringId) {
    try {
      await api.delete(`/institution/course-offerings/${offeringId}`);
      setOfferings(prev => ({
        ...prev,
        [termId]: (prev[termId] ?? []).filter(o => o.id !== offeringId),
      }));
      setTerms(prev => prev.map(t =>
        t.id === termId ? { ...t, offering_count: Math.max(0, (t.offering_count ?? 1) - 1) } : t
      ));
      toast('Course removed from term', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;

  const offeredIds = (termId) => new Set((offerings[termId] ?? []).map(o => o.course_id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Terms</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Academic terms and their course offerings
          </p>
        </div>
        {!addingTerm && (
          <button
            onClick={() => setAddingTerm(true)}
            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white
                       text-sm font-medium rounded-lg transition-colors"
          >
            + New term
          </button>
        )}
      </div>

      {/* Add term form */}
      {addingTerm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <p className="text-sm font-medium text-gray-700">New term</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Label <span className="text-red-500">*</span>
              </label>
              <input
                value={termForm.label}
                onChange={e => setTermForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Fall 2026"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start date</label>
              <input
                type="date"
                value={termForm.start_date}
                onChange={e => setTermForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End date</label>
              <input
                type="date"
                value={termForm.end_date}
                onChange={e => setTermForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setAddingTerm(false); setTermForm(EMPTY_TERM); }}
              className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddTerm}
              disabled={savingTerm}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm
                         font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {savingTerm ? 'Creating…' : 'Create term'}
            </button>
          </div>
        </div>
      )}

      {/* Term list */}
      {terms.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">
          No terms yet — create one to get started
        </div>
      ) : (
        <div className="space-y-3">
          {terms.map(term => (
            <div key={term.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Term header row */}
              <div className="flex items-center gap-4 px-4 py-3">
                <button
                  onClick={() => handleToggleExpand(term.id)}
                  className="text-gray-400 hover:text-gray-600 text-sm w-4 shrink-0"
                >
                  {expanded[term.id] ? '▾' : '▸'}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm">{term.label}</span>
                    {!term.is_active && (
                      <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">
                        archived
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {term.start_date
                      ? `${term.start_date} → ${term.end_date ?? 'no end'}`
                      : 'No dates set'}
                    {' · '}
                    {term.offering_count ?? 0} course{term.offering_count !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => handleToggleActive(term)}
                    className="text-xs text-gray-400 hover:text-gray-700"
                  >
                    {term.is_active ? 'Archive' : 'Restore'}
                  </button>
                  {(term.offering_count ?? 0) === 0 && (
                    <button
                      onClick={() => handleDeleteTerm(term)}
                      className="text-xs text-gray-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Offerings section */}
              {expanded[term.id] && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                  {(offerings[term.id] ?? []).length === 0 && !savingOffer ? (
                    <p className="text-xs text-gray-400 py-1">No courses in this term yet</p>
                  ) : (
                    <div className="space-y-1">
                      {(offerings[term.id] ?? []).map(o => (
                        <div key={o.id} className="flex items-center justify-between py-1">
                          <span className="text-sm font-mono text-gray-800">
                            {o.code}
                            {o.name && <span className="text-gray-400 font-sans ml-2 text-xs">{o.name}</span>}
                          </span>
                          <button
                            onClick={() => handleRemoveOffering(term.id, o.id)}
                            className="text-xs text-gray-400 hover:text-red-600 ml-4"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add course to term */}
                  <div className="flex gap-2 pt-1">
                    <select
                      value={addingOffer[term.id] ?? ''}
                      onChange={e => setAddingOffer(prev => ({ ...prev, [term.id]: e.target.value }))}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm
                                 focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                    >
                      <option value="">Select a course…</option>
                      {courses
                        .filter(c => !offeredIds(term.id).has(c.id))
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            {c.code}{c.name ? ` — ${c.name}` : ''}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => handleAddOffering(term.id)}
                      disabled={savingOffer === term.id || !addingOffer[term.id]}
                      className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white text-xs
                                 font-medium rounded disabled:opacity-40 transition-colors"
                    >
                      {savingOffer === term.id ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
