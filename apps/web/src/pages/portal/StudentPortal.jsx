import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { useAuth }             from '../../hooks/useAuth.js';
import { api }                 from '../../lib/api.js';
import { toast }               from '../../components/ui/Toast.jsx';
import Spinner                 from '../../components/ui/Spinner.jsx';

const EXAM_TYPES = ['midterm', 'final', 'quiz', 'assignment', 'other'];

const STATUS_BADGE = {
  pending:   'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-400',
};

const REG_STATUS_BADGE = {
  submitted:    'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  approved:     'bg-green-100 text-green-700',
  rejected:     'bg-red-100 text-red-700',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const d = new Date();
  d.setHours(parseInt(h, 10), parseInt(m, 10));
  return d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

// ── Accommodations tab ─────────────────────────────────────────────────────────
function AccommodationsTab({ me }) {
  const [grants,  setGrants]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/student/accommodations')
      .then(d => setGrants(d.data ?? []))
      .catch(() => toast('Failed to load accommodations', 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-12 flex justify-center"><Spinner /></div>;

  const regStatus    = me?.registration_status;
  const requested    = me?.requested_accommodations ?? [];

  // Not registered at all
  if (!regStatus) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-sm font-medium text-gray-700">No accommodations on file</p>
        <p className="text-xs text-gray-400 mt-1">
          You have not yet registered with the Accessibility Centre.
        </p>
        <a href="/register" className="mt-3 inline-block text-sm text-brand-600 hover:text-brand-800">
          Register now
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Requested accommodations — always shown once registered */}
      {requested.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Requested
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {requested.map((acc, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-4">
                <span className="text-sm text-gray-700">{acc}</span>
                {regStatus === 'approved' && grants.some(g => g.label === acc || g.code === acc) ? (
                  <span className="text-xs text-green-600 font-medium">Approved</span>
                ) : regStatus === 'approved' ? (
                  <span className="text-xs text-gray-400">Not granted</span>
                ) : regStatus === 'rejected' ? (
                  <span className="text-xs text-red-500">Not approved</span>
                ) : (
                  <span className="text-xs text-yellow-600">Pending review</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved grants */}
      {grants.length > 0 ? (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Active accommodations
          </h2>
          <div className="space-y-2">
            {grants.map(g => (
              <div key={g.id}
                   className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{g.label}</span>
                    <span className="text-xs text-gray-400 font-mono">{g.code}</span>
                    {g.triggers_rwg_flag && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">RWG</span>
                    )}
                  </div>
                  {g.notes && (
                    <p className="text-xs text-gray-500 mt-0.5">{g.notes}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  {g.expires_at ? (
                    <p className="text-xs text-gray-400">Expires {formatDate(g.expires_at)}</p>
                  ) : (
                    <p className="text-xs text-gray-300">No expiry</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : regStatus === 'approved' ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">No active accommodations</p>
          <p className="text-xs text-gray-400 mt-1">
            Your registration was approved but no codes have been assigned yet.
            Contact your accessibility counsellor.
          </p>
        </div>
      ) : regStatus === 'rejected' ? (
        <div className="bg-white rounded-xl border border-red-100 p-6 text-center">
          <p className="text-sm font-medium text-red-600">Registration not approved</p>
          <p className="text-xs text-gray-400 mt-1">
            Contact your accessibility centre for more information.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">Registration under review</p>
          <p className="text-xs text-gray-400 mt-1">
            Accommodations will appear here once a counsellor approves your registration.
          </p>
        </div>
      )}

    </div>
  );
}

// ── Exam requests tab ──────────────────────────────────────────────────────────
function ExamRequestsTab() {
  const [bookings,    setBookings]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [cancelling,  setCancelling]  = useState(null);

  async function load() {
    try {
      const d = await api.get('/student/exam-requests');
      setBookings(d.data ?? []);
    } catch {
      toast('Failed to load exam requests', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCancel(id) {
    setCancelling(id);
    try {
      await api.delete(`/student/exam-requests/${id}`);
      toast('Request cancelled');
      load();
    } catch (err) {
      toast(err.message || 'Could not cancel request', 'error');
    } finally {
      setCancelling(null);
    }
  }

  if (loading) return <div className="py-12 flex justify-center"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {bookings.length === 0 ? 'No exam requests yet.' : `${bookings.length} request${bookings.length !== 1 ? 's' : ''}`}
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white text-xs
                     font-medium rounded-lg transition-colors"
        >
          + Schedule exam
        </button>
      </div>

      {showForm && (
        <BookingForm
          onSuccess={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {bookings.map(b => (
        <div
          key={b.id}
          className={`bg-white rounded-xl border border-gray-200 px-4 py-3
            ${b.status === 'cancelled' ? 'opacity-50' : ''}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-800">{b.course_code}</span>
                <span className="text-xs text-gray-500 capitalize">{b.exam_type.replace('_', ' ')}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${STATUS_BADGE[b.status] ?? ''}`}>
                  {b.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatDate(b.exam_date)}
                {b.exam_time ? ` at ${formatTime(b.exam_time)}` : ''}
              </p>
              {b.special_materials_note && (
                <p className="text-xs text-gray-400 mt-1">{b.special_materials_note}</p>
              )}
            </div>
            {b.status === 'pending' && (
              <button
                onClick={() => handleCancel(b.id)}
                disabled={cancelling === b.id}
                className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 disabled:opacity-50"
              >
                {cancelling === b.id ? 'Cancelling…' : 'Cancel'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Booking form ───────────────────────────────────────────────────────────────
function BookingForm({ onSuccess, onCancel }) {
  const [form, setForm] = useState({
    courseCode:           '',
    examDate:             '',
    examTime:             '',
    examType:             'midterm',
    specialMaterialsNote: '',
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.courseCode.trim()) { setError('Course code is required.'); return; }
    if (!form.examDate)          { setError('Exam date is required.'); return; }

    setLoading(true);
    try {
      await api.post('/student/exam-requests', {
        courseCode:           form.courseCode,
        examDate:             form.examDate,
        examTime:             form.examTime || undefined,
        examType:             form.examType,
        specialMaterialsNote: form.specialMaterialsNote || undefined,
      });
      toast('Exam request submitted');
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  }

  // Minimum date = tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <div className="bg-white rounded-xl border border-brand-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">New exam request</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Course code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.courseCode}
              onChange={e => set('courseCode', e.target.value.toUpperCase())}
              placeholder="CSCI 3161"
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Exam type
            </label>
            <select
              value={form.examType}
              onChange={e => set('examType', e.target.value)}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
            >
              {EXAM_TYPES.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Exam date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.examDate}
              min={minDate}
              onChange={e => set('examDate', e.target.value)}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Start time (optional)
            </label>
            <input
              type="time"
              value={form.examTime}
              onChange={e => set('examTime', e.target.value)}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Special materials / notes (optional)
          </label>
          <textarea
            value={form.specialMaterialsNote}
            onChange={e => set('specialMaterialsNote', e.target.value)}
            rows={2}
            placeholder="e.g. calculator required, open-book"
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
          />
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-1.5 bg-brand-600 hover:bg-brand-800 text-white text-sm
                       font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
const TABS = ['Accommodations', 'Exam requests'];

export default function StudentPortal() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const [tab,     setTab]     = useState('Accommodations');
  const [me,      setMe]      = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/student/me')
      .then(d => setMe(d.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-brand-800">Clearpath</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              Student portal
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

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">
            {me ? `${me.first_name} ${me.last_name}` : user?.email}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {me?.student_number && (
              <span className="text-xs text-gray-400">{me.student_number}</span>
            )}
            {me?.registration_status && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize
                ${REG_STATUS_BADGE[me.registration_status] ?? 'bg-gray-100 text-gray-500'}`}>
                Registration: {me.registration_status.replace('_', ' ')}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
                ${tab === t
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'Accommodations' && <AccommodationsTab me={me} />}
        {tab === 'Exam requests'  && <ExamRequestsTab />}

      </div>
    </div>
  );
}
