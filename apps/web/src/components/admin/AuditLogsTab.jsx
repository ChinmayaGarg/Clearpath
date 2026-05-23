import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api.js';
import { toast } from '../../components/ui/Toast.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

const ACTION_LABELS = {
  // Lead actions
  CORRECT_DROPOFF:    'Corrected drop-off details',
  CONFIRM_DROPOFF:    'Confirmed drop-off',
  UPDATE_EXAM_STAGE:  'Updated exam stage',
  UPDATE_ATTENDANCE:  'Updated attendance',
  CREATE_EXAM:        'Created exam',
  UPDATE_EXAM:        'Updated exam',
  DELETE_EXAM:        'Deleted exam',
  UPDATE_EXAM_STATUS: 'Updated exam status',
  ASSIGN_ROOM:        'Assigned room',
  REMOVE_ROOM:        'Removed room',
  SEND_PROF_EMAIL:    'Sent professor email',
  LINK_UPLOAD:        'Linked upload',
  CREATE_BOOK:        'Created exam day book',
  UPDATE_BOOK:        'Updated exam day book',
  // Admin actions
  CONFIRM_BOOKING:            'Confirmed booking',
  CANCEL_BOOKING:             'Cancelled booking',
  CREATE_ROOM:                'Created room',
  UPDATE_ROOM:                'Updated room',
  DELETE_ROOM:                'Deleted room',
  CREATE_ROOM_FEATURE:        'Created room feature',
  UPDATE_ROOM_FEATURE:        'Updated room feature',
  DELETE_ROOM_FEATURE:        'Deleted room feature',
  UPDATE_ACCOM_FEATURE_MAPPING: 'Updated accommodation feature mapping',
  CREATE_ACCOM_CODE:          'Created accommodation code',
  UPDATE_ACCOM_CODE:          'Updated accommodation code',
  DELETE_ACCOM_CODE:          'Deleted accommodation code',
  GENERATE_SCHEDULE:          'Generated schedule',
  CREATE_EXAM_SCHEDULE:       'Created exam schedule',
  UPDATE_EXAM_SCHEDULE:       'Updated exam schedule',
  DELETE_EXAM_SCHEDULE:       'Deleted exam schedule',
  APPROVE_CANCELLATION:       'Approved cancellation',
  REJECT_CANCELLATION:        'Rejected cancellation',
  CREATE_COURSE:              'Created course',
  UPDATE_COURSE:              'Updated course',
  DELETE_COURSE:              'Deactivated course',
  CREATE_TERM:                'Created term',
  UPDATE_TERM:                'Updated term',
  DELETE_TERM:                'Deleted term',
  CREATE_COURSE_OFFERING:     'Created course offering',
  DELETE_COURSE_OFFERING:     'Deleted course offering',
};

function formatTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const PAGE_SIZE = 50;

export default function AuditLogsTab() {
  const [leads, setLeads]           = useState([]);
  const [logs, setLogs]             = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [performedBy, setPerformedBy] = useState('');
  const [fromDate, setFromDate]     = useState('');
  const [toDate, setToDate]         = useState('');
  const [page, setPage]             = useState(1);

  const load = useCallback(async (leadId, from, to, pg) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg });
      if (leadId)  params.set('performedBy', leadId);
      if (from)    params.set('fromDate', from);
      if (to)      params.set('toDate', to);

      const data = await api.get(`/institution/audit-logs?${params}`);
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
      if (data.leads) setLeads(data.leads);
    } catch {
      toast('Failed to load audit logs', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(performedBy, fromDate, toDate, page);
  }, []); // eslint-disable-line

  function applyFilters() {
    setPage(1);
    load(performedBy, fromDate, toDate, 1);
  }

  function clearFilters() {
    setPerformedBy('');
    setFromDate('');
    setToDate('');
    setPage(1);
    load('', '', '', 1);
  }

  function goPage(pg) {
    setPage(pg);
    load(performedBy, fromDate, toDate, pg);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Audit Logs</h2>
        <p className="text-sm text-gray-500 mt-0.5">All actions taken by leads and admins</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Staff member</label>
          <select
            value={performedBy}
            onChange={e => setPerformedBy(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="">All staff</option>
            {['institution_admin', 'lead'].map(role => {
              const members = leads.filter(l => l.role === role);
              if (!members.length) return null;
              return (
                <optgroup key={role} label={role === 'institution_admin' ? 'Admins' : 'Leads'}>
                  {members.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.first_name} {l.last_name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>

        <button
          onClick={applyFilters}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
        >
          Apply
        </button>
        <button
          onClick={clearFilters}
          className="px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50"
        >
          Clear
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">No audit log entries found</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Timestamp</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Staff</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Action</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Entity</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {formatTs(log.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {log.first_name} {log.last_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.description ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {log.entity_type ?? '—'}
                      {log.entity_id ? ` #${log.entity_id}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => goPage(page - 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  Prev
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => goPage(page + 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
