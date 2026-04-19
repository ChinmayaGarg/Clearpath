import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { useAuth }             from '../../hooks/useAuth.js';
import { api }                 from '../../lib/api.js';
import { toast }               from '../../components/ui/Toast.jsx';
import Spinner                 from '../../components/ui/Spinner.jsx';
import UploadList              from '../../components/portal/UploadList.jsx';
import UploadForm              from '../../components/portal/UploadForm.jsx';
import ReuseRequests           from '../../components/portal/ReuseRequests.jsx';

const TABS = ['My uploads', 'Reuse requests', 'Exam requests', 'Notifications'];

export default function ProfessorPortal() {
  const { user, logout }       = useAuth();
  const navigate               = useNavigate();
  const [tab,      setTab]     = useState('My uploads');
  const [me,       setMe]      = useState(null);
  const [loading,  setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]  = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function loadMe() {
    try {
      const data = await api.get('/portal/me');
      setMe(data);
    } catch (err) {
      if (err.message.includes('professor profile')) {
        toast('No professor profile found for your account', 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMe(); }, []); // eslint-disable-line

  function refresh() {
    setRefreshKey(k => k + 1);
    loadMe();
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  const profile = me?.profile;
  const stats   = me?.stats;
  const unread  = me?.unread ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-brand-800">Clearpath</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              Professor portal
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

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">
            {profile
              ? `${profile.first_name} ${profile.last_name}`
              : 'Professor portal'
            }
          </h1>
          {profile?.department && (
            <p className="text-sm text-gray-500 mt-0.5">{profile.department}</p>
          )}
        </div>

        {/* Stat cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Submitted',  value: stats.submitted,     colour: 'text-green-700 bg-green-50 border-green-200'  },
              { label: 'Drafts',     value: stats.drafts,        colour: 'text-amber-700 bg-amber-50 border-amber-200'  },
              { label: 'Courses',    value: stats.courses,       colour: 'text-brand-800 bg-brand-50 border-brand-600 border-opacity-20' },
              { label: 'Unread',     value: unread,              colour: unread > 0 ? 'text-red-700 bg-red-50 border-red-200' : 'text-gray-500 bg-gray-50 border-gray-200' },
            ].map(({ label, value, colour }) => (
              <div key={label} className={`border rounded-xl px-4 py-3 ${colour}`}>
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-xs font-medium mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-5">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-brand-600 text-brand-800 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t}
              {t === 'Reuse requests' && me?.reuseCount > 0 && (
                <span className="ml-1.5 text-xs bg-amber-100 text-amber-700
                                 px-1.5 py-0.5 rounded-full">
                  {me.reuseCount}
                </span>
              )}
              {t === 'Notifications' && unread > 0 && (
                <span className="ml-1.5 text-xs bg-red-100 text-red-700
                                 px-1.5 py-0.5 rounded-full">
                  {unread}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'My uploads' && (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => { setEditId(null); setShowForm(true); }}
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white
                           text-sm font-medium rounded-lg transition-colors"
              >
                + New exam upload
              </button>
            </div>
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-5 h-5 border-2 border-brand-600
                                border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <UploadList
                key={refreshKey}
                onEdit={id => { setEditId(id); setShowForm(true); }}
                onRefresh={refresh}
              />
            )}
          </div>
        )}

        {tab === 'Reuse requests' && (
          <ReuseRequests key={refreshKey} onRefresh={refresh} />
        )}

        {tab === 'Exam requests' && <ProfessorExamRequestsTab />}

        {tab === 'Notifications' && (
          <NotificationsTab onRead={refresh} />
        )}


      </div>

      {/* Upload form modal */}
      {showForm && (
        <UploadForm
          uploadId={editId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); refresh(); }}
        />
      )}
    </div>
  );
}

