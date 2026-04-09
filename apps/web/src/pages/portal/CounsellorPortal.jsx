import { useState, useEffect, useRef } from 'react';
import { useNavigate }                from 'react-router-dom';
import { useAuth }                    from '../../hooks/useAuth.js';
import { api }                        from '../../lib/api.js';
import { toast }                      from '../../components/ui/Toast.jsx';
import Spinner                        from '../../components/ui/Spinner.jsx';

export default function CounsellorPortal() {
  const { user, logout }         = useAuth();
  const navigate                 = useNavigate();
  const [selectedStudent, setSelectedStudent] = useState(null);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-brand-800">Clearpath</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              Counsellor portal
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{user?.email}</span>
            <button
              onClick={async () => { await logout(); navigate('/login'); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-6">

        {selectedStudent ? (
          <StudentDetail
            student={selectedStudent}
            onBack={() => setSelectedStudent(null)}
          />
        ) : (
          <StudentSearch onSelect={setSelectedStudent} />
        )}

      </div>
    </div>
  );
}

// ── Student search ────────────────────────────────────────────────────────────
function StudentSearch({ onSelect }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef              = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (!q) { setResults([]); return; }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.get(`/counsellor/students?q=${encodeURIComponent(q)}`);
        setResults(data.students ?? []);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [query]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Students</h1>

      <div className="relative mb-4">
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, student number, or email…"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-600 pr-10"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent
                            rounded-full animate-spin" />
          </div>
        )}
      </div>

      {query.trim() && !loading && results.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">
          No students found matching &quot;{query.trim()}&quot;
        </p>
      )}

      {!query.trim() && (
        <p className="text-sm text-gray-400 text-center py-8">
          Search by name, student number, or email to get started
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-1">
          {results.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              className="w-full text-left px-4 py-3 bg-white rounded-xl border
                         border-gray-200 hover:border-brand-300 hover:bg-brand-50
                         transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {s.first_name} {s.last_name}
                  </span>
                  {s.student_number && (
                    <span className="ml-2 text-xs text-gray-400">#{s.student_number}</span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{s.email}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Student detail ────────────────────────────────────────────────────────────
function StudentDetail({ student: initialStudent, onBack }) {
  const { isCounsellor, isAdmin } = useAuth();
  const [student,  setStudent]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [codes,    setCodes]    = useState([]);
  const [exams,    setExams]    = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ accommodationCodeId: '', term: '', notes: '' });
  const [saving,   setSaving]   = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [studentData, codesData, examsData] = await Promise.all([
        api.get(`/counsellor/students/${initialStudent.id}`),
        api.get('/counsellor/accommodation-codes'),
        api.get(`/counsellor/students/${initialStudent.id}/exams`),
      ]);
      setStudent(studentData.student);
      setCodes(codesData.codes ?? []);
      setExams(examsData.exams ?? []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [initialStudent.id]); // eslint-disable-line

  async function handleAddAccommodation(e) {
    e.preventDefault();
    if (!form.accommodationCodeId || !form.term.trim()) {
      toast('Please select a code and enter a term', 'warning');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/counsellor/students/${initialStudent.id}/accommodations`, {
        accommodationCodeId: form.accommodationCodeId,
        term: form.term.trim(),
        notes: form.notes || undefined,
      });
      toast('Accommodation added', 'success');
      setShowForm(false);
      setForm({ accommodationCodeId: '', term: '', notes: '' });
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(accId) {
    try {
      await api.delete(`/counsellor/students/${initialStudent.id}/accommodations/${accId}`);
      toast('Accommodation removed', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if (loading) return (
    <div className="flex justify-center py-12"><Spinner /></div>
  );

  const canEdit = isCounsellor || isAdmin;

  // Group accommodations by term
  const byTerm = (student?.accommodations ?? []).reduce((acc, row) => {
    (acc[row.term] = acc[row.term] ?? []).push(row);
    return acc;
  }, {});
  const terms = Object.keys(byTerm).sort((a, b) => b.localeCompare(a));

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700
                   mb-4 transition-colors"
      >
        ← Back to search
      </button>

      {/* Student header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {student.first_name} {student.last_name}
            </h2>
            <div className="flex flex-wrap gap-3 mt-1">
              {student.student_number && (
                <span className="text-sm text-gray-500">#{student.student_number}</span>
              )}
              <span className="text-sm text-gray-500">{student.email}</span>
              {student.phone && (
                <span className="text-sm text-gray-500">{student.phone}</span>
              )}
              {student.do_not_call && (
                <span className="text-xs font-medium px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                  Do not call
                </span>
              )}
            </div>
          </div>
        </div>
        {student.notes && (
          <p className="mt-3 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
            {student.notes}
          </p>
        )}
      </div>

      {/* Accommodations */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Accommodations</h3>
          {canEdit && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white
                         text-xs font-medium rounded-lg transition-colors"
            >
              + Add accommodation
            </button>
          )}
        </div>

        {/* Add form */}
        {showForm && (
          <form onSubmit={handleAddAccommodation}
                className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Term</label>
                <input
                  required
                  value={form.term}
                  onChange={e => setForm(prev => ({ ...prev, term: e.target.value }))}
                  placeholder="e.g. Winter 2026"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Accommodation
                </label>
                <select
                  required
                  value={form.accommodationCodeId}
                  onChange={e => setForm(prev => ({ ...prev, accommodationCodeId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="" disabled>Select accommodation…</option>
                  {codes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
                placeholder="Any relevant details…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm({ accommodationCodeId: '', term: '', notes: '' }); }}
                className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm
                           font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm
                           font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}

        {/* Accommodation list grouped by term */}
        {terms.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No accommodations recorded for this student
          </p>
        ) : (
          <div className="space-y-4">
            {terms.map(term => (
              <div key={term}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {term}
                </p>
                <div className="space-y-2">
                  {byTerm[term].map(acc => (
                    <AccommodationRow
                      key={acc.id}
                      acc={acc}
                      canRemove={canEdit}
                      onRemove={() => handleRemove(acc.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Exam bookings */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Exam bookings</h3>
        {exams.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No exam bookings found for this student
          </p>
        ) : (
          <div className="space-y-3">
            {exams.map(e => (
              <div key={e.appointment_id}
                   className={`rounded-lg border p-3 ${
                     e.is_cancelled
                       ? 'border-gray-100 bg-gray-50 opacity-60'
                       : 'border-gray-200 bg-white'
                   }`}>
                {/* Row 1: course + date + status */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-sm font-semibold text-gray-900 ${e.is_cancelled ? 'line-through' : ''}`}>
                      {e.course_code}
                    </span>
                    {e.exam_type && (
                      <span className="text-xs text-gray-400 capitalize">{e.exam_type}</span>
                    )}
                    {e.is_cancelled && (
                      <span className="text-xs font-medium px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                        Cancelled
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500">
                      {e.date
                        ? new Date(e.date).toLocaleDateString('en-CA', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })
                        : '—'}
                    </span>
                    {!e.is_cancelled && <ExamStatusBadge status={e.status} />}
                  </div>
                </div>
                {/* Row 2: room + time */}
                <p className="text-xs text-gray-500 mb-2">
                  {[
                    e.room_name,
                    e.start_time ? e.start_time.slice(0, 5) : null,
                    e.duration_mins ? `${e.duration_mins} min` : null,
                  ].filter(Boolean).join('  •  ')}
                </p>
                {/* Row 3: appointment accommodations */}
                {e.accommodations.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {e.accommodations.map(ac => (
                      <span key={ac.code}
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              ac.triggers_rwg_flag
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                        {ac.code} — {ac.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No accommodations on this booking</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AccommodationRow({ acc, canRemove, onRemove }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg
                    border border-gray-100 bg-gray-50">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full
          ${acc.triggers_rwg_flag
            ? 'bg-purple-100 text-purple-700'
            : 'bg-blue-100 text-blue-700'}`}>
          {acc.code}
        </span>
        <div className="min-w-0">
          <p className="text-sm text-gray-800">{acc.label}</p>
          {acc.notes && (
            <p className="text-xs text-gray-500 mt-0.5">{acc.notes}</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            Added by {acc.added_by_name ?? 'Admin'}
          </p>
        </div>
      </div>
      {canRemove && (
        <button
          onClick={onRemove}
          className="shrink-0 text-xs text-gray-400 hover:text-red-500
                     transition-colors px-2 py-1"
        >
          Remove
        </button>
      )}
    </div>
  );
}

const STATUS_COLOURS = {
  scheduled:  'bg-blue-100 text-blue-700',
  completed:  'bg-green-100 text-green-700',
  cancelled:  'bg-gray-100 text-gray-500',
  no_show:    'bg-red-100 text-red-700',
};

function ExamStatusBadge({ status }) {
  if (!status) return null;
  const colour = STATUS_COLOURS[status] ?? 'bg-gray-100 text-gray-500';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${colour}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
