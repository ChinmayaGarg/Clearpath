import { useState, useEffect } from 'react';
import { api }                 from '../../lib/api.js';
import { toast }               from '../ui/Toast.jsx';
import Spinner                 from '../ui/Spinner.jsx';

export default function ReuseRequests({ onRefresh }) {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [notes,    setNotes]    = useState({});
  const [acting,   setActing]   = useState(null);

  async function load() {
    api.get('/portal/reuse')
      .then(d => setRequests(d.requests))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function respond(requestId, status) {
    setActing(requestId);
    try {
      await api.post(`/portal/reuse/${requestId}/respond`, {
        status,
        professorNote: notes[requestId] || null,
      });
      toast(
        status === 'approved' ? 'Reuse approved' : 'Reuse denied',
        status === 'approved' ? 'success' : 'info'
      );
      await load();
      onRefresh?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setActing(null);
    }
  }

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  if (!requests.length) return (
    <div className="text-center py-12">
      <div className="text-3xl mb-3">✓</div>
      <p className="text-sm text-gray-500">No pending reuse requests</p>
      <p className="text-xs text-gray-400 mt-1">
        When a student needs a makeup exam, you'll be asked here whether they
        can use an existing exam you've already uploaded
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      {requests.map(r => (
        <div key={r.id}
          className="bg-white border border-amber-200 rounded-xl p-4">

          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">{r.course_code}</span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {r.exam_type_label}
                </span>
                {r.version_label && (
                  <span className="text-xs text-gray-400 italic">{r.version_label}</span>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Makeup exam requested for{' '}
                <strong>
                  {new Date(r.makeup_date + 'T12:00:00').toLocaleDateString('en-CA', {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })}
                </strong>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Requested by {r.requested_by_name ?? 'Accessibility Centre'} ·{' '}
                {new Date(r.requested_at).toLocaleDateString('en-CA', {
                  month: 'short', day: 'numeric',
                })}
              </p>
            </div>
            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded font-medium">
              Pending
            </span>
          </div>

          <div className="bg-gray-50 rounded-lg px-3 py-2 mb-3">
            <p className="text-xs text-gray-600">
              The Accessibility Centre is asking if they can reuse your{' '}
              <strong>{r.exam_type_label}</strong> exam for {r.course_code} for
              this makeup sitting. If you approve, no new upload is needed.
              If you deny, you'll be asked to upload a different exam.
            </p>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Note <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              value={notes[r.id] ?? ''}
              onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))}
              placeholder="Any notes for the AC team…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => respond(r.id, 'denied')}
              disabled={acting === r.id}
              className="flex-1 py-2 border border-red-300 text-red-600 text-sm
                         font-medium rounded-lg hover:bg-red-50 transition-colors
                         disabled:opacity-50"
            >
              Deny — I'll upload a new exam
            </button>
            <button
              onClick={() => respond(r.id, 'approved')}
              disabled={acting === r.id}
              className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-sm
                         font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {acting === r.id ? 'Saving…' : 'Approve — use same exam'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
