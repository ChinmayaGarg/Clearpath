import { useState, useEffect } from 'react';
import { api }   from '../../lib/api.js';
import { toast } from '../ui/Toast.jsx';
import Spinner   from '../ui/Spinner.jsx';

const today = () => new Date().toISOString().slice(0, 10);

const FILTERS = ['All', 'Show', 'No Show', 'Not Recorded'];

function fmtDate(d) {
  const s = String(d).slice(0, 10);
  return new Date(s + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function AttendanceTab() {
  const [date,      setDate]     = useState(today());
  const [students,  setStudents] = useState([]);
  const [loading,   setLoading]  = useState(false);
  const [acting,    setActing]   = useState(null);
  const [filter,    setFilter]   = useState('All');

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    api.get(`/prep/students?date=${date}`)
      .then(res => setStudents(res.data ?? []))
      .catch(err => { toast(err.message, 'error'); setStudents([]); })
      .finally(() => setLoading(false));
  }, [date]);

  async function handleAttendance(bookingId, newStatus) {
    setActing(bookingId);
    try {
      await api.patch(`/prep/bookings/${bookingId}/attendance`, { status: newStatus });
      setStudents(prev => prev.map(s =>
        s.bookingId === bookingId ? { ...s, attendanceStatus: newStatus } : s,
      ));
    } catch (err) {
      toast(err.message ?? 'Failed to update attendance', 'error');
    } finally {
      setActing(null);
    }
  }

  const showCount        = students.filter(s => s.attendanceStatus === 'show').length;
  const noShowCount      = students.filter(s => s.attendanceStatus === 'no_show').length;
  const notRecordedCount = students.filter(s => !s.attendanceStatus).length;

  const filtered = students.filter(s => {
    if (filter === 'Show')         return s.attendanceStatus === 'show';
    if (filter === 'No Show')      return s.attendanceStatus === 'no_show';
    if (filter === 'Not Recorded') return !s.attendanceStatus;
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Attendance</h2>
          <p className="text-xs text-gray-500 mt-0.5">Mark show / no-show for confirmed students</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5
                     focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {/* Summary bar */}
      {!loading && students.length > 0 && (
        <div className="flex gap-5 text-sm bg-white border border-gray-200 rounded-xl px-5 py-3 mb-4">
          <span className="text-gray-600">
            <strong className="text-gray-900">{students.length}</strong> student{students.length !== 1 ? 's' : ''}
          </span>
          <span className="text-green-700">
            <strong>{showCount}</strong> show
          </span>
          <span className="text-red-600">
            <strong>{noShowCount}</strong> no-show
          </span>
          <span className="text-gray-400">
            <strong className="text-gray-600">{notRecordedCount}</strong> not recorded
          </span>
        </div>
      )}

      {/* Filter tabs */}
      {!loading && students.length > 0 && (
        <div className="flex gap-1 mb-4">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                ${filter === f
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {f}
              {f === 'Show'         && showCount        > 0 && <span className="ml-1 opacity-70">{showCount}</span>}
              {f === 'No Show'      && noShowCount      > 0 && <span className="ml-1 opacity-70">{noShowCount}</span>}
              {f === 'Not Recorded' && notRecordedCount > 0 && <span className="ml-1 opacity-70">{notRecordedCount}</span>}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : !students.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm font-medium text-gray-700">No confirmed students for this date</p>
          <p className="text-xs text-gray-400 mt-1">
            {date ? fmtDate(date) : ''}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">No students in this category</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => {
            const isActing = acting === s.bookingId;
            const status   = s.attendanceStatus;
            return (
              <div key={s.bookingId}
                className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
                {/* Left — student info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">
                      {s.firstName} {s.lastName}
                    </span>
                    {s.studentNumber && (
                      <span className="text-xs text-gray-400">#{s.studentNumber}</span>
                    )}
                    <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      {s.courseCode}
                    </span>
                    {s.examType && (
                      <span className="text-xs text-gray-400 capitalize">
                        {s.examType.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                    {s.examTime && <span>{s.examTime.slice(0, 5)}</span>}
                    {s.roomName && <span>{s.roomName}</span>}
                    {s.accommodations?.length > 0 && (
                      <span>{s.accommodations.map(a => a.code).join(', ')}</span>
                    )}
                  </div>
                </div>

                {/* Right — attendance controls */}
                <div className="flex items-center gap-2 shrink-0">
                  {status === 'show' && (
                    <>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">Show</span>
                      <button
                        disabled={isActing}
                        onClick={() => handleAttendance(s.bookingId, 'no_show')}
                        className="px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200
                                   rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
                      >
                        {isActing ? '…' : 'No Show'}
                      </button>
                      <button
                        disabled={isActing}
                        onClick={() => handleAttendance(s.bookingId, null)}
                        className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 px-1"
                        title="Clear"
                      >×</button>
                    </>
                  )}
                  {status === 'no_show' && (
                    <>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-medium">No Show</span>
                      <button
                        disabled={isActing}
                        onClick={() => handleAttendance(s.bookingId, 'show')}
                        className="px-2.5 py-1 text-xs font-medium text-green-700 border border-green-300
                                   rounded-lg hover:bg-green-50 disabled:opacity-40 transition-colors"
                      >
                        {isActing ? '…' : 'Show'}
                      </button>
                      <button
                        disabled={isActing}
                        onClick={() => handleAttendance(s.bookingId, null)}
                        className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 px-1"
                        title="Clear"
                      >×</button>
                    </>
                  )}
                  {!status && (
                    <>
                      <button
                        disabled={isActing}
                        onClick={() => handleAttendance(s.bookingId, 'show')}
                        className="px-2.5 py-1 text-xs font-medium text-green-700 border border-green-300
                                   rounded-lg hover:bg-green-50 disabled:opacity-40 transition-colors"
                      >
                        {isActing ? '…' : 'Show'}
                      </button>
                      <button
                        disabled={isActing}
                        onClick={() => handleAttendance(s.bookingId, 'no_show')}
                        className="px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200
                                   rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
                      >
                        {isActing ? '…' : 'No Show'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
