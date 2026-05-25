import { useState, useEffect } from 'react';
import { api }   from '../../lib/api.js';
import { toast } from '../ui/Toast.jsx';
import Spinner   from '../ui/Spinner.jsx';

const EXAM_TYPES = [
  { value: 'midterm',    label: 'Midterm' },
  { value: 'final',      label: 'Final' },
  { value: 'quiz_1',     label: 'Quiz 1' },
  { value: 'quiz_2',     label: 'Quiz 2' },
  { value: 'quiz_3',     label: 'Quiz 3' },
  { value: 'quiz_4',     label: 'Quiz 4' },
  { value: 'test_1',     label: 'Test 1' },
  { value: 'test_2',     label: 'Test 2' },
  { value: 'test_3',     label: 'Test 3' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'other',      label: 'Other'      },
];

const EMPTY_FORM = {
  studentProfileId: '',
  courseId: '',
  examDate: '',
  examTime: '',
  examType: 'midterm',
  examDurationMins: '',
  specialMaterialsNote: '',
  mode: 'direct_confirm',
};

function CreateBookingModal({ onClose, onCreated }) {
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [students,    setStudents]    = useState([]);
  const [courses,     setCourses]     = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [stuSearch,   setStuSearch]   = useState('');

  useEffect(() => {
    api.get('/institution/students')
      .then(s => setStudents(s.students ?? []))
      .catch(err => toast(err.message, 'error'));
  }, []);

  useEffect(() => {
    if (!form.studentProfileId) { setCourses([]); return; }
    setLoadingCourses(true);
    set('courseId', '');
    api.get(`/institution/students/${form.studentProfileId}/courses`)
      .then(res => setCourses(res.courses ?? []))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoadingCourses(false));
  }, [form.studentProfileId]); // eslint-disable-line

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  const sq = stuSearch.toLowerCase().trim();
  const visibleStudents = sq
    ? students.filter(s =>
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(sq) ||
        (s.student_number ?? '').toLowerCase().includes(sq) ||
        s.email.toLowerCase().includes(sq))
    : students;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.studentProfileId) return toast('Select a student', 'error');
    if (!form.courseId)         return toast('Select a course', 'error');
    if (!form.examDate)         return toast('Enter an exam date', 'error');
    if (!form.examDurationMins) return toast('Enter base duration', 'error');

    setSaving(true);
    try {
      const res = await api.post('/institution/bookings', {
        ...form,
        examDurationMins: Number(form.examDurationMins),
        examTime: form.examTime || undefined,
        specialMaterialsNote: form.specialMaterialsNote || undefined,
      });
      toast(form.mode === 'direct_confirm' ? 'Booking confirmed' : 'Request sent to professor');
      onCreated(res.data.status);
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Create booking on behalf of student</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Student */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Student <span className="text-red-500">*</span></label>
            <input
              type="search"
              value={stuSearch}
              onChange={e => setStuSearch(e.target.value)}
              placeholder="Search by name, number, or email…"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm mb-1.5
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
            <select
              value={form.studentProfileId}
              onChange={e => set('studentProfileId', e.target.value)}
              size={Math.min(visibleStudents.length + 1, 5)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="">— select —</option>
              {visibleStudents.map(s => (
                <option key={s.student_profile_id} value={s.student_profile_id}>
                  {s.last_name}, {s.first_name}{s.student_number ? ` (#${s.student_number})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Course */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Course <span className="text-red-500">*</span></label>
            <select
              value={form.courseId}
              onChange={e => set('courseId', e.target.value)}
              disabled={!form.studentProfileId || loadingCourses}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">
                {!form.studentProfileId ? '— select a student first —' : loadingCourses ? 'Loading…' : courses.length === 0 ? 'No courses found' : '— select —'}
              </option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.code}{c.name ? ` — ${c.name}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Exam date <span className="text-red-500">*</span></label>
              <input type="date" value={form.examDate} onChange={e => set('examDate', e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Exam time <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="time" value={form.examTime} onChange={e => set('examTime', e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600" />
            </div>
          </div>

          {/* Type + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Exam type <span className="text-red-500">*</span></label>
              <select value={form.examType} onChange={e => set('examType', e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600">
                {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Base duration (mins) <span className="text-red-500">*</span></label>
              <input type="number" min="1" max="600" value={form.examDurationMins}
                onChange={e => set('examDurationMins', e.target.value)}
                placeholder="e.g. 120"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600" />
            </div>
          </div>

          {/* Special materials */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Special materials note <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea value={form.specialMaterialsNote} onChange={e => set('specialMaterialsNote', e.target.value)}
              rows={2} placeholder="e.g. Needs calculator, open book…"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none" />
          </div>

          {/* Mode */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700">Approval mode <span className="text-red-500">*</span></label>
            {[
              { value: 'direct_confirm', label: 'Confirm directly', desc: 'Booking is confirmed immediately — no professor involvement' },
              { value: 'send_to_prof',   label: 'Send to professor', desc: 'Creates a pending request — professor reviews and approves/rejects' },
            ].map(opt => (
              <label key={opt.value} className="flex items-start gap-2.5 cursor-pointer">
                <input type="radio" name="mode" value={opt.value} checked={form.mode === opt.value}
                  onChange={() => set('mode', opt.value)} className="mt-0.5 accent-brand-600" />
                <div>
                  <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                  <p className="text-xs text-gray-500">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm
                         font-medium rounded-lg disabled:opacity-50 transition-colors">
              {saving ? 'Creating…' : form.mode === 'direct_confirm' ? 'Confirm booking' : 'Send to professor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const TABS = [
  { key: 'pending',   label: 'Pending',   param: undefined },
  { key: 'confirmed', label: 'Confirmed', param: 'confirmed' },
  { key: 'cancelled', label: 'Cancelled / Rejected', param: 'cancelled' },
];

function DurationBadge({ r }) {
  if (!r.computed_duration_mins) {
    return <span className="text-xs text-gray-400">Duration unknown</span>;
  }
  return (
    <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded inline-block">
      {r.computed_duration_mins} min total
      {r.base_duration_mins > 0 && (
        <>
          {' '}({r.base_duration_mins} base
          {r.extra_mins > 0 && ` + ${r.extra_mins} extra`}
          {r.stb_mins   > 0 && ` + ${r.stb_mins} STB`})
        </>
      )}
    </span>
  );
}

function ApprovalBadge({ r }) {
  if (r.status === 'confirmed') {
    if (!r.confirmed_by_first) {
      return (
        <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded font-medium">
          Auto-approved
        </span>
      );
    }
    return (
      <span className="text-xs text-gray-500">
        Confirmed by <span className="font-medium text-gray-700">{r.confirmed_by_first} {r.confirmed_by_last}</span>
        {r.confirmed_at && (
          <> · {new Date(r.confirmed_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</>
        )}
      </span>
    );
  }
  if (r.status === 'professor_rejected') {
    return (
      <div className="space-y-0.5">
        <span className="text-xs text-red-500 font-medium">Rejected by professor</span>
        {r.rejection_reason && (
          <p className="text-xs text-gray-500 italic">"{r.rejection_reason}"</p>
        )}
      </div>
    );
  }
  if (r.status === 'cancelled') {
    return (
      <div className="space-y-0.5">
        <span className="text-xs text-gray-500 font-medium">Cancelled</span>
        {r.cancel_student_reason && (
          <p className="text-xs text-gray-500">
            <span className="font-medium text-gray-600">Student:</span>{' '}
            <span className="italic">"{r.cancel_student_reason}"</span>
          </p>
        )}
        {r.cancel_admin_reason && (
          <p className="text-xs text-gray-500">
            <span className="font-medium text-gray-600">Admin note:</span>{' '}
            <span className="italic">"{r.cancel_admin_reason}"</span>
          </p>
        )}
        {!r.cancel_student_reason && !r.cancel_admin_reason && (
          <p className="text-xs text-gray-400">No reason provided</p>
        )}
      </div>
    );
  }
  return null;
}

export default function BookingsTab() {
  const [activeTab,   setActiveTab]   = useState('pending');
  const [date,        setDate]        = useState('');
  const [bookings,    setBookings]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [acting,      setActing]      = useState(null);
  const [search,      setSearch]      = useState('');
  const [showCreate,  setShowCreate]  = useState(false);

  const currentTab = TABS.find(t => t.key === activeTab);

  function fetchBookings(tab, d) {
    setLoading(true);
    const qs = new URLSearchParams();
    if (tab.param) qs.set('status', tab.param);
    if (d) qs.set('date', d);
    const query = qs.toString() ? `?${qs}` : '';
    api.get(`/institution/bookings${query}`)
      .then(res => setBookings(res.data ?? []))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setSearch('');
    fetchBookings(currentTab, date);
  }, [activeTab, date]); // eslint-disable-line

  async function handleConfirm(id) {
    setActing(id);
    try {
      await api.patch(`/institution/bookings/${id}/confirm`, {});
      setBookings(prev => prev.filter(b => b.id !== id));
      toast('Booking confirmed');
    } catch (err) {
      toast(err.message, 'error');
    } finally { setActing(null); }
  }

  async function handleCancel(id) {
    setActing(id);
    try {
      await api.patch(`/institution/bookings/${id}/cancel`, {});
      setBookings(prev => prev.filter(b => b.id !== id));
      toast('Booking cancelled');
    } catch (err) {
      toast(err.message, 'error');
    } finally { setActing(null); }
  }

  const q = search.toLowerCase().trim();
  const visible = q
    ? bookings.filter(b =>
        `${b.first_name} ${b.last_name}`.toLowerCase().includes(q) ||
        (b.student_number ?? '').toLowerCase().includes(q) ||
        b.course_code.toLowerCase().includes(q),
      )
    : bookings;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Exam Booking Requests</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {activeTab === 'pending'   && 'Professor-approved requests awaiting your confirmation'}
            {activeTab === 'confirmed' && 'Confirmed bookings — auto-approved or manually confirmed'}
            {activeTab === 'cancelled' && 'Cancelled or professor-rejected requests'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Student, number, or course…"
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-52
                       focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <label className="text-xs text-gray-500">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5
                       focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {date && (
            <button
              onClick={() => setDate('')}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white text-sm
                       font-medium rounded-lg transition-colors"
          >
            + Create booking
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px
              ${activeTab === t.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : !bookings.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm font-medium text-gray-700">
            {activeTab === 'pending'   && 'No pending bookings'}
            {activeTab === 'confirmed' && 'No confirmed bookings'}
            {activeTab === 'cancelled' && 'No cancelled or rejected bookings'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {date
              ? `None on ${new Date(date + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : activeTab === 'pending' ? 'Professor-approved exam requests will appear here.' : ''}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            {visible.length !== bookings.length
              ? `${visible.length} of ${bookings.length} request${bookings.length !== 1 ? 's' : ''}`
              : `${bookings.length} request${bookings.length !== 1 ? 's' : ''}`}
          </p>
          {visible.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
              No bookings match your search
            </div>
          )}
          {visible.map(r => {
            const examDateStr = new Date(r.exam_date + 'T12:00:00').toLocaleDateString('en-CA', {
              year: 'numeric', month: 'short', day: 'numeric',
            });
            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-gray-900">{r.course_code}</span>
                      <span className="text-xs text-gray-500 capitalize bg-gray-100 px-1.5 py-0.5 rounded">
                        {r.exam_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">
                      {r.first_name} {r.last_name}
                      {r.student_number ? ` · #${r.student_number}` : ''}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {examDateStr}
                      {r.exam_time ? ` at ${r.exam_time.slice(0, 5)}` : ''}
                    </p>
                    <div className="mt-1">
                      <DurationBadge r={r} />
                    </div>
                    {r.special_materials_note && (
                      <p className="text-xs text-gray-500 mt-1 italic">{r.special_materials_note}</p>
                    )}
                    {activeTab !== 'pending' && (
                      <div className="mt-1.5">
                        <ApprovalBadge r={r} />
                      </div>
                    )}
                  </div>
                  {activeTab === 'pending' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleConfirm(r.id)}
                        disabled={acting === r.id}
                        className="px-3 py-1.5 text-xs font-medium text-green-700 border border-green-300
                                   rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
                      >
                        {acting === r.id ? '…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => handleCancel(r.id)}
                        disabled={acting === r.id}
                        className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200
                                   rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {acting === r.id ? '…' : 'Cancel'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateBookingModal
          onClose={() => setShowCreate(false)}
          onCreated={(status) => {
            const targetTab = status === 'confirmed' ? 'confirmed' : 'pending';
            setActiveTab(targetTab);
            fetchBookings(TABS.find(t => t.key === targetTab), date);
          }}
        />
      )}
    </div>
  );
}
