import { useState, useEffect, useRef } from 'react';
import { useNavigate }                from 'react-router-dom';
import { useAuth }                    from '../../hooks/useAuth.js';
import { api }                        from '../../lib/api.js';
import { toast }                      from '../../components/ui/Toast.jsx';
import Spinner                        from '../../components/ui/Spinner.jsx';

const PORTAL_TABS = ['Students', 'Registrations'];

// Generate academic terms: Winter / Summer / Fall for current year ±2
// Returns strings like "Winter 2025", sorted chronologically
function generateTermOptions() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed

  // Current term
  const currentTerm =
    month <= 4 ? 'Winter' :
    month <= 8 ? 'Summer' : 'Fall';

  const seasons = ['Winter', 'Summer', 'Fall'];
  const terms   = [];

  for (let y = year - 2; y <= year + 2; y++) {
    for (const s of seasons) {
      terms.push(`${s} ${y}`);
    }
  }

  return { terms, currentTerm: `${currentTerm} ${year}` };
}

const { terms: TERM_OPTIONS, currentTerm: CURRENT_TERM } = generateTermOptions();

export default function CounsellorPortal() {
  const { user, logout }         = useAuth();
  const navigate                 = useNavigate();
  const [tab,             setTab]             = useState('Students');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedReg,     setSelectedReg]     = useState(null);

  function handleTabChange(t) {
    setTab(t);
    setSelectedStudent(null);
    setSelectedReg(null);
  }

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

        {/* Tab bar */}
        <div className="max-w-4xl mx-auto px-4 flex gap-1">
          {PORTAL_TABS.map(t => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                ${tab === t
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-6">

        {tab === 'Students' && (
          selectedStudent ? (
            <StudentDetail
              student={selectedStudent}
              onBack={() => setSelectedStudent(null)}
            />
          ) : (
            <StudentSearch onSelect={setSelectedStudent} />
          )
        )}

        {tab === 'Registrations' && (
          selectedReg ? (
            <RegistrationDetail
              reg={selectedReg}
              onBack={() => setSelectedReg(null)}
            />
          ) : (
            <RegistrationsTab onSelect={setSelectedReg} />
          )
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
  const [student,        setStudent]       = useState(null);
  const [loading,        setLoading]       = useState(true);
  const [codes,          setCodes]         = useState([]);
  const [exams,          setExams]         = useState([]);
  const [showForm,       setShowForm]      = useState(false);
  const [form,           setForm]          = useState({ accommodationCodeId: '', term: CURRENT_TERM, notes: '' });
  const [saving,         setSaving]        = useState(false);
  const [courses,           setCourses]          = useState([]);
  const [courseInput,       setCourseInput]      = useState('');
  const [savingCourse,      setSavingCourse]     = useState(false);
  const [showCourseForm,    setShowCourseForm]   = useState(false);
  const [examRequests,      setExamRequests]     = useState([]);
  const [profModal,         setProfModal]        = useState(null); // { courseCode, professor|null, loading }

  async function load() {
    setLoading(true);
    try {
      const [studentData, codesData, examsData, coursesData, examReqData] = await Promise.all([
        api.get(`/counsellor/students/${initialStudent.id}`),
        api.get('/counsellor/accommodation-codes'),
        api.get(`/counsellor/students/${initialStudent.id}/exams`),
        api.get(`/counsellor/students/${initialStudent.id}/courses`),
        api.get(`/counsellor/students/${initialStudent.id}/exam-requests`),
      ]);
      setStudent(studentData.student);
      setCodes(codesData.codes ?? []);
      setExams(examsData.exams ?? []);
      setCourses(coursesData.courses ?? []);
      setExamRequests(examReqData.examRequests ?? []);
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

    // Prevent duplicate extra-time or STB rates for the same term
    const selectedCode = codes.find(c => c.id === form.accommodationCodeId)?.code ?? '';
    const existingForTerm = (student?.accommodations ?? []).filter(a => a.term === form.term);
    if (/^\d+MIN\/HR$/.test(selectedCode)) {
      const conflict = existingForTerm.find(a => /^\d+MIN\/HR$/.test(a.code) && a.code !== selectedCode);
      if (conflict) {
        toast(`Student already has ${conflict.code} extra time for ${form.term}. Remove it first.`, 'error');
        return;
      }
    }
    if (/^\d+MIN\/HR STB$/.test(selectedCode)) {
      const conflict = existingForTerm.find(a => /^\d+MIN\/HR STB$/.test(a.code) && a.code !== selectedCode);
      if (conflict) {
        toast(`Student already has ${conflict.code} STB for ${form.term}. Remove it first.`, 'error');
        return;
      }
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
      setForm({ accommodationCodeId: '', term: CURRENT_TERM, notes: '' });
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

  async function handleAddCourse(e) {
    e.preventDefault();
    const code = courseInput.trim().toUpperCase();
    if (!code) { toast('Enter a course code', 'warning'); return; }
    setSavingCourse(true);
    try {
      await api.post(`/counsellor/students/${initialStudent.id}/courses`, { courseCode: code });
      toast('Course added', 'success');
      setCourseInput('');
      setShowCourseForm(false);
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingCourse(false);
    }
  }

  async function handleRemoveCourse(courseCode) {
    try {
      await api.delete(`/counsellor/students/${initialStudent.id}/courses/${encodeURIComponent(courseCode)}`);
      toast('Course removed', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleCourseClick(courseCode) {
    setProfModal({ courseCode, professor: null, loading: true });
    try {
      const data = await api.get(`/counsellor/courses/${encodeURIComponent(courseCode)}/professor`);
      setProfModal({ courseCode, professor: data.professor, loading: false });
    } catch (err) {
      setProfModal({ courseCode, professor: null, loading: false });
    }
  }

  if (loading) return (
    <div className="flex justify-center py-12"><Spinner /></div>
  );

  const canEdit        = isCounsellor || isAdmin;
  const canEditCourses = isAdmin;

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
                <select
                  required
                  value={form.term}
                  onChange={e => setForm(prev => ({ ...prev, term: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  {TERM_OPTIONS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
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
                  {codes.map(c => {
                    const existingForTerm = (student?.accommodations ?? []).filter(a => a.term === form.term);
                    const blocked =
                      (/^\d+MIN\/HR$/.test(c.code) && existingForTerm.some(a => /^\d+MIN\/HR$/.test(a.code) && a.code !== c.code)) ||
                      (/^\d+MIN\/HR STB$/.test(c.code) && existingForTerm.some(a => /^\d+MIN\/HR STB$/.test(a.code) && a.code !== c.code));
                    return (
                      <option key={c.id} value={c.id} disabled={blocked}>
                        {c.code} — {c.label}{blocked ? ' (conflicts with existing)' : ''}
                      </option>
                    );
                  })}
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
                onClick={() => { setShowForm(false); setForm({ accommodationCodeId: '', term: CURRENT_TERM, notes: '' }); }}
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

      {/* Courses */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Courses</h3>
          {canEditCourses && !showCourseForm && (
            <button
              onClick={() => setShowCourseForm(true)}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white
                         text-xs font-medium rounded-lg transition-colors"
            >
              + Add course
            </button>
          )}
        </div>

        {showCourseForm && (
          <form onSubmit={handleAddCourse} className="flex gap-2 mb-3">
            <input
              autoFocus
              value={courseInput}
              onChange={e => setCourseInput(e.target.value.toUpperCase())}
              placeholder="e.g. CSCI3110"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
            <button
              type="button"
              onClick={() => { setShowCourseForm(false); setCourseInput(''); }}
              className="px-3 py-2 border border-gray-300 text-gray-700 text-sm
                         rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingCourse}
              className="px-3 py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm
                         font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {savingCourse ? 'Adding…' : 'Add'}
            </button>
          </form>
        )}

        {courses.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No manually-added courses
          </p>
        ) : (
          <div className="space-y-1.5">
            {courses.map(c => (
              <div
                key={c.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg
                           border border-gray-100 bg-gray-50"
              >
                <button
                  onClick={() => handleCourseClick(c.course_code)}
                  className="text-sm font-medium text-brand-700 hover:text-brand-900
                             hover:underline transition-colors text-left"
                >
                  {c.course_code}
                </button>
                {canEditCourses && (
                  <button
                    onClick={() => handleRemoveCourse(c.course_code)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Exam booking requests */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Exam requests</h3>
        {examRequests.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No exam requests from this student
          </p>
        ) : (
          <div className="space-y-2">
            {examRequests.map(r => (
              <div key={r.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{r.course_code}</span>
                      <span className="text-xs text-gray-400 capitalize">{r.exam_type.replace('_', ' ')}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(r.exam_date)}
                      {r.exam_time ? ` at ${r.exam_time.slice(0, 5)}` : ''}
                      {' · '}Submitted {formatDate(r.created_at)}
                    </p>
                    {r.computed_duration_mins ? (
                      <p className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded mt-1.5 inline-block">
                        {r.computed_duration_mins} min total
                        {r.base_duration_mins ? (
                          <>
                            {' '}({r.base_duration_mins} min base
                            {r.extra_mins > 0 && ` + ${r.extra_mins} min extra time`}
                            {r.stb_mins   > 0 && ` + ${r.stb_mins} min STB`})
                          </>
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1.5">Duration unknown — exam not yet uploaded</p>
                    )}
                    {r.special_materials_note && (
                      <p className="text-xs text-gray-500 mt-1 italic">{r.special_materials_note}</p>
                    )}
                    {r.rejection_reason && (
                      <p className="text-xs text-red-500 mt-1">Rejected: {r.rejection_reason}</p>
                    )}
                  </div>
                  <BookingRequestStatusBadge status={r.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Professor modal */}
      {profModal && (
        <ProfessorModal
          courseCode={profModal.courseCode}
          professor={profModal.professor}
          loading={profModal.loading}
          onClose={() => setProfModal(null)}
        />
      )}

      {/* SARS appointment bookings */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Scheduled appointments</h3>
        {exams.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No scheduled appointments found for this student
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
                <p className="text-xs text-gray-500 mb-2">
                  {[
                    e.room_name,
                    e.start_time ? e.start_time.slice(0, 5) : null,
                    e.duration_mins ? `${e.duration_mins} min` : null,
                  ].filter(Boolean).join('  •  ')}
                </p>
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

const BOOKING_REQUEST_STATUS = {
  pending:             { label: 'Awaiting professor',  cls: 'bg-yellow-100 text-yellow-700' },
  professor_approved:  { label: 'Professor approved',  cls: 'bg-blue-100 text-blue-700'   },
  professor_rejected:  { label: 'Professor rejected',  cls: 'bg-red-100 text-red-600'     },
  confirmed:           { label: 'Confirmed',           cls: 'bg-green-100 text-green-700' },
  cancelled:           { label: 'Cancelled',           cls: 'bg-gray-100 text-gray-400'   },
};

function BookingRequestStatusBadge({ status }) {
  const s = BOOKING_REQUEST_STATUS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' };
  return (
    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ── Professor modal ────────────────────────────────────────────────────────────
function ProfessorModal({ courseCode, professor, loading, onClose }) {
  // Close on backdrop click
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center
                 bg-black/40 backdrop-blur-sm px-4"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{courseCode}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Professor details</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : professor ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Name</span>
              <span className="text-gray-900 font-medium">
                {professor.first_name} {professor.last_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Phone</span>
              <span className="text-gray-700">{professor.phone || '—'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400 shrink-0">Email</span>
              {professor.email
                ? <a href={`mailto:${professor.email}`} className="text-brand-700 hover:underline truncate">{professor.email}</a>
                : <span className="text-gray-700">—</span>
              }
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-6">
            No professor linked to <span className="font-medium text-gray-600">{courseCode}</span> yet.
          </p>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full py-2 border border-gray-200 text-gray-600 text-sm
                     font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          Close
        </button>
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

// ── Registration status badge ─────────────────────────────────────────────────
const REG_STATUS_COLOURS = {
  submitted:    'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  approved:     'bg-green-100 text-green-700',
  rejected:     'bg-red-100 text-red-700',
};

function RegStatusBadge({ status }) {
  if (!status) return null;
  const colour = REG_STATUS_COLOURS[status] ?? 'bg-gray-100 text-gray-500';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${colour}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ── Registrations tab ─────────────────────────────────────────────────────────
function RegistrationsTab({ onSelect }) {
  const [registrations, setRegistrations] = useState([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    api.get('/counsellor/registrations')
      .then(d => setRegistrations(d.registrations ?? []))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  if (registrations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <p className="text-sm font-medium text-gray-700">No pending registrations</p>
        <p className="text-xs text-gray-400 mt-1">
          New student registrations will appear here for review.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Registrations</h1>
      <div className="space-y-2">
        {registrations.map(r => (
          <button
            key={r.id}
            onClick={() => onSelect(r)}
            className="w-full text-left px-4 py-3 bg-white rounded-xl border
                       border-gray-200 hover:border-brand-300 hover:bg-brand-50 transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">
                      {r.first_name} {r.last_name}
                    </span>
                    <RegStatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{r.email}</p>
                  {r.disability_categories?.length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {r.disability_categories.slice(0, 3).join(', ')}
                      {r.disability_categories.length > 3 ? ` +${r.disability_categories.length - 3} more` : ''}
                    </p>
                  )}
                </div>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {formatDate(r.created_at)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Registration detail ────────────────────────────────────────────────────────
function RegistrationDetail({ reg: initialReg, onBack }) {
  const [reg,         setReg]         = useState(null);
  const [codes,       setCodes]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  // per-requested-accommodation decisions: { [index]: { decision: 'pending'|'accept'|'reject', codeId, notes } }
  const [requestedDecisions, setRequestedDecisions] = useState({});
  // counsellor-added grants not in the student's request: [{ codeId, notes }]
  const [additionalGrants,   setAdditionalGrants]   = useState([]);
  const [rejectReason,  setRejectReason]  = useState('');
  const [action,        setAction]        = useState(null); // 'approve' | 'reject' | null

  async function load() {
    setLoading(true);
    try {
      const [regData, codesData] = await Promise.all([
        api.get(`/counsellor/registrations/${initialReg.id}`),
        api.get('/counsellor/accommodation-codes'),
      ]);
      setReg(regData.registration);
      const codeList = codesData.codes ?? [];
      setCodes(codeList);
      // Initialise one pending decision per requested accommodation
      const reqAccs = regData.registration?.requested_accommodations ?? [];
      const initDecisions = {};
      reqAccs.forEach((_, i) => { initDecisions[i] = { decision: 'pending', codeId: '', notes: '' }; });
      setRequestedDecisions(initDecisions);
      setAdditionalGrants([]);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [initialReg.id]); // eslint-disable-line

  async function handleStartReview() {
    setSubmitting(true);
    try {
      await api.post(`/counsellor/registrations/${initialReg.id}/start-review`, {});
      toast('Marked as under review');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(e) {
    e.preventDefault();
    const grantedCodes = [];
    const seen = new Set();

    // Accepted requested accommodations
    Object.values(requestedDecisions).forEach(v => {
      if (v.decision === 'accept' && v.codeId && !seen.has(v.codeId)) {
        seen.add(v.codeId);
        grantedCodes.push({ accommodationCodeId: v.codeId, notes: v.notes || undefined });
      }
    });

    // Counsellor-added accommodations
    additionalGrants.forEach(g => {
      if (g.codeId && !seen.has(g.codeId)) {
        seen.add(g.codeId);
        grantedCodes.push({ accommodationCodeId: g.codeId, notes: g.notes || undefined });
      }
    });

    const pendingCount = Object.values(requestedDecisions).filter(v => v.decision === 'pending').length;
    if (pendingCount > 0) {
      const ok = window.confirm(
        `${pendingCount} requested accommodation${pendingCount !== 1 ? 's' : ''} ` +
        `still have no decision and will be treated as rejected. Continue?`
      );
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      await api.post(`/counsellor/registrations/${initialReg.id}/approve`, { grantedCodes });
      toast('Registration approved');
      onBack();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function setDecision(index, decision) {
    setRequestedDecisions(prev => ({
      ...prev,
      [index]: { ...(prev[index] ?? { codeId: '', notes: '' }), decision },
    }));
  }

  function updateDecision(index, patch) {
    setRequestedDecisions(prev => ({
      ...prev,
      [index]: { ...prev[index], ...patch },
    }));
  }

  function addAdditionalGrant() {
    setAdditionalGrants(prev => [...prev, { codeId: '', notes: '' }]);
  }

  function updateAdditionalGrant(index, patch) {
    setAdditionalGrants(prev => prev.map((g, i) => i === index ? { ...g, ...patch } : g));
  }

  function removeAdditionalGrant(index) {
    setAdditionalGrants(prev => prev.filter((_, i) => i !== index));
  }

  async function handleReject(e) {
    e.preventDefault();
    if (!rejectReason.trim()) { toast('Enter a rejection reason', 'warning'); return; }
    setSubmitting(true);
    try {
      await api.post(`/counsellor/registrations/${initialReg.id}/reject`, { reason: rejectReason });
      toast('Registration rejected');
      onBack();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleProviderForm(status) {
    try {
      await api.patch(`/counsellor/registrations/${initialReg.id}/provider-form`, { status });
      toast(`Provider form marked as ${status}`);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!reg) return null;

  const canAct = reg.status === 'submitted' || reg.status === 'under_review';

  return (
    <div>
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
      >
        ← Back to registrations
      </button>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-gray-900">
                {reg.first_name} {reg.last_name}
              </h2>
              <RegStatusBadge status={reg.status} />
            </div>
            <div className="flex flex-wrap gap-3 mt-1">
              <span className="text-sm text-gray-500">{reg.email}</span>
              {reg.student_number && (
                <span className="text-sm text-gray-500">#{reg.student_number}</span>
              )}
              {reg.phone && (
                <span className="text-sm text-gray-500">{reg.phone}</span>
              )}
            </div>
          </div>
          <span className="text-xs text-gray-400 flex-shrink-0">
            Submitted {formatDate(reg.created_at)}
          </span>
        </div>

        {/* Student status flags */}
        {reg.student_status_flags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {reg.student_status_flags.map(f => (
              <span key={f} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
                {f.replace('_', ' ')}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Disability info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Disability information</h3>

        {reg.disability_categories?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Categories</p>
            <div className="flex flex-wrap gap-1.5">
              {reg.disability_categories.map(c => (
                <span key={c} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{c}</span>
              ))}
            </div>
          </div>
        )}

        {reg.academic_impact && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Academic impact</p>
            <p className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg whitespace-pre-wrap">
              {reg.academic_impact}
            </p>
          </div>
        )}

        {reg.on_medication && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">On medication</p>
            {reg.medication_details ? (
              <p className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg">
                {reg.medication_details}
              </p>
            ) : (
              <p className="text-sm text-gray-500">Yes (no details provided)</p>
            )}
          </div>
        )}
      </div>

      {/* Accommodations requested */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Accommodations</h3>

        {reg.requested_accommodations?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Requested</p>
            <div className="flex flex-wrap gap-1.5">
              {reg.requested_accommodations.map(a => (
                <span key={a} className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">{a}</span>
              ))}
            </div>
          </div>
        )}

        {reg.past_accommodations?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Previous accommodations</p>
            <div className="flex flex-wrap gap-1.5">
              {reg.past_accommodations.map(a => (
                <span key={a} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{a}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Provider form */}
      {(reg.provider_name || reg.provider_phone) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Medical provider</h3>
              {reg.provider_name  && <p className="text-sm text-gray-600">{reg.provider_name}</p>}
              {reg.provider_phone && <p className="text-sm text-gray-500">{reg.provider_phone}</p>}
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize
                ${reg.provider_form_status === 'received' ? 'bg-green-100 text-green-700'
                : reg.provider_form_status === 'waived'   ? 'bg-gray-100 text-gray-500'
                                                          : 'bg-yellow-100 text-yellow-700'}`}>
                Form: {reg.provider_form_status ?? 'pending'}
              </span>
              {reg.provider_form_status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleProviderForm('received')}
                    className="text-xs text-green-600 hover:text-green-800 px-2 py-1 border border-green-200 rounded-lg"
                  >
                    Mark received
                  </button>
                  <button
                    onClick={() => handleProviderForm('waived')}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded-lg"
                  >
                    Waive
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rejection reason (if rejected) */}
      {reg.status === 'rejected' && reg.rejection_reason && (
        <div className="bg-red-50 rounded-xl border border-red-200 p-4 mb-4">
          <p className="text-xs font-medium text-red-700 mb-1">Rejection reason</p>
          <p className="text-sm text-red-800">{reg.rejection_reason}</p>
        </div>
      )}

      {/* Action panel */}
      {canAct && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Review actions</h3>
            {reg.status === 'submitted' && (
              <button
                onClick={handleStartReview}
                disabled={submitting}
                className="text-xs px-3 py-1.5 border border-yellow-300 text-yellow-700
                           hover:bg-yellow-50 rounded-lg transition-colors disabled:opacity-50"
              >
                Mark as under review
              </button>
            )}
          </div>

          {/* Toggle approve / reject */}
          <div className="flex gap-2">
            <button
              onClick={() => setAction(a => a === 'approve' ? null : 'approve')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors
                ${action === 'approve'
                  ? 'bg-green-600 text-white border-green-600'
                  : 'border-green-300 text-green-700 hover:bg-green-50'}`}
            >
              Approve
            </button>
            <button
              onClick={() => setAction(a => a === 'reject' ? null : 'reject')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors
                ${action === 'reject'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'border-red-300 text-red-700 hover:bg-red-50'}`}
            >
              Reject
            </button>
          </div>

          {/* Approve form */}
          {action === 'approve' && (
            <form onSubmit={handleApprove} className="space-y-4 pt-2 border-t border-gray-100">

              {/* ── Requested accommodations ── */}
              {reg.requested_accommodations?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Requested by student ({reg.requested_accommodations.length})
                  </p>
                  <div className="space-y-2">
                    {reg.requested_accommodations.map((reqText, i) => {
                      const d = requestedDecisions[i] ?? { decision: 'pending', codeId: '', notes: '' };
                      return (
                        <div key={i} className={`rounded-lg border p-3 transition-colors ${
                          d.decision === 'accept' ? 'border-green-200 bg-green-50' :
                          d.decision === 'reject' ? 'border-red-100 bg-red-50/60' :
                          'border-gray-200 bg-gray-50'
                        }`}>
                          {/* Request text + Accept / Reject buttons */}
                          <div className="flex items-start justify-between gap-3">
                            <span className={`text-sm flex-1 ${d.decision === 'reject' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                              {reqText}
                            </span>
                            <div className="flex gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setDecision(i, d.decision === 'accept' ? 'pending' : 'accept')}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                                  d.decision === 'accept'
                                    ? 'bg-green-600 text-white border-green-600'
                                    : 'border-green-300 text-green-700 hover:bg-green-50'
                                }`}
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => setDecision(i, d.decision === 'reject' ? 'pending' : 'reject')}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                                  d.decision === 'reject'
                                    ? 'bg-red-500 text-white border-red-500'
                                    : 'border-red-200 text-red-500 hover:bg-red-50'
                                }`}
                              >
                                Reject
                              </button>
                            </div>
                          </div>

                          {/* Code picker + notes when accepted */}
                          {d.decision === 'accept' && (
                            <div className="mt-2.5 pt-2.5 border-t border-green-200 space-y-2">
                              <select
                                value={d.codeId}
                                onChange={e => updateDecision(i, { codeId: e.target.value })}
                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs
                                           focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                              >
                                <option value="">Select accommodation code…</option>
                                {codes.map(c => (
                                  <option key={c.id} value={c.id}>
                                    {c.code} — {c.label}{c.triggers_rwg_flag ? ' (RWG)' : ''}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={d.notes}
                                onChange={e => updateDecision(i, { notes: e.target.value })}
                                placeholder="Notes / modifications (optional)"
                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs
                                           focus:outline-none focus:ring-2 focus:ring-brand-600"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Additional accommodations (counsellor-suggested) ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Additional accommodations
                  </p>
                  <button
                    type="button"
                    onClick={addAdditionalGrant}
                    className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                  >
                    + Add
                  </button>
                </div>
                {additionalGrants.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">
                    None — click + Add to grant accommodations the student did not request
                  </p>
                ) : (
                  <div className="space-y-2">
                    {additionalGrants.map((g, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <select
                          value={g.codeId}
                          onChange={e => updateAdditionalGrant(i, { codeId: e.target.value })}
                          className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs
                                     focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                        >
                          <option value="">Select code…</option>
                          {codes.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.code} — {c.label}{c.triggers_rwg_flag ? ' (RWG)' : ''}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={g.notes}
                          onChange={e => updateAdditionalGrant(i, { notes: e.target.value })}
                          placeholder="Notes (optional)"
                          className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs
                                     focus:outline-none focus:ring-2 focus:ring-brand-600"
                        />
                        <button
                          type="button"
                          onClick={() => removeAdditionalGrant(i)}
                          className="shrink-0 text-gray-400 hover:text-red-500 px-1 text-base leading-none"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 bg-green-600 hover:bg-green-700 text-white text-sm
                           font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? 'Approving…' : 'Confirm approval'}
              </button>
            </form>
          )}

          {/* Reject form */}
          {action === 'reject' && (
            <form onSubmit={handleReject} className="space-y-3 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Reason for rejection <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Explain why this registration is being rejected…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 bg-red-600 hover:bg-red-700 text-white text-sm
                           font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? 'Rejecting…' : 'Confirm rejection'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
