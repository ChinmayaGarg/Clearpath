import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth.js';

const DELIVERY_LABELS = {
  pending:     'Not confirmed',
  pickup:      'AC picks up',
  delivery:    'Delivered to room',
  file_upload: 'File upload',
};

function deliveryLabel(delivery, dropoffConfirmedAt) {
  if (delivery === 'dropped') {
    return dropoffConfirmedAt ? 'Prof dropped off' : 'Prof will drop off';
  }
  return DELIVERY_LABELS[delivery] ?? delivery ?? '—';
}

function deliveryBadgeClass(delivery, dropoffConfirmedAt) {
  if (delivery === 'dropped') {
    return dropoffConfirmedAt ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700';
  }
  return DELIVERY_BADGE[delivery] ?? 'bg-gray-100 text-gray-600';
}

const DELIVERY_BADGE = {
  file_upload: 'bg-blue-100 text-blue-700',
  dropped:     'bg-amber-100 text-amber-700',
  pickup:      'bg-green-100 text-green-700',
  delivery:    'bg-purple-100 text-purple-700',
  pending:     'bg-gray-100 text-gray-500',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m}${hour >= 12 ? 'pm' : 'am'}`;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadFile(url, filename) {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    alert('Download failed. Please try again.');
  }
}

function DetailRow({ label, value }) {
  if (!value && value !== 0 && value !== false) return null;
  return (
    <div className="flex gap-3">
      <span className="text-xs text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  );
}

function DetailsTab({ exam }) {
  const [showPassword, setShowPassword] = useState(false);

  const typeParts = [exam.exam_type_label, exam.version_label].filter(Boolean);
  const typeLabel = typeParts.join(' · ');

  return (
    <div className="space-y-5">
      {/* Exam Info */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Exam Info</h3>
        <div className="space-y-2">
          <DetailRow label="Course" value={<span className="font-mono">{exam.course_code}</span>} />
          <DetailRow label="Type" value={typeLabel} />
          <DetailRow label="Professor" value={
            <a href={`mailto:${exam.prof_email}`} className="text-brand-600 hover:underline">
              {exam.prof_first} {exam.prof_last}
            </a>
          } />
          {exam.dates?.length > 0 && (
            <div className="flex gap-3">
              <span className="text-xs text-gray-500 w-36 shrink-0">Date(s)</span>
              <div className="space-y-0.5">
                {exam.dates.map((d, i) => (
                  <div key={i} className="text-sm text-gray-800">
                    {formatDate(d.exam_date)}
                    {d.time_slot && ` · ${formatTime(d.time_slot)}`}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <span className="text-xs text-gray-500 w-36 shrink-0">Delivery</span>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${deliveryBadgeClass(exam.delivery, exam.dropoff_confirmed_at)}`}>
              {deliveryLabel(exam.delivery, exam.dropoff_confirmed_at)}
            </span>
          </div>
          {exam.dropoff_confirmed_at && (
            <DetailRow label="Drop-off confirmed" value={
              new Date(exam.dropoff_confirmed_at).toLocaleString('en-CA', {
                month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
              })
            } />
          )}
          {exam.submitted_at && (
            <DetailRow label="Submitted" value={
              new Date(exam.submitted_at).toLocaleString('en-CA', {
                month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
              })
            } />
          )}
          <div className="flex gap-2 flex-wrap mt-1">
            {exam.rwg_flag && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">RWG Word doc</span>
            )}
            {exam.is_makeup && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">Makeup</span>
            )}
          </div>
        </div>
      </section>

      {/* Exam Settings */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Exam Settings</h3>
        <div className="space-y-2">
          <DetailRow label="Duration" value={exam.exam_duration_mins ? `${exam.exam_duration_mins} min` : null} />
          <DetailRow label="Format" value={exam.exam_format} />
          <DetailRow label="Booklet" value={exam.booklet_type} />
          <DetailRow label="Scantron" value={exam.scantron_needed ? 'Yes' : null} />
          <DetailRow label="Calculator" value={exam.calculator_type} />
          <DetailRow label="Materials" value={exam.materials} />
          <DetailRow label="Collection method" value={exam.exam_collection_method} />
          {exam.student_instructions && (
            <div className="flex gap-3">
              <span className="text-xs text-gray-500 w-36 shrink-0">Student instructions</span>
              <span className="text-sm text-gray-800 whitespace-pre-wrap">{exam.student_instructions}</span>
            </div>
          )}
          {exam.password && (
            <div className="flex gap-3 items-center">
              <span className="text-xs text-gray-500 w-36 shrink-0">Password</span>
              <span className="text-sm text-gray-800 font-mono">
                {showPassword ? exam.password : '••••••••'}
              </span>
              <button
                onClick={() => setShowPassword(v => !v)}
                className="text-xs text-brand-600 hover:text-brand-800 ml-1"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          )}
          {exam.is_makeup && exam.makeup_notes && (
            <DetailRow label="Makeup notes" value={exam.makeup_notes} />
          )}
          {exam.estimated_copies && (
            <DetailRow label="Est. copies" value={exam.estimated_copies} />
          )}
        </div>
      </section>
    </div>
  );
}

