import { useState, useEffect, useRef, useCallback } from 'react';
import TopNav from '../components/ui/TopNav.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { useAuth } from '../hooks/useAuth.js';

function formatBytes(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function fmtMsgTime(iso) {
  return new Date(iso).toLocaleString('en-CA', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const ROLE_LABELS = {
  institution_admin: 'Admin',
  lead:              'Lead',
  professor:         'Prof',
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

// ── Thread panel ──────────────────────────────────────────────────────────────

function ThreadPanel({ conversation, currentUserId, onClose, onRead }) {
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
    fetch(`/api/prep/uploads/${conversation.upload_id}/messages`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setMessages(d.messages);
          onRead?.(conversation.upload_id);
        }
      })
      .finally(() => setLoading(false));
  }, [conversation.upload_id]); // eslint-disable-line

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
      const res = await fetch(`/api/prep/uploads/${conversation.upload_id}/messages`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Send failed');
      setMessages(m => [...m, {
        ...data.message,
        first_name: '', last_name: 'You',
        sender_role: 'lead',
        files: data.message.files ?? [],
      }]);
      setBody('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full border-l border-gray-200 bg-white">
      {/* Panel header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 font-mono">
            {conversation.course_code}
            <span className="font-sans font-normal text-gray-400 ml-2 capitalize">
              {conversation.exam_type_label?.replace(/_/g, ' ')}
            </span>
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {conversation.prof_first} {conversation.prof_last}
          </p>
        </div>
        <button onClick={onClose}
          className="ml-4 text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">
          ×
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No messages yet.</p>
        ) : (
          messages.map(m => {
            const isOwn = m.sent_by === currentUserId;
            const name = isOwn ? 'You' : `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
            const roleLabel = ROLE_LABELS[m.sender_role];
            return (
              <div key={m.id} className={`flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="font-medium text-gray-600">{name}</span>
                  {roleLabel && <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{roleLabel}</span>}
                  <span>{fmtMsgTime(m.created_at)}</span>
                </div>
                {m.body && (
                  <div className={`text-sm px-3 py-2 rounded-xl max-w-sm whitespace-pre-wrap break-words ${
                    isOwn ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {m.body}
                  </div>
                )}
                {m.files?.map(f => (
                  <button key={f.id}
                    onClick={() => downloadMsgFile(f.file_path, f.original_name)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border
                               border-gray-200 bg-white text-brand-600 hover:bg-gray-50 transition-colors">
                    <span>📎</span>
                    <span className="underline">{f.original_name}</span>
                    {f.file_size && <span className="text-gray-400">{formatBytes(f.file_size)}</span>}
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
            <button type="button" onClick={() => fileRef.current?.click()} title="Attach file"
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

// ── Messages page ─────────────────────────────────────────────────────────────

// ── Exam picker modal ─────────────────────────────────────────────────────────

function ExamPickerModal({ existingIds, onSelect, onClose }) {
  const [all,    setAll]    = useState([]);
  const [pLoad,  setPLoad]  = useState(true);
  const [pSearch,setPSearch]= useState('');

  useEffect(() => {
    fetch('/api/prep/exams', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.ok) setAll(d.uploads); })
      .finally(() => setPLoad(false));
  }, []);

  const available = all.filter(u => !existingIds.has(u.upload_id));
  const shown = available.filter(u => {
    const q = pSearch.toLowerCase();
    return !q
      || u.course_code?.toLowerCase().includes(q)
      || `${u.prof_first} ${u.prof_last}`.toLowerCase().includes(q)
      || u.exam_type_label?.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h3 className="text-sm font-semibold text-gray-900">Select an exam to message about</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="px-4 py-2 border-b border-gray-100 shrink-0">
          <input
            autoFocus
            value={pSearch}
            onChange={e => setPSearch(e.target.value)}
            placeholder="Search course, professor…"
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {pLoad ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              {available.length === 0 ? 'All exams already have a conversation' : 'No matches'}
            </p>
          ) : shown.map(u => (
            <button key={u.upload_id} onClick={() => onSelect(u)}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-medium text-gray-900">{u.course_code}</span>
                <span className="text-xs text-gray-400 capitalize">{u.exam_type_label?.replace(/_/g, ' ')}</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{u.prof_first} {u.prof_last}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Messages page ─────────────────────────────────────────────────────────────

export default function Messages() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [selected,      setSelected]      = useState(null);
  const [search,        setSearch]        = useState('');
  const [showPicker,    setShowPicker]    = useState(false);

  useEffect(() => {
    fetch('/api/prep/messages', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.ok) setConversations(d.conversations); })
      .finally(() => setLoading(false));
  }, []);

  const handleRead = useCallback((uploadId) => {
    setConversations(prev => prev.map(c =>
      c.upload_id === uploadId ? { ...c, unread_count: 0 } : c
    ));
  }, []);

  const filtered = conversations.filter(c => {
    const q = search.toLowerCase();
    return (
      c.course_code?.toLowerCase().includes(q) ||
      `${c.prof_first} ${c.prof_last}`.toLowerCase().includes(q) ||
      c.exam_type_label?.toLowerCase().includes(q)
    );
  });

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <TopNav />

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>

        {/* Conversation list */}
        <div className={`flex flex-col bg-white border-r border-gray-200
                         ${selected ? 'hidden md:flex md:w-80 lg:w-96' : 'flex-1 md:w-80 lg:w-96'}`}>
          {/* List header */}
          <div className="px-4 py-3 border-b border-gray-200 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-base font-semibold text-gray-900">
                Messages
                {totalUnread > 0 && (
                  <span className="ml-2 bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {totalUnread}
                  </span>
                )}
              </h1>
              <button
                onClick={() => setShowPicker(true)}
                className="text-xs font-medium text-brand-600 hover:text-brand-800 whitespace-nowrap"
              >
                + Add Exam
              </button>
            </div>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by course, professor…"
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {loading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">
                {search ? 'No conversations match your search' : 'No messages yet'}
              </p>
            ) : (
              filtered.map(c => {
                const isSelected = selected?.upload_id === c.upload_id;
                const hasUnread = c.unread_count > 0;
                return (
                  <button
                    key={c.upload_id}
                    onClick={() => setSelected(c)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      isSelected
                        ? 'bg-brand-50 border-l-2 border-brand-600'
                        : 'hover:bg-gray-50 border-l-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {hasUnread && (
                          <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0 mt-0.5" />
                        )}
                        <span className={`text-sm font-mono truncate ${hasUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                          {c.course_code}
                        </span>
                        <span className="text-xs text-gray-400 capitalize truncate shrink-0">
                          {c.exam_type_label?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{fmtRelative(c.latest_at)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {c.prof_first} {c.prof_last}
                    </p>
                    {c.last_body && (
                      <p className={`text-xs mt-0.5 truncate ${hasUnread ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                        {c.last_sender ? `${c.last_sender.split(' ')[0]}: ` : ''}{c.last_body}
                      </p>
                    )}
                    {c.unread_count > 0 && (
                      <span className="inline-block mt-1 text-xs bg-brand-600 text-white px-1.5 py-0.5 rounded-full">
                        {c.unread_count} new
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Thread panel */}
        {selected ? (
          <div className="flex-1 flex flex-col min-w-0">
            <ThreadPanel
              conversation={selected}
              currentUserId={user?.id}
              onClose={() => setSelected(null)}
              onRead={handleRead}
            />
          </div>
        ) : (
          <div className="flex-1 hidden md:flex items-center justify-center text-sm text-gray-400">
            Select a conversation to view messages
          </div>
        )}
      </div>

      {showPicker && (
        <ExamPickerModal
          existingIds={new Set(conversations.map(c => c.upload_id))}
          onSelect={u => {
            setSelected({ upload_id: u.upload_id, course_code: u.course_code, exam_type_label: u.exam_type_label, prof_first: u.prof_first, prof_last: u.prof_last });
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
