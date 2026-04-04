/**
 * Full email log for a day — shown in the admin/analytics view.
 */
import { useState, useEffect } from 'react';
import { api }                 from '../../lib/api.js';

export default function EmailLog({ date }) {
  const [log,     setLog]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/books/${date}/email-log`)
      .then(d => setLog(d.log))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [date]);

  if (loading) return <div className="text-sm text-gray-400 py-4">Loading…</div>;
  if (!log.length) return <div className="text-sm text-gray-400 py-4">No emails sent for this day.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Course</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">To</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Sent by</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Status</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {log.map(entry => (
            <tr key={entry.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 font-medium">{entry.course_code}</td>
              <td className="px-4 py-2 text-gray-600">{entry.to_email}</td>
              <td className="px-4 py-2 text-gray-500">{entry.sent_by_name}</td>
              <td className="px-4 py-2">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  entry.delivery_status === 'delivered' ? 'bg-green-100 text-green-700' :
                  entry.delivery_status === 'sent'      ? 'bg-blue-100 text-blue-700'  :
                  entry.delivery_status === 'failed'    ? 'bg-red-100 text-red-600'    :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {entry.delivery_status}
                </span>
              </td>
              <td className="px-4 py-2 text-gray-400 text-xs">
                {new Date(entry.sent_at).toLocaleString('en-CA', {
                  hour: 'numeric', minute: '2-digit',
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