function FilesTab({ exam }) {
  const hasLegacy = !!exam.file_path;
  const extraFiles = exam.extra_files ?? [];
  const totalFiles = (hasLegacy ? 1 : 0) + extraFiles.length;

  if (totalFiles === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No files uploaded yet</p>;
  }

  return (
    <div className="space-y-2">
      {hasLegacy && (
        <div className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {exam.file_original_name ?? `${exam.course_code} exam`}
            </p>
            {exam.file_size && (
              <p className="text-xs text-gray-400">{formatBytes(exam.file_size)}</p>
            )}
          </div>
          <button
            onClick={() => downloadFile(
              `/api/prep/uploads/${exam.upload_id}/file`,
              exam.file_original_name ?? `${exam.course_code}.pdf`,
            )}
            className="px-3 py-1 text-xs font-medium bg-brand-600 hover:bg-brand-800
                       text-white rounded-lg transition-colors shrink-0"
          >
            Download
          </button>
        </div>
      )}
      {extraFiles.map(f => (
        <div key={f.id} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-gray-900">{f.name}</p>
            {f.size && <p className="text-xs text-gray-400">{formatBytes(f.size)}</p>}
          </div>
          <button
            onClick={() => downloadFile(
              `/api/prep/uploads/${exam.upload_id}/files/${f.id}`,
              f.name,
            )}
            className="px-3 py-1 text-xs font-medium bg-brand-600 hover:bg-brand-800
                       text-white rounded-lg transition-colors shrink-0"
          >
            Download
          </button>
        </div>
      ))}
    </div>
  );
}

function fmtMsgTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-CA', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const ROLE_LABELS = {
  institution_admin: 'Admin',
  lead:              'Lead',
  professor:         'Prof',
  counsellor:        'Counsellor',
};

async function downloadMsgFile(filePath, filename) {
  try {
    const res = await fetch(`/api/prep/uploads/message-files/${encodeURIComponent(filePath)}`, { credentials: 'include' });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    alert('Download failed. Please try again.');
  }
}

