/**
 * Email composer — fetches a draft, lets the lead edit it, then sends.
 * Shows email log history below the compose area.
 */
import { useState, useEffect } from 'react';
import { api }                 from '../../lib/api.js';

function DeliveryBadge({ status }) {
  const map = {
    queued:    'bg-gray-100 text-gray-600',
    sent:      'bg-blue-100 text-blue-700',
    delivered: 'bg-green-100 text-green-700',
    bounced:   'bg-red-100 text-red-600',
    failed:    'bg-red-100 text-red-600',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

export default function EmailComposer({ exam, onClose }) {
  const [draft,      setDraft]      = useState(null);
  const [toEmail,    setToEmail]    = useState(exam.professor_email ?? '');
  const [subject,    setSubject]    = useState('');
  const [body,       setBody]       = useState('');
  const [log,        setLog]        = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    async function loadDraft() {
      try {
        const [draftData, logData] = await Promise.all([
          api.get(`/exams/${exam.id}/email`),
          api.get(`/exams/${exam.id}/email/log`),
        ]);
        setDraft(draftData);
        setSubject(draftData.subject);
        setBody(draftData.text);
        setLog(logData.log);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadDraft();
  }, [exam.id]);

  async function handleSend() {
    if (!toEmail) { setError('Recipient email is required'); return; }
    setError('');
    setSending(true);
    try {
      await api.post(`/exams/${exam.id}/email`, {
        toEmail,
        subject,
        htmlBody:  draft?.html ?? '',
        textBody:  body,
      });
      setSent(true);
      // Reload log
      const logData = await api.get(`/exams/${exam.id}/email/log`);
      setLog(logData.log);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (loading) return (
    <div className="p-6 text-sm text-gray-400 text-center">Loading draft…</div>
  );

  return (
    <div className="flex flex-col gap-4">

      {sent ? (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <p className="text-sm text-green-700 font-medium">Email sent successfully</p>
          <p className="text-xs text-green-600 mt-0.5">
            Exam status advanced to Emailed
          </p>
        </div>
      ) : (
        <>
          {/* To */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
            <input
              type="email"
              value={toEmail}
              onChange={e => setToEmail(e.target.value)}
              placeholder="professor@dal.ca"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Body
              <span className="text-gray-400 font-normal ml-1">(editable before sending)</span>
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={14}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs
                         font-mono focus:outline-none focus:ring-2 focus:ring-brand-600
                         resize-y"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm
                         font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex-1 py-2 bg-brand-600 hover:bg-brand-800 text-white
                         text-sm font-medium rounded-lg transition-colors
                         disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send email'}
            </button>
          </div>
        </>
      )}

      {/* Email log */}
      {log.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Email history
          </h3>
          <div className="space-y-2">
            {log.map(entry => (
              <div key={entry.id} className="flex items-center justify-between
                                             text-xs text-gray-600 bg-gray-50
                                             px-3 py-2 rounded-lg">
                <div>
                  <span className="font-medium">{entry.to_email}</span>
                  <span className="text-gray-400 ml-2">by {entry.sent_by_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <DeliveryBadge status={entry.delivery_status} />
                  <span className="text-gray-400">
                    {new Date(entry.sent_at).toLocaleString('en-CA', {
                      month: 'short', day: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
