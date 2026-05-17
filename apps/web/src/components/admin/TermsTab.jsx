import { useState, useEffect } from 'react';
import { api }   from '../../lib/api.js';
import { toast } from '../ui/Toast.jsx';
import Spinner   from '../ui/Spinner.jsx';

const EMPTY_TERM = { label: '', start_date: '', end_date: '' };

export default function TermsTab() {
  const [terms,        setTerms]        = useState([]);
  const [courses,      setCourses]      = useState([]);
  const [offerings,    setOfferings]    = useState({});   // termId → [offering]
  const [expanded,     setExpanded]     = useState({});   // termId → bool
  const [loading,      setLoading]      = useState(true);
  const [addingTerm,   setAddingTerm]   = useState(false);
  const [savingTerm,   setSavingTerm]   = useState(false);
  const [termForm,     setTermForm]     = useState(EMPTY_TERM);
  const [selected,     setSelected]     = useState({}); // termId → Set<courseId>
  const [search,       setSearch]       = useState({}); // termId → string
  const [savingOffer,  setSavingOffer]  = useState(null); // termId being saved

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [tRes, cRes] = await Promise.all([
        api.get('/institution/terms'),
        api.get('/institution/course-list?all=true'),
      ]);
      const fetchedTerms = tRes.terms ?? [];
      setTerms(fetchedTerms);
      setCourses((cRes.courses ?? []).filter(c => c.is_active));

      // Auto-expand the first active term
      const current = fetchedTerms.find(t => t.is_active);
      if (current) {
        setExpanded({ [current.id]: true });
        loadOfferings(current.id);
      }
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

  async function handleAddOfferings(termId) {
    const ids = [...(selected[termId] ?? new Set())];
    if (!ids.length) return toast('Select at least one course', 'error');
    setSavingOffer(termId);
    try {
      await Promise.all(ids.map(courseId =>
        api.post('/institution/course-offerings', { courseId, termId })
      ));
      await loadOfferings(termId);
      setTerms(prev => prev.map(t =>
        t.id === termId ? { ...t, offering_count: (t.offering_count ?? 0) + ids.length } : t
      ));
      setSelected(prev => ({ ...prev, [termId]: new Set() }));
      setSearch(prev => ({ ...prev, [termId]: '' }));
      toast(`${ids.length} course${ids.length > 1 ? 's' : ''} added to term`, 'success');
    } catch (err) {
      toast(err.message, 'error');
      await loadOfferings(termId); // refresh to show partial success if any
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

  function toggleCourse(termId, courseId) {
    setSelected(prev => {
      const next = new Set(prev[termId] ?? []);
      next.has(courseId) ? next.delete(courseId) : next.add(courseId);
      return { ...prev, [termId]: next };
    });
  }

  function toggleAll(termId, filteredIds, allChecked) {
    setSelected(prev => {
      const next = new Set(prev[termId] ?? []);
      if (allChecked) filteredIds.forEach(id => next.delete(id));
      else            filteredIds.forEach(id => next.add(id));
      return { ...prev, [termId]: next };
    });
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
          {terms.map(term => {
            const termOfferedIds  = offeredIds(term.id);
            const available       = courses.filter(c => !termOfferedIds.has(c.id));
            const q               = (search[term.id] ?? '').toLowerCase();
            const filtered        = q
              ? available.filter(c =>
                  c.code.toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q)
                )
              : available;
            const termSelected    = selected[term.id] ?? new Set();
            const filteredIds     = filtered.map(c => c.id);
            const allChecked      = filteredIds.length > 0 && filteredIds.every(id => termSelected.has(id));
            const someChecked     = filteredIds.some(id => termSelected.has(id));
            const selectedCount   = termSelected.size;

            return (
              <div key={term.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Term header row — entire row is clickable to expand */}
                <div
                  onClick={() => handleToggleExpand(term.id)}
                  className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <span className="text-gray-400 text-sm w-4 shrink-0 select-none">
                    {expanded[term.id] ? '▾' : '▸'}
                  </span>
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
                  <div
                    className="flex items-center gap-3 shrink-0"
                    onClick={e => e.stopPropagation()}
                  >
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
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-3">

                    {/* Current offerings */}
                    {(offerings[term.id] ?? []).length === 0 ? (
                      <p className="text-xs text-gray-400 py-1">No courses in this term yet</p>
                    ) : (
                      <div className="space-y-1">
                        {(offerings[term.id] ?? []).map(o => (
                          <div key={o.id} className="flex items-center justify-between py-1">
                            <span className="text-sm font-mono text-gray-800">
                              {o.code}
                              {o.name && (
                                <span className="text-gray-400 font-sans ml-2 text-xs">{o.name}</span>
                              )}
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

                    {/* Add courses — checklist */}
                    {available.length > 0 && (
                      <div className="pt-1 border-t border-gray-200 space-y-2">
                        <p className="text-xs font-medium text-gray-500 pt-1">Add courses</p>

                        {/* Search */}
                        <input
                          value={search[term.id] ?? ''}
                          onChange={e => setSearch(prev => ({ ...prev, [term.id]: e.target.value }))}
                          placeholder="Search by code or name…"
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm
                                     focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                        />

                        {/* Checklist */}
                        <div className="max-h-48 overflow-y-auto rounded border border-gray-200 bg-white divide-y divide-gray-100">
                          {/* Select all row */}
                          {filtered.length > 1 && (
                            <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={allChecked}
                                ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                                onChange={() => toggleAll(term.id, filteredIds, allChecked)}
                                className="rounded border-gray-300 text-brand-600 focus:ring-brand-600"
                              />
                              <span className="text-xs font-medium text-gray-500">
                                Select all ({filtered.length})
                              </span>
                            </label>
                          )}

                          {filtered.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-gray-400">No matching courses</p>
                          ) : (
                            filtered.map(c => (
                              <label
                                key={c.id}
                                className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={termSelected.has(c.id)}
                                  onChange={() => toggleCourse(term.id, c.id)}
                                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-600"
                                />
                                <span className="text-sm font-mono text-gray-800">{c.code}</span>
                                {c.name && (
                                  <span className="text-xs text-gray-400 truncate">{c.name}</span>
                                )}
                              </label>
                            ))
                          )}
                        </div>

                        {/* Add button */}
                        <button
                          onClick={() => handleAddOfferings(term.id)}
                          disabled={savingOffer === term.id || selectedCount === 0}
                          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white text-xs
                                     font-medium rounded disabled:opacity-40 transition-colors"
                        >
                          {savingOffer === term.id
                            ? 'Adding…'
                            : selectedCount > 0
                              ? `Add ${selectedCount} course${selectedCount > 1 ? 's' : ''}`
                              : 'Add courses'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