function ThreadTab({ uploadId, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [body,     setBody]     = useState('');
  const [file,     setFile]     = useState(null);
  const [sending,  setSending]  = useState(false);
  const bottomRef = useRef(null);
  const fileRef   = useRef(null);

  useEffect(() => {
    if (!uploadId) { setLoading(false); return; }
    fetch(`/api/prep/uploads/${uploadId}/messages`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.ok) setMessages(d.messages); })
      .finally(() => setLoading(false));
  }, [uploadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    if (!body.trim() && !file) return;
    setSending(true);
    try {
      const fd = new FormData();
      if (body.trim()) fd.append('body', body.trim());
      if (file) fd.append('file', file);
      const res = await fetch(`/api/prep/uploads/${uploadId}/messages`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Send failed');
      setMessages(m => [...m, { ...data.message, first_name: '', last_name: 'You', sender_role: 'lead', files: data.message.files ?? [] }]);
      setBody('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!uploadId) {
    return <p className="text-sm text-gray-400 text-center py-8">No exam upload linked yet</p>;
  }

  return (
    <div className="flex flex-col h-full -mx-5 -my-4">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No messages yet. Start the conversation.</p>
        ) : (
          messages.map(m => {
            const isOwn = m.sent_by === currentUserId;
            const name = isOwn ? 'You' : `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
            const roleLabel = ROLE_LABELS[m.sender_role] ?? m.sender_role;
            return (
              <div key={m.id} className={`flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="font-medium text-gray-600">{name}</span>
                  {roleLabel && <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{roleLabel}</span>}
                  <span>{fmtMsgTime(m.created_at)}</span>
                </div>
                {m.body && (
                  <div className={`text-sm px-3 py-2 rounded-xl max-w-xs whitespace-pre-wrap break-words ${
                    isOwn ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {m.body}
                  </div>
                )}
                {m.files?.map(f => (
                  <button key={f.id}
                    onClick={() => downloadMsgFile(f.file_path, f.original_name)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200
                               bg-white text-brand-600 hover:bg-gray-50 transition-colors">
                    <span>📎</span>
                    <span className="underline">{f.original_name}</span>
                    {f.file_size && <span className="text-gray-400 no-underline">{formatBytes(f.file_size)}</span>}
                  </button>
                ))}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <form onSubmit={handleSend}
        className="shrink-0 border-t border-gray-200 px-4 py-3 bg-white space-y-2">
        {file && (
          <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 px-2 py-1.5 rounded-lg">
            <span>📎 {file.name}</span>
            <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
              className="ml-auto text-gray-400 hover:text-gray-600">×</button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
            rows={2}
            placeholder="Write a message… (Enter to send)"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none
                       focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <div className="flex flex-col gap-1.5 shrink-0">
            <button type="button"
              onClick={() => fileRef.current?.click()}
              title="Attach file"
              className="p-2 text-gray-400 hover:text-brand-600 border border-gray-300 rounded-lg
                         hover:border-brand-400 transition-colors text-sm">
              📎
            </button>
            <button type="submit" disabled={sending || (!body.trim() && !file)}
              className="px-3 py-2 text-xs font-medium bg-brand-600 hover:bg-brand-800 text-white
                         rounded-lg transition-colors disabled:opacity-40">
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
          onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </form>
    </div>
  );
}

const TABS = ['Details', 'Files', 'Thread'];

export default function ExamSidePanel({ exam, onClose }) {
  const [tab, setTab] = useState('Details');
  const { user } = useAuth();

  const typeParts = [exam.exam_type_label, exam.version_label].filter(Boolean);
  const typeLabel = typeParts.join(' · ');

  const fileCount = (exam.file_path ? 1 : 0) + (exam.extra_files?.length ?? 0);

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
            <h2 className="text-base font-semibold text-gray-900 font-mono">{exam.course_code}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{typeLabel}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {exam.prof_first} {exam.prof_last}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-200 shrink-0 px-1">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t}
              {t === 'Files' && fileCount > 0 && (
                <span className="ml-1.5 bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full">
                  {fileCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className={`flex-1 min-h-0 ${tab === 'Thread' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'} px-5 py-4`}>
          {tab === 'Details' && <DetailsTab exam={exam} />}
          {tab === 'Files' && <FilesTab exam={exam} />}
          {tab === 'Thread' && <ThreadTab uploadId={exam.upload_id} currentUserId={user?.id} />}
        </div>
      </div>
    </>
  );
}