function ProfessorExamRequestsTab() {
  const [requests,     setRequests]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [acting,       setActing]       = useState(null);
  const [rejectingId,  setRejectingId]  = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await api.get('/portal/exam-requests');
      setRequests(data.examRequests ?? []);
    } catch (err) {
      toast(err.message || 'Failed to load exam requests', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function handleApprove(id) {
    setActing(id);
    try {
      await api.patch(`/portal/exam-requests/${id}/approve`, {});
      toast('Request approved — forwarded to accommodation centre');
      load();
    } catch (err) {
      toast(err.message || 'Failed to approve request', 'error');
    } finally {
      setActing(null);
    }
  }

  async function handleReject(id) {
    if (!rejectReason.trim()) { toast('Enter a reason for rejection', 'warning'); return; }
    setActing(id);
    try {
      await api.patch(`/portal/exam-requests/${id}/reject`, { reason: rejectReason });
      toast('Request rejected');
      setRejectingId(null);
      setRejectReason('');
      load();
    } catch (err) {
      toast(err.message || 'Failed to reject request', 'error');
    } finally {
      setActing(null);
    }
  }

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <p className="text-sm font-medium text-gray-700">No pending exam requests</p>
        <p className="text-xs text-gray-400 mt-1">
          Student exam scheduling requests for your courses will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{requests.length} pending request{requests.length !== 1 ? 's' : ''}</p>
      {requests.map(r => (
        <div key={r.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          {/* Student-submitted details — professor should verify these */}
          <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1.5">
              Student-submitted details — please verify
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div>
                <span className="text-[10px] text-amber-600 uppercase tracking-wide">Course</span>
                <p className="text-sm font-semibold text-gray-900">{r.course_code}</p>
              </div>
              <div>
                <span className="text-[10px] text-amber-600 uppercase tracking-wide">Exam type</span>
                <p className="text-sm text-gray-800 capitalize">{r.exam_type.replace('_', ' ')}</p>
              </div>
              <div>
                <span className="text-[10px] text-amber-600 uppercase tracking-wide">Exam date</span>
                <p className="text-sm text-gray-800">
                  {new Date(r.exam_date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-amber-600 uppercase tracking-wide">Start time</span>
                <p className="text-sm text-gray-800">{r.exam_time ? r.exam_time.slice(0, 5) : <span className="text-gray-400 italic">not specified</span>}</p>
              </div>
              <div className="col-span-2">
                <span className="text-[10px] text-amber-600 uppercase tracking-wide">Exam duration (without accommodations)</span>
                <p className="text-sm text-gray-800">
                  {r.student_duration_mins ? `${r.student_duration_mins} min` : <span className="text-gray-400 italic">not specified</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-gray-600 font-medium">
                {r.first_name} {r.last_name}
                {r.student_number ? ` · #${r.student_number}` : ''}
              </p>
              {r.special_materials_note && (
                <p className="text-xs text-gray-500 mt-1 italic">{r.special_materials_note}</p>
              )}
            </div>
            {rejectingId !== r.id && (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleApprove(r.id)}
                  disabled={acting === r.id}
                  className="px-3 py-1.5 text-xs font-medium text-green-700 border border-green-300
                             rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => { setRejectingId(r.id); setRejectReason(''); }}
                  disabled={acting === r.id}
                  className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200
                             rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}
          </div>

          {rejectingId === r.id && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
              <textarea
                autoFocus
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={2}
                placeholder="Reason for rejection…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs
                           focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setRejectingId(null); setRejectReason(''); }}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleReject(r.id)}
                  disabled={acting === r.id}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-500
                             hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50"
                >
                  {acting === r.id ? 'Rejecting…' : 'Confirm rejection'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function NotificationsTab({ onRead }) {
  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    api.get('/portal/notifications')
      .then(d => setNotifications(d.notifications))
      .catch(console.error)
      .finally(() => setLoading(false));

    // Mark all read
    api.post('/portal/notifications/read', {}).catch(() => {});
    onRead();
  }, []); // eslint-disable-line

  const TYPE_META = {
    upload_needed:   { icon: '📋', label: 'Upload needed',   colour: 'border-l-amber-400 bg-amber-50'   },
    upload_received: { icon: '✓',  label: 'Upload received', colour: 'border-l-green-400 bg-green-50'   },
    reuse_requested: { icon: '🔄', label: 'Reuse requested', colour: 'border-l-blue-400 bg-blue-50'     },
    reuse_approved:  { icon: '✓',  label: 'Reuse approved',  colour: 'border-l-green-400 bg-green-50'   },
    reuse_denied:    { icon: '✕',  label: 'Reuse denied',    colour: 'border-l-red-400 bg-red-50'       },
  };

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  if (!notifications.length) return (
    <div className="text-center py-12 text-sm text-gray-400">
      No notifications yet
    </div>
  );

  return (
    <div className="space-y-2">
      {notifications.map(n => {
        const meta = TYPE_META[n.type] ?? { icon: '·', colour: 'border-l-gray-300 bg-gray-50' };
        return (
          <div key={n.id}
            className={`border-l-4 ${meta.colour} px-4 py-3 rounded-r-xl flex
                        items-start gap-3 ${!n.is_read ? 'font-medium' : ''}`}>
            <span className="text-base shrink-0">{meta.icon}</span>
            <div className="flex-1">
              <p className="text-sm text-gray-900">{n.message}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(n.created_at).toLocaleString('en-CA', {
                  month: 'short', day: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                })}
              </p>
            </div>
            {!n.is_read && (
              <span className="w-2 h-2 bg-brand-600 rounded-full shrink-0 mt-1" />
            )}
          </div>
        );
      })}
    </div>
  );
}

