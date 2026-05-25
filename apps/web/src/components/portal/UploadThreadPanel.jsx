import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/authStore.js';

function formatBytes(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
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

async function downloadFile(filePath, filename) {
  try {
    const res = await fetch(`/api/portal/uploads/message-files/${encodeURIComponent(filePath)}`, { credentials: 'include' });
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

export default function UploadThreadPanel({ upload, onClose }) {
  const userId = useAuthStore(s => s.user?.id);

  const [messages, setMessages] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [body,     setBody]     = useState('');
  const [file,     setFile]     = useState(null);
  const [sending,  setSending]  = useState(false);
  const bottomRef = useRef(null);
  const fileRef   = useRef(null);

  useEffect(() => {
    setMessages([]);
    setLoading(true);
    fetch(`/api/portal/uploads/${upload.id}/messages`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.ok) setMessages(d.messages); })
      .finally(() => setLoading(false));
  }, [upload.id]);

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
      const res = await fetch(`/api/portal/uploads/${upload.id}/messages`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Send failed');
      setMessages(m => [...m, { ...data.message, first_name: 'You', last_name: '', sender_role: 'professor', files: data.message.files ?? [] }]);
      setBody('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  }

  const header = [upload.course_code, upload.exam_type_label].filter(Boolean).join(' · ');

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[480px] bg-white shadow-xl z-50
                      flex flex-col border-l border-gray-200">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{header}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Messages with your exam coordinator</p>
          </div>
          <button onClick={onClose}
            className="ml-4 text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">
            ×
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No messages yet. Start the conversation.</p>
          ) : (
            messages.map(m => {
              const isOwn = m.sent_by === userId;
              const name = isOwn ? 'You' : `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
              const roleLabel = ROLE_LABELS[m.sender_role] ?? m.sender_role;
              return (
                <div key={m.id} className={`flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className="font-medium text-gray-600">{name}</span>
                    {!isOwn && roleLabel && (
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{roleLabel}</span>
                    )}
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
                      onClick={() => downloadFile(f.file_path, f.original_name)}
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
                title="Attach cue sheet"
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
    </>
  );
}
