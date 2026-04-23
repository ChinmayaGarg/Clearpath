import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { useAuth }             from '../../hooks/useAuth.js';
import { api }                 from '../../lib/api.js';
import { toast }               from '../../components/ui/Toast.jsx';
import Spinner                 from '../../components/ui/Spinner.jsx';
import UploadList              from '../../components/portal/UploadList.jsx';
import UploadForm              from '../../components/portal/UploadForm.jsx';
import ReuseRequests           from '../../components/portal/ReuseRequests.jsx';

const TABS = ['Dashboard', 'My uploads', 'My students', 'Reuse requests', 'Exam requests', 'Notifications'];

export default function ProfessorPortal() {
  const { user, logout }       = useAuth();
  const navigate               = useNavigate();
  const [tab,      setTab]     = useState('Dashboard');
  const [me,       setMe]      = useState(null);
  const [loading,  setLoading] = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [editId,     setEditId]     = useState(null);
  const [isWordDoc,  setIsWordDoc]  = useState(false);
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
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 h-14 shrink-0">
              <span className="font-semibold text-brand-800">Clearpath</span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                Professor portal
              </span>
            </div>
            <div className="flex h-14 overflow-x-auto">
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 text-sm font-medium border-b-2 transition-colors h-full whitespace-nowrap
                    ${tab === t
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {t}
                  {t === 'Reuse requests' && me?.reuseCount > 0 && (
                    <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                      {me.reuseCount}
                    </span>
                  )}
                  {t === 'Notifications' && unread > 0 && (
                    <span className="ml-1.5 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                      {unread}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
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

        {/* Tab content */}
        {tab === 'Dashboard' && (
          <div className="space-y-6">

            {/* Needs attention */}
            {stats && (() => {
              const alerts = [
                ...(stats.pendingRequests > 0 ? [{
                  key: 'requests',
                  value: stats.pendingRequests,
                  label: 'Exam request' + (stats.pendingRequests !== 1 ? 's' : '') + ' awaiting your approval',
                  sub: 'Students are waiting — approve or reject to proceed',
                  bg: 'bg-yellow-50 border-yellow-300',
                  numColour: 'text-yellow-700',
                  subColour: 'text-yellow-600',
                  onClick: () => setTab('Exam requests'),
                }] : []),
                ...(stats.missingUploads > 0 ? [{
                  key: 'missing',
                  value: stats.missingUploads,
                  label: 'Upcoming exam' + (stats.missingUploads !== 1 ? 's' : '') + ' without an upload',
                  sub: "Students are booked but you haven't submitted the exam yet",
                  bg: 'bg-red-50 border-red-300',
                  numColour: 'text-red-700',
                  subColour: 'text-red-500',
                  onClick: () => { setEditId(null); setIsWordDoc(false); setShowForm(true); },
                }] : []),
                ...(stats.pendingDropoffs > 0 ? [{
                  key: 'dropoffs',
                  value: stats.pendingDropoffs,
                  label: 'Exam' + (stats.pendingDropoffs !== 1 ? 's' : '') + ' marked for drop-off — not yet confirmed',
                  sub: 'The accessibility centre is waiting for your physical drop-off',
                  bg: 'bg-orange-50 border-orange-300',
                  numColour: 'text-orange-700',
                  subColour: 'text-orange-500',
                  onClick: () => setTab('My uploads'),
                }] : []),
                ...(stats.drafts > 0 ? [{
                  key: 'drafts',
                  value: stats.drafts,
                  label: 'Incomplete draft' + (stats.drafts !== 1 ? 's' : '') + ' — not yet submitted',
                  sub: 'Finish and submit so the centre receives your exam',
                  bg: 'bg-amber-50 border-amber-300',
                  numColour: 'text-amber-700',
                  subColour: 'text-amber-600',
                  onClick: () => setTab('My uploads'),
                }] : []),
                ...(stats.reuseCount > 0 ? [{
                  key: 'reuse',
                  value: stats.reuseCount,
                  label: 'Reuse request' + (stats.reuseCount !== 1 ? 's' : '') + ' awaiting your decision',
                  sub: 'Students have requested to reuse a previous exam',
                  bg: 'bg-blue-50 border-blue-300',
                  numColour: 'text-blue-700',
                  subColour: 'text-blue-500',
                  onClick: () => setTab('Reuse requests'),
                }] : []),
              ];

              return (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Needs attention</p>
                  {alerts.length === 0 ? (
                    <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                      <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                      <p className="text-sm font-medium text-green-700">All clear — nothing needs your attention right now</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {alerts.map(a => (
                        <button key={a.key} onClick={a.onClick}
                          className={`w-full text-left flex items-center gap-4 border rounded-xl px-4 py-3
                                      transition-colors hover:brightness-95 ${a.bg}`}>
                          <span className={`text-3xl font-bold shrink-0 ${a.numColour}`}>{a.value}</span>
                          <div className="min-w-0">
                            <p className={`text-sm font-semibold ${a.numColour}`}>{a.label}</p>
                            <p className={`text-xs mt-0.5 ${a.subColour}`}>{a.sub}</p>
                          </div>
                          <span className={`ml-auto text-lg ${a.numColour} shrink-0`}>›</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Coming up */}
            {me?.nextExams?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Coming up</p>
                <div className="space-y-2">
                  {me.nextExams.map((e, i) => (
                    <div key={i} className={`flex items-center justify-between px-4 py-3 rounded-xl border
                      ${e.uploaded ? 'bg-white border-gray-200' : 'bg-red-50 border-red-200'}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{e.courseCode}</span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {TYPE_LABELS[e.examType] ?? e.examType}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {fmtDate(e.examDate)}{e.examTime ? ` · ${fmt12(e.examTime)}` : ''}
                          {' · '}{e.studentCount} student{e.studentCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {e.uploaded ? (
                        <span className="text-xs text-green-600 font-medium shrink-0">Uploaded ✓</span>
                      ) : (
                        <button
                          onClick={() => { setEditId(null); setIsWordDoc(false); setShowForm(true); }}
                          className="text-xs text-red-600 font-semibold underline shrink-0">
                          Upload needed
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Overview stats */}
            {stats && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Overview</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Students this term', value: stats.totalStudents ?? 0, colour: 'text-brand-800 bg-brand-50 border-brand-200',    onClick: () => setTab('My students') },
                    { label: 'RWG students',        value: stats.rwgStudents   ?? 0, colour: (stats.rwgStudents ?? 0) > 0 ? 'text-purple-700 bg-purple-50 border-purple-200' : 'text-gray-400 bg-gray-50 border-gray-200', onClick: () => setTab('My students') },
                    { label: 'Courses this term',   value: stats.courses       ?? 0, colour: 'text-gray-700 bg-gray-50 border-gray-200',       onClick: () => setTab('My students') },
                  ].map(({ label, value, colour, onClick }) => (
                    <button key={label} onClick={onClick}
                      className={`text-left border rounded-xl px-4 py-3 transition-colors hover:brightness-95 ${colour}`}>
                      <div className="text-2xl font-bold">{value}</div>
                      <div className="text-xs font-medium mt-0.5">{label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Quick actions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    label: 'New exam upload',
                    description: 'Submit a PDF exam for your students',
                    colour: 'border-brand-200 hover:border-brand-400 hover:bg-brand-50',
                    labelColour: 'text-brand-700',
                    onClick: () => { setEditId(null); setIsWordDoc(false); setShowForm(true); },
                  },
                  {
                    label: 'Upload Word doc (RWG)',
                    description: 'Upload a Word document for RWG students',
                    colour: 'border-purple-200 hover:border-purple-400 hover:bg-purple-50',
                    labelColour: 'text-purple-700',
                    onClick: () => { setEditId(null); setIsWordDoc(true); setShowForm(true); },
                  },
                  {
                    label: 'My uploads',
                    description: 'View and manage your submitted exams',
                    colour: 'border-gray-200 hover:border-gray-400 hover:bg-gray-50',
                    labelColour: 'text-gray-700',
                    onClick: () => setTab('My uploads'),
                  },
                  {
                    label: 'Exam requests',
                    description: 'Approve or reject student exam booking requests',
                    colour: 'border-gray-200 hover:border-gray-400 hover:bg-gray-50',
                    labelColour: 'text-gray-700',
                    onClick: () => setTab('Exam requests'),
                  },
                ].map(({ label, description, colour, labelColour, onClick }) => (
                  <button key={label} onClick={onClick}
                    className={`text-left border rounded-xl px-4 py-3 transition-colors ${colour}`}>
                    <p className={`text-sm font-semibold ${labelColour}`}>{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Profile info */}
            {profile && (
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Profile</p>
                <div className="space-y-1">
                  <p className="text-sm text-gray-900 font-medium">{profile.first_name} {profile.last_name}</p>
                  {profile.department && <p className="text-xs text-gray-500">{profile.department}</p>}
                  {profile.email     && <p className="text-xs text-gray-400">{profile.email}</p>}
                  {profile.office    && <p className="text-xs text-gray-400">Office: {profile.office}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'My uploads' && (
          <div>
            <div className="flex justify-end gap-2 mb-4">
              <button
                onClick={() => { setEditId(null); setIsWordDoc(true); setShowForm(true); }}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white
                           text-sm font-medium rounded-lg transition-colors"
              >
                + Upload Word doc (RWG)
              </button>
              <button
                onClick={() => { setEditId(null); setIsWordDoc(false); setShowForm(true); }}
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
                onEdit={id => { setEditId(id); setIsWordDoc(false); setShowForm(true); }}
                onRefresh={refresh}
              />
            )}
          </div>
        )}

        {tab === 'My students' && <MyStudentsTab />}

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
          isWordDoc={isWordDoc}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); refresh(); }}
        />
      )}
    </div>
  );
}

function ExamRequestCard({ r, onAction }) {
  const [rejectOpen,   setRejectOpen]   = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [acting,       setActing]       = useState(false);

  async function handleApprove() {
    setActing(true);
    try {
      await api.patch(`/portal/exam-requests/${r.id}/approve`, {});
      toast('Request approved — forwarded to accommodation centre');
      onAction();
    } catch (err) {
      toast(err.message || 'Failed to approve', 'error');
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) { toast('Enter a reason for rejection', 'warning'); return; }
    setActing(true);
    try {
      await api.patch(`/portal/exam-requests/${r.id}/reject`, { reason: rejectReason });
      toast('Request rejected');
      setRejectOpen(false);
      setRejectReason('');
      onAction();
    } catch (err) {
      toast(err.message || 'Failed to reject', 'error');
    } finally {
      setActing(false);
    }
  }

  const isPending = r.status === 'pending';

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      {/* Student-submitted details */}
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

      {r.has_rwg && (
        <div className="mt-2 flex items-start gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
          <span className="text-purple-500 shrink-0 text-sm">⚠</span>
          <p className="text-xs text-purple-700 font-medium">
            This student has RWG accommodation — please upload a Word document (.docx) version of your exam.
          </p>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-gray-600 font-medium">
            {r.first_name} {r.last_name}
            {r.student_number ? ` · #${r.student_number}` : ''}
          </p>
          {r.special_materials_note && (
            <p className="text-xs text-gray-500 mt-1 italic">{r.special_materials_note}</p>
          )}
          {r.rejection_reason && (
            <p className="text-xs text-red-500 mt-1">Reason: {r.rejection_reason}</p>
          )}
        </div>
        {isPending && !rejectOpen && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleApprove}
              disabled={acting}
              className="px-3 py-1.5 text-xs font-medium text-green-700 border border-green-300
                         rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => { setRejectOpen(true); setRejectReason(''); }}
              disabled={acting}
              className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200
                         rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}
      </div>

      {rejectOpen && (
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
              onClick={() => { setRejectOpen(false); setRejectReason(''); }}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={acting}
              className="px-3 py-1.5 text-xs font-medium text-white bg-red-500
                         hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50"
            >
              {acting ? 'Rejecting…' : 'Confirm rejection'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfessorExamRequestsTab() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [subTab,   setSubTab]   = useState('Pending');

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

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  const pending  = requests.filter(r => r.status === 'pending');
  const approved = requests.filter(r => r.status === 'professor_approved' || r.status === 'confirmed');
  const rejected = requests.filter(r => r.status === 'professor_rejected' || r.status === 'cancelled');

  const tabs = [
    { key: 'Pending',  items: pending,  emptyMsg: 'No pending requests' },
    { key: 'Approved', items: approved, emptyMsg: 'No approved requests' },
    { key: 'Rejected', items: rejected, emptyMsg: 'No rejected requests' },
  ];

  const STATUS_CHIP = {
    pending:            'bg-yellow-100 text-yellow-700',
    professor_approved: 'bg-blue-100 text-blue-700',
    confirmed:          'bg-green-100 text-green-700',
    professor_rejected: 'bg-red-100 text-red-600',
    cancelled:          'bg-gray-100 text-gray-500',
  };

  const REJECTION_SOURCE = {
    professor:          'Rejected by professor',
    institution_admin:  'Rejected by accessibility centre',
    lead:               'Rejected by accessibility centre',
  };

  function rejectionLabel(r) {
    if (r.status === 'cancelled') return 'Cancelled';
    const role = r.rejected_by_role;
    return REJECTION_SOURCE[role] ?? 'Rejected by professor';
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(({ key, items }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
              ${subTab === key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {key}
            {items.length > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full
                ${key === 'Pending'  ? 'bg-yellow-100 text-yellow-700'
                : key === 'Rejected' ? 'bg-red-100 text-red-600'
                : 'bg-gray-100 text-gray-500'}`}>
                {items.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tabs.map(({ key, items, emptyMsg }) => subTab === key && (
        items.length === 0 ? (
          <div key={key} className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <p className="text-sm font-medium text-gray-700">{emptyMsg}</p>
            {key === 'Pending' && (
              <p className="text-xs text-gray-400 mt-1">
                Student exam scheduling requests for your courses will appear here.
              </p>
            )}
          </div>
        ) : (
          <div key={key} className="space-y-3">
            {items.map(r => (
              <div key={r.id}>
                {/* Status chip for non-pending tabs */}
                {key !== 'Pending' && (
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CHIP[r.status] ?? ''}`}>
                      {key === 'Rejected' ? rejectionLabel(r) : r.status === 'confirmed' ? 'Confirmed by centre' : 'Professor approved'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(r.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                )}
                <ExamRequestCard r={r} onAction={load} />
              </div>
            ))}
          </div>
        )
      ))}
    </div>
  );
}

function fmt12(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')}${ampm}`;
}

function fmtDate(d) {
  const s = String(d).slice(0, 10);
  return new Date(s + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

const TYPE_LABELS = {
  midterm:    'Midterm',
  endterm:    'End Term',
  tutorial:   'Tutorial',
  lab:        'Lab',
  quiz:       'Quiz',
  assignment: 'Assignment',
  other:      'Other',
};

function MyStudentsTab() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab]   = useState('not_uploaded');

  useEffect(() => {
    api.get('/portal/my-students')
      .then(d => setCourses(d.courses ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  if (loading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>;

  if (!courses.length) return (
    <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
      <p className="text-sm font-medium text-gray-700">No confirmed students yet</p>
      <p className="text-xs text-gray-400 mt-1">Students whose exam requests you approved will appear here once confirmed by the accommodation centre.</p>
    </div>
  );

  // Build grouped structure: course → date → type → students[]
  const grouped = {};
  for (const course of courses) {
    if (!grouped[course.courseCode]) {
      grouped[course.courseCode] = { courseCode: course.courseCode, dates: {} };
    }
    for (const dg of course.dates) {
      const dateKey = String(dg.examDate).slice(0, 10);
      if (!grouped[course.courseCode].dates[dateKey]) {
        grouped[course.courseCode].dates[dateKey] = { examDate: dg.examDate, types: {} };
      }
      const typeKey = dg.examType ?? 'other';
      if (!grouped[course.courseCode].dates[dateKey].types[typeKey]) {
        grouped[course.courseCode].dates[dateKey].types[typeKey] = {
          examType: dg.examType,
          examTime: dg.examTime,
          examUploaded: dg.examUploaded,
          students: [],
        };
      }
      grouped[course.courseCode].dates[dateKey].types[typeKey].students.push(...dg.students);
    }
  }

  // Filter grouped data for the active tab — only include type groups matching the tab
  const wantUploaded = subTab === 'uploaded';
  const filtered = Object.values(grouped).map(({ courseCode, dates }) => {
    const filteredDates = Object.entries(dates)
      .map(([dk, { examDate, types }]) => {
        const filteredTypes = Object.values(types).filter(tg => tg.examUploaded === wantUploaded);
        return filteredTypes.length ? { dateKey: dk, examDate, types: filteredTypes } : null;
      })
      .filter(Boolean);
    return filteredDates.length ? { courseCode, dates: filteredDates } : null;
  }).filter(Boolean);

  // Counts for tab badges
  const countTypes = (uploaded) =>
    Object.values(grouped).reduce((n, { dates }) =>
      n + Object.values(dates).reduce((m, { types }) =>
        m + Object.values(types).filter(tg => tg.examUploaded === uploaded).length, 0), 0);

  const uploadedCount    = countTypes(true);
  const notUploadedCount = countTypes(false);

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'not_uploaded', label: 'Exam not uploaded', count: notUploadedCount, activeColour: 'border-amber-500 text-amber-700' },
          { key: 'uploaded',     label: 'Exam uploaded',     count: uploadedCount,    activeColour: 'border-green-600 text-green-700' },
        ].map(({ key, label, count, activeColour }) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
              ${subTab === key
                ? activeColour
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
            {count > 0 && (
              <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-400">
            {wantUploaded ? 'No exams uploaded yet' : 'All exams have been uploaded'}
          </p>
        </div>
      ) : (
        filtered.map(({ courseCode, dates }) => (
          <div key={courseCode} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Course header */}
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <span className="text-sm font-bold text-gray-900">{courseCode}</span>
            </div>

            {dates.sort((a, b) => a.dateKey.localeCompare(b.dateKey)).map(({ dateKey, examDate, types }) => (
              <div key={dateKey}>
                {/* Date header */}
                <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {fmtDate(examDate)}
                  </span>
                </div>

                {types.map((tg, ti) => (
                  <div key={ti} className={ti < types.length - 1 ? 'border-b border-gray-100' : ''}>
                    {/* Type row */}
                    <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
                      <span className="text-xs font-semibold text-gray-700">
                        {TYPE_LABELS[tg.examType] ?? tg.examType}
                      </span>
                      {tg.examTime && (
                        <span className="text-xs text-gray-400">at {fmt12(tg.examTime)}</span>
                      )}
                    </div>

                    {/* Students */}
                    <div className="px-4 pb-3 space-y-1.5">
                      {tg.students.map(s => (
                        <div key={s.bookingId} className="flex items-center justify-between">
                          <div>
                            <span className="text-sm text-gray-900">{s.firstName} {s.lastName}</span>
                            {s.studentNumber && <span className="text-xs text-gray-400 ml-1.5">#{s.studentNumber}</span>}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            s.status === 'confirmed'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            {s.status === 'confirmed' ? 'Confirmed' : 'Awaiting confirmation'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))
      )}
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
    reuse_denied:           { icon: '✕',  label: 'Reuse denied',      colour: 'border-l-red-400 bg-red-50'       },
    booking_upload_needed:  { icon: '📤', label: 'Upload needed',     colour: 'border-l-orange-400 bg-orange-50' },
    upload_reminder:        { icon: '⏰', label: 'Upload reminder',   colour: 'border-l-amber-400 bg-amber-50'   },
    booking_cancelled:      { icon: '✕',  label: 'Booking cancelled', colour: 'border-l-red-400 bg-red-50'       },
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

