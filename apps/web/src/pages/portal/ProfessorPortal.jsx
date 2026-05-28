import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { useAuth }             from '../../hooks/useAuth.js';
import { api }                 from '../../lib/api.js';
import { toast }               from '../../components/ui/Toast.jsx';
import Spinner                 from '../../components/ui/Spinner.jsx';
import UploadList              from '../../components/portal/UploadList.jsx';
import UploadForm              from '../../components/portal/UploadForm.jsx';
import UploadThreadPanel       from '../../components/portal/UploadThreadPanel.jsx';
import TermSelector            from '../../components/portal/TermSelector.jsx';
import RoleSwitcher            from '../../components/ui/RoleSwitcher.jsx';
const TABS = ['Dashboard', 'My uploads', 'My students', 'Exam requests', 'Messages'];

export default function ProfessorPortal() {
  const { user, roles, logout } = useAuth();
  const navigate               = useNavigate();
  const [tab,      setTab]     = useState('Dashboard');
  const [me,       setMe]      = useState(null);
  const [loading,  setLoading] = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editId,      setEditId]      = useState(null);
  const [isWordDoc,   setIsWordDoc]   = useState(false);
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [prefillData,   setPrefillData]   = useState(null);
  const [conversations, setConversations] = useState([]);
  const [unreadCount,          setUnreadCount]          = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [msgsLoading,   setMsgsLoading]   = useState(false);
  const [threadUpload,  setThreadUpload]  = useState(null);
  const [showPicker,    setShowPicker]    = useState(false);
  const [pickerUploads, setPickerUploads] = useState(null);
  const [terms,         setTerms]         = useState([]);
  const [selectedTerm,  setSelectedTerm]  = useState(
    () => localStorage.getItem('clearpath_prof_term') ?? 'all'
  );

  async function loadMe(termId) {
    try {
      const tid = termId ?? selectedTerm;
      const data = await api.get(`/portal/me${tid && tid !== 'all' ? `?termId=${tid}` : ''}`);
      setMe(data);
    } catch (err) {
      if (err.message.includes('professor profile')) {
        toast('No professor profile found for your account', 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.get('/portal/terms')
      .then(d => {
        setTerms(d.terms ?? []);
        const saved = localStorage.getItem('clearpath_prof_term');
        const initial = saved ?? d.currentTermId ?? 'all';
        setSelectedTerm(initial);
        loadMe(initial);
      })
      .catch(() => loadMe());
  }, []); // eslint-disable-line

  function handleTermChange(termId) {
    setSelectedTerm(termId);
    localStorage.setItem('clearpath_prof_term', termId);
    loadMe(termId);
  }

  // Load conversations when Messages tab is opened
  useEffect(() => {
    if (tab !== 'Messages') return;
    setMsgsLoading(true);
    fetch('/api/portal/messages', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.ok) { setConversations(d.conversations); setUnreadCount(0); } })
      .finally(() => setMsgsLoading(false));
  }, [tab]); // eslint-disable-line

  // Fetch uploads lazily when picker is opened
  useEffect(() => {
    if (!showPicker) return;
    if (pickerUploads !== null) return; // already loaded
    fetch('/api/portal/uploads', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.ok) setPickerUploads(d.uploads ?? []); })
      .catch(() => setPickerUploads([]));
  }, [showPicker]); // eslint-disable-line

  // Refresh pending exam request count whenever leaving that tab
  useEffect(() => {
    if (tab === 'Exam requests') return;
    const q = selectedTerm && selectedTerm !== 'all' ? `?termId=${selectedTerm}` : '';
    api.get(`/portal/exam-requests${q}`)
      .then(d => setPendingRequestsCount((d.examRequests ?? []).filter(r => r.status === 'pending').length))
      .catch(() => {});
  }, [tab, selectedTerm]); // eslint-disable-line

  // Poll unread count every 60s when not on Messages tab
  useEffect(() => {
    if (tab === 'Messages') return;
    const load = () =>
      fetch('/api/portal/messages/unread-count', { credentials: 'include' })
        .then(r => r.json())
        .then(d => { if (d.ok) setUnreadCount(d.unreadCount); })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [tab]); // eslint-disable-line

  function refresh() {
    setRefreshKey(k => k + 1);
    loadMe();
  }

  function handleUploadFromAlert({ courseId, courseCode, examType, examDate, examTime }) {
    setPrefillData({ courseId, courseCode, examTypeLabel: examType, examDate, examTime });
    setEditId(null);
    setIsWordDoc(false);
    setShowForm(true);
  }

  function handleWordDocFromAlert({ courseId, courseCode, examType, examDate, examTime }) {
    setPrefillData({ courseId, courseCode, examTypeLabel: examType, examDate, examTime });
    setEditId(null);
    setIsWordDoc(true);
    setShowForm(true);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  const profile = me?.profile;
  const stats   = me?.stats;


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
            <div className="flex h-14 mr-8">
              {TABS.map(t => (
                <button key={t} onClick={() => { setTab(t); if (t === 'Dashboard') loadMe(); }}
                  className={`px-5 text-sm font-medium border-b-2 transition-colors h-full whitespace-nowrap
                    flex items-center gap-1.5
                    ${tab === t
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {t}
                  {t === 'Messages' && unreadCount > 0 && (
                    <span className="bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
                      {unreadCount}
                    </span>
                  )}
                  {t === 'Exam requests' && pendingRequestsCount > 0 && (
                    <span className="bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
                      {pendingRequestsCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <RoleSwitcher roles={roles} />
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

        {/* Term selector */}
        {tab !== 'Messages' && (
          <div className="flex justify-end mb-4">
            <TermSelector
              terms={terms}
              selectedTermId={selectedTerm}
              onChange={handleTermChange}
            />
          </div>
        )}

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
                  onClick: () => setTab('My uploads'),
                }] : []),
                ...(stats.missingWordDocUploads > 0 ? [{
                  key: 'rwg',
                  value: stats.missingWordDocUploads,
                  label: 'Upcoming exam' + (stats.missingWordDocUploads !== 1 ? 's' : '') + ' need a Word doc for RWG/Dragon students',
                  sub: 'Students with RWG or Dragon accommodation require a .docx version of your exam',
                  bg: 'bg-purple-50 border-purple-300',
                  numColour: 'text-purple-700',
                  subColour: 'text-purple-500',
                  onClick: () => setTab('My uploads'),
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
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {e.uploaded ? (
                          <span className="text-xs text-green-600 font-medium">Uploaded ✓</span>
                        ) : (
                          <button
                            onClick={() => handleUploadFromAlert({ courseId: e.courseId, courseCode: e.courseCode, examType: e.examType, examDate: e.examDate, examTime: e.examTime })}
                            className="text-xs text-red-600 font-semibold underline">
                            Upload needed
                          </button>
                        )}
                        {e.hasRwgStudents && !e.wordDocUploaded && (
                          <button
                            onClick={() => handleWordDocFromAlert({ courseId: e.courseId, courseCode: e.courseCode, examType: e.examType, examDate: e.examDate, examTime: e.examTime })}
                            className="text-xs text-purple-600 font-semibold underline">
                            Word doc needed
                          </button>
                        )}
                      </div>
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
                onNewUpload={handleUploadFromAlert}
                onNewWordDocUpload={handleWordDocFromAlert}
              />
            )}
          </div>
        )}

        {tab === 'My students' && <MyStudentsTab termId={selectedTerm} />}

        {tab === 'Exam requests' && <ProfessorExamRequestsTab termId={selectedTerm} />}

        {tab === 'Messages' && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <button
                onClick={() => setShowPicker(true)}
                className="text-xs font-medium text-brand-600 hover:text-brand-800"
              >
                + Add Exam To Message About
              </button>
            </div>
            {msgsLoading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : conversations.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">No messages yet</p>
            ) : (
              conversations.map(c => {
                const hasUnread = c.unread_count > 0;
                const ago = (() => {
                  if (!c.latest_at) return '';
                  const diff = Math.floor((Date.now() - new Date(c.latest_at)) / 60000);
                  if (diff < 1) return 'just now';
                  if (diff < 60) return `${diff}m ago`;
                  const h = Math.floor(diff / 60);
                  if (h < 24) return `${h}h ago`;
                  return new Date(c.latest_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
                })();
                return (
                  <button key={c.upload_id} onClick={() => setThreadUpload({ ...c, id: c.upload_id })}
                    className="w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-xl
                               hover:border-brand-300 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {hasUnread && <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0 mt-0.5" />}
                        <span className={`text-sm font-mono truncate ${hasUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                          {c.course_code}
                        </span>
                        <span className="text-xs text-gray-400 capitalize truncate shrink-0">
                          {c.exam_type_label?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{ago}</span>
                    </div>
                    {c.last_body && (
                      <p className={`text-xs mt-1 truncate ${hasUnread ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                        {c.last_sender ? `${c.last_sender.split(' ')[0]}: ` : ''}{c.last_body}
                      </p>
                    )}
                    {hasUnread && (
                      <span className="inline-block mt-1 text-xs bg-brand-600 text-white px-1.5 py-0.5 rounded-full">
                        {c.unread_count} new
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}


      </div>

      {/* Message thread drawer */}
      {threadUpload && (
        <UploadThreadPanel
          upload={threadUpload}
          onClose={() => {
            setThreadUpload(null);
            setConversations(prev => prev.map(c =>
              c.upload_id === threadUpload.id ? { ...c, unread_count: 0 } : c
            ));
          }}
        />
      )}

      {/* Exam picker modal */}
      {showPicker && (
        <ProfExamPickerModal
          uploads={pickerUploads}
          existingIds={new Set(conversations.map(c => c.upload_id))}
          onSelect={u => {
            setThreadUpload({ id: u.id, course_code: u.course_code, exam_type_label: u.exam_type_label });
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Upload form modal */}
      {showForm && (
        <UploadForm
          uploadId={editId}
          isWordDoc={isWordDoc}
          prefill={prefillData}
          onClose={() => { setShowForm(false); setPrefillData(null); }}
          onSaved={() => { setShowForm(false); setPrefillData(null); refresh(); }}
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

function ProfessorExamRequestsTab({ termId }) {
  const [requests,      setRequests]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [subTab,        setSubTab]        = useState('Pending');
  const [search,        setSearch]        = useState('');
  const [filterCourse,  setFilterCourse]  = useState('');
  const [filterType,    setFilterType]    = useState('');

  async function load() {
    setLoading(true);
    try {
      const q = termId && termId !== 'all' ? `?termId=${termId}` : '';
      const data = await api.get(`/portal/exam-requests${q}`);
      setRequests(data.examRequests ?? []);
    } catch (err) {
      toast(err.message || 'Failed to load exam requests', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [termId]); // eslint-disable-line

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  const courses   = [...new Set(requests.map(r => r.course_code))].sort();
  const examTypes = [...new Set(requests.map(r => r.exam_type).filter(Boolean))].sort();

  const applyFilters = (list) => list.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
      (r.student_number ?? '').toLowerCase().includes(q);
    const matchCourse = !filterCourse || r.course_code === filterCourse;
    const matchType   = !filterType   || r.exam_type   === filterType;
    return matchSearch && matchCourse && matchType;
  });

  const byDate = (a, b) => String(a.exam_date).localeCompare(String(b.exam_date));
  const pending  = applyFilters(requests.filter(r => r.status === 'pending')).sort(byDate);
  const approved = applyFilters(requests.filter(r => r.status === 'professor_approved' || r.status === 'confirmed')).sort(byDate);
  const rejected = applyFilters(requests.filter(r => r.status === 'professor_rejected' || r.status === 'cancelled')).sort(byDate);

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

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search by student name or #"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-400 w-52"
        />
        <select
          value={filterCourse}
          onChange={e => setFilterCourse(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          <option value="">All courses</option>
          {courses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          <option value="">All exam types</option>
          {examTypes.map(t => <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>)}
        </select>
        {(search || filterCourse || filterType) && (
          <button
            onClick={() => { setSearch(''); setFilterCourse(''); setFilterType(''); }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5"
          >
            Clear
          </button>
        )}
      </div>

      {tabs.map(({ key, items, emptyMsg }) => subTab === key && (
        items.length === 0 ? (
          <div key={key} className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <p className="text-sm font-medium text-gray-700">
              {(search || filterCourse || filterType) ? 'No requests match the current filters' : emptyMsg}
            </p>
            {key === 'Pending' && !(search || filterCourse || filterType) && (
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
                      {key === 'Rejected' ? rejectionLabel(r)
                        : r.status === 'confirmed'
                          ? r.auto_approve_source === 'upload'   ? 'Auto-approved by Professor'
                          : r.auto_approve_source === 'schedule' ? 'Auto-approved by Centre'
                          : `Confirmed by Centre${r.confirmed_by_first ? ` (${r.confirmed_by_first} ${r.confirmed_by_last})` : ''}`
                        : 'Professor approved'}
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

function ProfExamPickerModal({ uploads, existingIds, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const available = (uploads ?? []).filter(u => !existingIds.has(u.id));
  const filtered = available.filter(u => {
    const needle = q.toLowerCase();
    return !needle
      || (u.course_code ?? '').toLowerCase().includes(needle)
      || (u.exam_type_label ?? '').toLowerCase().includes(needle);
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Start a conversation about an exam</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>
        <div className="px-4 py-2 border-b border-gray-100">
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by course or exam type…"
            className="w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <div className="overflow-y-auto flex-1 px-2 py-2">
          {uploads === null ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              {available.length === 0 ? 'All your uploads already have conversations' : 'No matches'}
            </p>
          ) : (
            filtered.map(u => (
              <button key={u.id} onClick={() => onSelect(u)}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                <span className="text-sm font-mono font-semibold text-gray-900">{u.course_code}</span>
                <span className="ml-2 text-xs text-gray-500 capitalize">{(u.exam_type_label ?? '').replace(/_/g, ' ')}</span>
                {u.dates?.[0]?.exam_date && (
                  <span className="ml-2 text-xs text-gray-400">
                    {new Date(String(u.dates[0].exam_date).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AttendanceBadge({ bookingId, examDate, attendanceStatus, onUpdate }) {
  const [open,   setOpen]   = useState(false);
  const [saving, setSaving] = useState(false);
  const isPast = String(examDate).slice(0, 10) < new Date().toISOString().slice(0, 10);

  if (!isPast) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-400">
        Exam yet to happen
      </span>
    );
  }

  const cfg = attendanceStatus === 'show'
    ? { label: 'Show',         cls: 'bg-green-50 text-green-700' }
    : attendanceStatus === 'no_show'
    ? { label: 'No show',      cls: 'bg-red-50 text-red-500' }
    : { label: 'Not recorded', cls: 'bg-amber-50 text-amber-700' };

  const setStatus = async (status) => {
    setSaving(true);
    setOpen(false);
    try {
      await api.patch(`/portal/bookings/${bookingId}/attendance`, { status });
      onUpdate(status);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <button
        disabled={saving}
        onClick={() => setOpen(o => !o)}
        className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}
      >
        {saving ? '…' : cfg.label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[110px]">
            {[
              { status: 'show',    label: 'Show' },
              { status: 'no_show', label: 'No show' },
              { status: null,      label: 'Clear' },
            ].map(({ status, label }) => (
              <button key={label} onClick={() => setStatus(status)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-700">
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function downloadCsv(courseCode, dates) {
  const headers = ['Course','Exam Date','Exam Time','Exam Type','Name','Student #','Email','Status','Base Mins','Extra Mins','STB Mins','Attendance','Accommodations'];
  const rows = [headers];
  for (const { examDate, types } of dates) {
    for (const tg of types) {
      for (const s of tg.students) {
        rows.push([
          courseCode,
          examDate,
          tg.examTime ?? '',
          TYPE_LABELS[tg.examType] ?? tg.examType,
          `${s.firstName} ${s.lastName}`,
          s.studentNumber ?? '',
          s.email,
          s.status,
          s.baseDurationMins ?? '',
          s.extraMins ?? 0,
          s.stbMins ?? 0,
          s.attendanceStatus ?? '',
          (s.accommodationCodes ?? []).join('; '),
        ]);
      }
    }
  }
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${courseCode}_students.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadAccessibilityCsv(students) {
  const headers = ['Student Name','Student #','Email','Course','Accommodation Codes','Accommodation Labels'];
  const rows = [headers, ...students.map(s => [
    `${s.firstName} ${s.lastName}`,
    s.studentNumber ?? '',
    s.email,
    s.courseCode,
    (s.accommodationCodes ?? []).join('; '),
    (s.accommodationLabels ?? []).join('; '),
  ])];
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'accessibility_students.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function AccessibilityStudentsTab({ termId }) {
  const [students,     setStudents]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [filterCode,   setFilterCode]   = useState('');

  useEffect(() => {
    setLoading(true);
    const q = termId && termId !== 'all' ? `?termId=${termId}` : '';
    api.get(`/portal/accessibility-students${q}`)
      .then(d => setStudents(d.students ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [termId]); // eslint-disable-line

  if (loading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>;

  const courses = [...new Set(students.map(s => s.courseCode))].sort();
  const codes   = [...new Set(students.flatMap(s => s.accommodationCodes))].sort();

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
      (s.studentNumber ?? '').toLowerCase().includes(q);
    const matchCourse = !filterCourse || s.courseCode === filterCourse;
    const matchCode   = !filterCode   || s.accommodationCodes.includes(filterCode);
    return matchSearch && matchCourse && matchCode;
  });

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Search by name or student #"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-400 w-56"
          />
          <select
            value={filterCourse}
            onChange={e => setFilterCourse(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-400"
          >
            <option value="">All courses</option>
            {courses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterCode}
            onChange={e => setFilterCode(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-400"
          >
            <option value="">All accommodations</option>
            {codes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={() => downloadAccessibilityCsv(filtered)}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium border border-brand-200 rounded-lg px-3 py-1.5"
          >
            Download CSV
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-400">
            {students.length === 0
              ? 'No students with accommodations in your courses for this term'
              : 'No students match the current filters'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Student</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Student #</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Course</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Accommodations</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={`${s.studentProfileId}-${s.courseCode}`}
                  className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{s.firstName} {s.lastName}</td>
                  <td className="px-4 py-2.5 text-gray-500">{s.studentNumber ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{s.email}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{s.courseCode}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {s.accommodationCodes.map((code, ci) => (
                        <span key={code} title={s.accommodationLabels[ci]}
                          className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                          {code}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MyStudentsTab({ termId }) {
  const [courses,             setCourses]             = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [subTab,              setSubTab]              = useState('not_uploaded');
  const [attendanceOverrides, setAttendanceOverrides] = useState({});

  useEffect(() => {
    setLoading(true);
    const q = termId && termId !== 'all' ? `?termId=${termId}` : '';
    api.get(`/portal/my-students${q}`)
      .then(d => setCourses(d.courses ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [termId]); // eslint-disable-line

  if (loading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>;

  const todayStr = new Date().toISOString().slice(0, 10);

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
      const typeKey = `${dg.examType ?? 'other'}__${dg.examTime ?? ''}`;
      if (!grouped[course.courseCode].dates[dateKey].types[typeKey]) {
        grouped[course.courseCode].dates[dateKey].types[typeKey] = {
          examType: dg.examType,
          examTime: dg.examTime,
          examDate: dateKey,
          examUploaded: dg.examUploaded,
          students: [],
        };
      }
      grouped[course.courseCode].dates[dateKey].types[typeKey].students.push(...dg.students);
    }
  }

  const hasNonCancelled = (tg) => tg.students.some(s => s.status !== 'cancelled');
  const isPast          = (tg) => tg.examDate < todayStr;

  // Filter grouped data for the active tab — only include type groups matching the tab
  const wantUploaded     = subTab === 'uploaded';
  const isDeadlineMissed = subTab === 'deadline_missed';
  const matchesTab = (tg) => {
    if (isDeadlineMissed) return !tg.examUploaded && isPast(tg);
    if (wantUploaded)     return  tg.examUploaded && hasNonCancelled(tg);
    // not_uploaded: future exams only, with at least one non-cancelled student
    return !tg.examUploaded && !isPast(tg) && hasNonCancelled(tg);
  };
  const filtered = Object.values(grouped).map(({ courseCode, dates }) => {
    const filteredDates = Object.entries(dates)
      .map(([dk, { examDate, types }]) => {
        const filteredTypes = Object.values(types).filter(matchesTab);
        return filteredTypes.length ? { dateKey: dk, examDate, types: filteredTypes } : null;
      })
      .filter(Boolean);
    return filteredDates.length ? { courseCode, dates: filteredDates } : null;
  }).filter(Boolean);

  // Counts for tab badges
  const countTypes = (pred) =>
    Object.values(grouped).reduce((n, { dates }) =>
      n + Object.values(dates).reduce((m, { types }) =>
        m + Object.values(types).filter(pred).length, 0), 0);

  const uploadedCount       = countTypes(tg =>  tg.examUploaded && hasNonCancelled(tg));
  const notUploadedCount    = countTypes(tg => !tg.examUploaded && !isPast(tg) && hasNonCancelled(tg));
  const deadlineMissedCount = countTypes(tg => !tg.examUploaded && isPast(tg));

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'not_uploaded',    label: 'Awaiting Exam Upload', count: notUploadedCount,    activeColour: 'border-amber-500 text-amber-700' },
          { key: 'uploaded',        label: 'Students Writing',    count: uploadedCount,       activeColour: 'border-green-600 text-green-700' },
          { key: 'deadline_missed', label: 'Upload Missed',       count: deadlineMissedCount, activeColour: 'border-red-500 text-red-700' },
          { key: 'accessibility',   label: 'Accessibility List',  count: null,                activeColour: 'border-blue-500 text-blue-700' },
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
      {subTab === 'accessibility' ? (
        <AccessibilityStudentsTab termId={termId} />
      ) : !courses.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm font-medium text-gray-700">No confirmed students yet</p>
          <p className="text-xs text-gray-400 mt-1">Students whose exam requests you approved will appear here once confirmed by the accommodation centre.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-400">
            {isDeadlineMissed ? 'No missed deadlines' : wantUploaded ? 'No exams uploaded yet' : 'All exams have been uploaded'}
          </p>
        </div>
      ) : (
        filtered.map(({ courseCode, dates }) => (
          <div key={courseCode} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Course header */}
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-900">{courseCode}</span>
              {wantUploaded && (
                <button
                  onClick={() => downloadCsv(courseCode, dates)}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  Download CSV
                </button>
              )}
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
                      {tg.students.map(s => {
                        const effectiveAttendance = attendanceOverrides[s.bookingId] !== undefined
                          ? attendanceOverrides[s.bookingId]
                          : s.attendanceStatus;
                        return (
                          <div key={s.bookingId} className={`flex items-center justify-between ${s.status === 'cancelled' ? 'opacity-50' : ''}`}>
                            <div>
                              <span className="text-sm text-gray-900">{s.firstName} {s.lastName}</span>
                              {s.studentNumber && <span className="text-xs text-gray-400 ml-1.5">#{s.studentNumber}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              {subTab === 'uploaded' && s.status !== 'cancelled' && (
                                <AttendanceBadge
                                  bookingId={s.bookingId}
                                  examDate={tg.examDate}
                                  attendanceStatus={effectiveAttendance}
                                  onUpdate={(newStatus) => setAttendanceOverrides(prev => ({ ...prev, [s.bookingId]: newStatus }))}
                                />
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                s.status === 'confirmed'
                                  ? 'bg-green-50 text-green-700'
                                  : s.status === 'cancelled'
                                  ? 'bg-red-50 text-red-500'
                                  : 'bg-amber-50 text-amber-700'
                              }`}>
                                {s.status === 'confirmed'
                                  ? 'Confirmed'
                                  : s.status === 'cancelled'
                                  ? 'Cancelled'
                                  : 'Awaiting Confirmation from Accessibility Center'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
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


