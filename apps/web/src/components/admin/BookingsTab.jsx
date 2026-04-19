import { useState, useEffect } from 'react';
import { api }   from '../../lib/api.js';
import { toast } from '../ui/Toast.jsx';
import Spinner   from '../ui/Spinner.jsx';

const STATUS_LABELS = {
  pending:            { label: 'Awaiting professor', cls: 'bg-yellow-100 text-yellow-700' },
  professor_approved: { label: 'Professor approved', cls: 'bg-blue-100 text-blue-700' },
};

function DurationBadge({ r }) {
  if (!r.computed_duration_mins) {
    return <span className="text-xs text-gray-400">Duration unknown</span>;
  }
  return (
    <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded inline-block">
      {r.computed_duration_mins} min total
      {r.base_duration_mins > 0 && (
        <>
          {' '}({r.base_duration_mins} base
          {r.extra_mins > 0 && ` + ${r.extra_mins} extra`}
          {r.stb_mins   > 0 && ` + ${r.stb_mins} STB`})
        </>
      )}
    </span>
  );
}

export default function BookingsTab() {
  const today = new Date().toISOString().slice(0, 10);
  const [date,    setDate]    = useState('');   // empty = all upcoming
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState(null);

  function fetchBookings(d) {
    setLoading(true);
    const qs = d ? `?date=${d}` : '';
    api.get(`/institution/bookings${qs}`)
      .then(res => setBookings(res.data ?? []))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchBookings(date); }, [date]); // eslint-disable-line

  async function handleConfirm(id) {
    setActing(id);
    try {
      await api.patch(`/institution/bookings/${id}/confirm`, {});
      setBookings(prev => prev.filter(b => b.id !== id));
      toast('Booking confirmed');
    } catch (err) {
      toast(err.message, 'error');
    } finally { setActing(null); }
  }

  async function handleCancel(id) {
    setActing(id);
    try {
      await api.patch(`/institution/bookings/${id}/cancel`, {});
      setBookings(prev => prev.filter(b => b.id !== id));
      toast('Booking cancelled');
    } catch (err) {
      toast(err.message, 'error');
    } finally { setActing(null); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Pending Bookings</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Professor-approved exam requests awaiting your confirmation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Filter by date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5
                       focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {date && (
            <button
              onClick={() => setDate('')}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : !bookings.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm font-medium text-gray-700">No pending bookings</p>
          <p className="text-xs text-gray-400 mt-1">
            {date
              ? `No professor-approved requests on ${new Date(date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : 'Professor-approved exam requests will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">{bookings.length} pending request{bookings.length !== 1 ? 's' : ''}</p>
          {bookings.map(r => {
            const examDateStr = new Date(r.exam_date).toLocaleDateString('en-CA', {
              year: 'numeric', month: 'short', day: 'numeric',
            });
            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-gray-900">{r.course_code}</span>
                      <span className="text-xs text-gray-500 capitalize bg-gray-100 px-1.5 py-0.5 rounded">
                        {r.exam_type.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">
                      {r.first_name} {r.last_name}
                      {r.student_number ? ` · #${r.student_number}` : ''}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {examDateStr}
                      {r.exam_time ? ` at ${r.exam_time.slice(0, 5)}` : ''}
                    </p>
                    <div className="mt-1">
                      <DurationBadge r={r} />
                    </div>
                    {r.special_materials_note && (
                      <p className="text-xs text-gray-500 mt-1 italic">{r.special_materials_note}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleConfirm(r.id)}
                      disabled={acting === r.id}
                      className="px-3 py-1.5 text-xs font-medium text-green-700 border border-green-300
                                 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
                    >
                      {acting === r.id ? '…' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => handleCancel(r.id)}
                      disabled={acting === r.id}
                      className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200
                                 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {acting === r.id ? '…' : 'Cancel'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
