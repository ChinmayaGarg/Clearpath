import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api }          from '../../lib/api.js';
import { toast }        from '../ui/Toast.jsx';
import Spinner          from '../ui/Spinner.jsx';
import { LeadUploadPanel } from './ProfessorDetail.jsx';

const STATUS_STYLES = {
  pending:             'bg-gray-100 text-gray-600',
  professor_approved:  'bg-blue-100 text-blue-700',
  confirmed:           'bg-green-100 text-green-700',
  professor_rejected:  'bg-red-100 text-red-700',
  cancelled:           'bg-gray-100 text-gray-400',
};

const STATUS_LABELS = {
  pending:             'Pending',
  professor_approved:  'Prof. Approved',
  confirmed:           'Confirmed',
  professor_rejected:  'Prof. Rejected',
  cancelled:           'Cancelled',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'pm' : 'am';
  return `${hour % 12 || 12}:${m}${ampm}`;
}

// ── Prof Details tab ──────────────────────────────────────────────────────────
function ProfDetailsTab({ prof, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState({});

  useEffect(() => {
    setForm({
      firstName:  prof.first_name   ?? '',
      lastName:   prof.last_name    ?? '',
      department: prof.department   ?? '',
      phone:      prof.phone        ?? '',
      office:     prof.office       ?? '',
    });
    setEditing(false);
  }, [prof.id]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(`/professors/${prof.id}`, {
        firstName:  form.firstName  || undefined,
        lastName:   form.lastName   || undefined,
        department: form.department || null,
        phone:      form.phone      || null,
        office:     form.office     || null,
      });
      toast('Professor updated', 'success');
      setEditing(false);
      onUpdated?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        {!editing ? (
          <button onClick={() => setEditing(true)}
            className="text-sm text-brand-600 hover:text-brand-800 font-medium">
            Edit
          </button>
        ) : (
          <div className="flex gap-3">
            <button onClick={() => setEditing(false)}
              className="text-sm text-gray-400 hover:text-gray-600">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="text-sm text-brand-600 hover:text-brand-800 font-medium
                         disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'First name', key: 'firstName' },
              { label: 'Last name',  key: 'lastName'  },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                <input value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-600" />
              </div>
            ))}
          </div>
          {[
            { label: 'Department', key: 'department', placeholder: 'e.g. Computer Science' },
            { label: 'Phone',      key: 'phone',      placeholder: 'e.g. (902) 494-0000'   },
            { label: 'Office',     key: 'office',     placeholder: 'e.g. Goldberg 310'      },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
              <input value={form[key]} placeholder={placeholder}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {[
            { label: 'Email',      value: prof.email      },
            { label: 'Department', value: prof.department },
            { label: 'Phone',      value: prof.phone      },
            { label: 'Office',     value: prof.office     },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-3">
              <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
              <span className="text-sm text-gray-800">
                {value ?? <span className="text-gray-300">Not set</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Exam group card (Future Exams tab — one card per exam, students inside) ───
const ATTENDANCE_STYLES = {
  show:    'bg-green-100 text-green-700',
  no_show: 'bg-red-100 text-red-700',
};
const ATTENDANCE_LABELS = {
  show:    'Showed',
  no_show: 'No show',
};

function ExamGroupCard({ group, showAttendance = false }) {
  const active   = group.students.filter(s => s.status !== 'cancelled' && s.status !== 'professor_rejected');
  const inactive = group.students.filter(s => s.status === 'cancelled' || s.status === 'professor_rejected');

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium font-mono text-gray-900">{group.course_code}</span>
            <span className="text-xs text-gray-400 capitalize">{group.exam_type?.replace(/_/g, ' ')}</span>
          </div>
          <span className="text-xs text-gray-400">
            {active.length} student{active.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {formatDate(group.exam_date)}
          {group.exam_time && ` · ${formatTime(group.exam_time)}`}
        </div>
        {group.upload_id && (
          <div className="text-xs mt-1">
            <Link
              to={`/exams?id=${group.upload_id}`}
              className="text-gray-400 hover:text-brand-600 hover:underline"
              onClick={e => e.stopPropagation()}
            >
              View exam upload →
            </Link>
          </div>
        )}
      </div>
      <div className="divide-y divide-gray-50">
        {[...active, ...inactive].map(s => {
          const studentName = [s.student_first_name, s.student_last_name].filter(Boolean).join(' ');
          const dimmed = s.status === 'cancelled' || s.status === 'professor_rejected';
          return (
            <div key={s.id}
              className={`flex items-center justify-between gap-2 px-3 py-2 ${dimmed ? 'opacity-50' : ''}`}>
              <a
                href={`/students?id=${s.student_profile_id}`}
                className="text-xs text-brand-600 hover:underline"
                onClick={e => e.stopPropagation()}
              >
                {s.student_number ? `#${s.student_number} · ` : ''}{studentName}
              </a>
              <div className="flex items-center gap-2 shrink-0">
                {s.student_duration_mins && (
                  <span className="text-xs text-gray-400">{s.student_duration_mins} min</span>
                )}
                {s.room_name && (
                  <span className="text-xs text-gray-400">{s.room_name}</span>
                )}
                {showAttendance && (
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    s.attendance_status
                      ? ATTENDANCE_STYLES[s.attendance_status]
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                    {s.attendance_status ? ATTENDANCE_LABELS[s.attendance_status] : 'Not recorded'}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  STATUS_STYLES[s.status] ?? 'bg-gray-100 text-gray-600'
                }`}>
                  {STATUS_LABELS[s.status] ?? s.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Courses tab ───────────────────────────────────────────────────────────────
function CoursesTab({ dossiers }) {
  const terms = [...new Set(dossiers.map(d => d.term))].sort((a, b) => b.localeCompare(a));
  const [selectedTerm, setSelectedTerm] = useState('');

  useEffect(() => { setSelectedTerm(''); }, [dossiers]);

  const visible = selectedTerm ? dossiers.filter(d => d.term === selectedTerm) : dossiers;

  if (!dossiers.length) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        No courses linked to this professor yet
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {terms.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedTerm('')}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              selectedTerm === ''
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            All terms
          </button>
          {terms.map(t => (
            <button key={t} onClick={() => setSelectedTerm(t)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                selectedTerm === t
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'border-gray-200 text-gray-500 hover:border-gray-400'
              }`}>
              {t}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        {visible.map(d => (
          <div key={d.id}
            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg
                       border border-gray-100 bg-gray-50">
            <span className="text-sm font-medium font-mono text-gray-900 shrink-0">
              {d.course_code}
            </span>
            <span className="text-xs text-gray-400 truncate text-right">{d.term}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Notes tab ─────────────────────────────────────────────────────────────────
function NoteCard({ dossier, professorId, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [text,    setText]    = useState(dossier.notes ?? '');
  const [saving,  setSaving]  = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api.put('/dossier', {
        professorId,
        courseId: dossier.course_id,
        notes: text || null,
      });
      toast('Notes saved', 'success');
      setEditing(false);
      onSaved?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg px-4 py-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium font-mono text-gray-900">{dossier.course_code}</span>
          <span className="text-xs text-gray-400">{dossier.term}</span>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)}
            className="text-xs text-brand-600 hover:text-brand-800 font-medium">
            Edit
          </button>
        ) : (
          <div className="flex gap-3">
            <button onClick={() => { setEditing(false); setText(dossier.notes ?? ''); }}
              className="text-xs text-gray-400 hover:text-gray-600">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="text-xs text-brand-600 hover:text-brand-800 font-medium disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Add notes for future leads…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
        />
      ) : (
        <p className={`text-sm ${text ? 'text-gray-700' : 'text-gray-300 italic'}`}>
          {text || 'No notes'}
        </p>
      )}
    </div>
  );
}

function NotesTab({ dossiers, professorId, onSaved }) {
  if (!dossiers.length) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        No courses linked to this professor yet
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {dossiers.map(d => (
        <NoteCard key={d.id} dossier={d} professorId={professorId} onSaved={onSaved} />
      ))}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
const TABS = ['Prof Details', 'Future Exams', 'Past Exams', 'Courses', 'Exam Uploads', 'Notes'];

export default function ProfessorSidePanel({ professorId, onClose }) {
  const [tab,        setTab]        = useState('Prof Details');
  const [prof,       setProf]       = useState(null);
  const [pastExams,  setPastExams]  = useState([]);
  const [futureExams,setFutureExams]= useState([]);
  const [loading,    setLoading]    = useState(true);

  async function load() {
    if (!professorId) return;
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    try {
      const [profData, examData] = await Promise.all([
        api.get(`/professors/${professorId}`),
        api.get(`/professors/${professorId}/exam-requests`),
      ]);
      setProf(profData.professor);
      const all = examData.examRequests ?? [];
      setPastExams(all.filter(e => e.exam_date < today));
      setFutureExams(all.filter(e => e.exam_date >= today));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setTab('Prof Details'); load(); }, [professorId]); // eslint-disable-line

  const name = prof ? `${prof.first_name ?? ''} ${prof.last_name ?? ''}`.trim() : '';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-1/2 bg-white shadow-xl z-50
                      flex flex-col border-l border-gray-200">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            {loading ? (
              <div className="h-5 w-36 bg-gray-100 rounded animate-pulse" />
            ) : (
              <>
                <h2 className="text-base font-semibold text-gray-900">{name}</h2>
                {prof?.email && (
                  <p className="text-xs text-gray-400 mt-0.5">{prof.email}</p>
                )}
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-200 shrink-0 px-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t}
              {t === 'Future Exams' && futureExams.length > 0 && (
                <span className="ml-1.5 bg-gray-100 text-gray-500 text-xs
                                 px-1.5 py-0.5 rounded-full">
                  {new Set(futureExams.map(e =>
                    `${e.course_code}__${e.exam_date}__${e.exam_time ?? ''}__${e.exam_type}`
                  )).size}
                </span>
              )}
              {t === 'Past Exams' && pastExams.length > 0 && (
                <span className="ml-1.5 bg-gray-100 text-gray-500 text-xs
                                 px-1.5 py-0.5 rounded-full">
                  {new Set(pastExams.map(e =>
                    `${e.course_code}__${e.exam_date}__${e.exam_time ?? ''}__${e.exam_type}`
                  )).size}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : !prof ? (
            <p className="text-sm text-gray-400 text-center py-8">Professor not found</p>
          ) : (
            <>
              {tab === 'Prof Details' && (
                <ProfDetailsTab prof={prof} onUpdated={load} />
              )}

              {tab === 'Future Exams' && (
                futureExams.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No upcoming exams</p>
                ) : (() => {
                  const groupMap = {};
                  for (const e of futureExams) {
                    const key = `${e.course_code}__${e.exam_date}__${e.exam_time ?? ''}__${e.exam_type}`;
                    if (!groupMap[key]) {
                      groupMap[key] = {
                        key,
                        course_code: e.course_code,
                        exam_date:   e.exam_date,
                        exam_time:   e.exam_time,
                        exam_type:   e.exam_type,
                        upload_id:   e.upload_id,
                        students:    [],
                      };
                    }
                    groupMap[key].students.push(e);
                  }
                  const groups = Object.values(groupMap)
                    .sort((a, b) => a.exam_date.localeCompare(b.exam_date) || (a.exam_time ?? '').localeCompare(b.exam_time ?? ''));
                  return (
                    <div className="space-y-2">
                      {groups.map(g => <ExamGroupCard key={g.key} group={g} />)}
                    </div>
                  );
                })()
              )}

              {tab === 'Past Exams' && (
                pastExams.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No past exams on record</p>
                ) : (() => {
                  const groupMap = {};
                  for (const e of pastExams) {
                    const key = `${e.course_code}__${e.exam_date}__${e.exam_time ?? ''}__${e.exam_type}`;
                    if (!groupMap[key]) {
                      groupMap[key] = {
                        key,
                        course_code: e.course_code,
                        exam_date:   e.exam_date,
                        exam_time:   e.exam_time,
                        exam_type:   e.exam_type,
                        upload_id:   e.upload_id,
                        students:    [],
                      };
                    }
                    groupMap[key].students.push(e);
                  }
                  const groups = Object.values(groupMap)
                    .sort((a, b) => b.exam_date.localeCompare(a.exam_date) || (b.exam_time ?? '').localeCompare(a.exam_time ?? ''));
                  return (
                    <div className="space-y-2">
                      {groups.map(g => <ExamGroupCard key={g.key} group={g} showAttendance />)}
                    </div>
                  );
                })()
              )}

              {tab === 'Courses' && (
                <CoursesTab dossiers={prof.dossiers ?? []} />
              )}

              {tab === 'Exam Uploads' && (
                <LeadUploadPanel professorId={prof.id} />
              )}

              {tab === 'Notes' && (
                <NotesTab dossiers={prof.dossiers ?? []} professorId={prof.id} onSaved={load} />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
