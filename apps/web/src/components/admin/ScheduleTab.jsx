import { useState, useEffect } from 'react';
import { api }   from '../../lib/api.js';
import { toast } from '../ui/Toast.jsx';
import Spinner   from '../ui/Spinner.jsx';

function StudentRow({ s }) {
  const endTime = (s.examTime && s.computedDurationMins)
    ? s.endTime
    : null;

  return (
    <div className="flex items-center justify-between py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-gray-800 font-medium">
          {s.firstName} {s.lastName}
        </span>
        {s.studentNumber && <span className="text-gray-400">#{s.studentNumber}</span>}
        {s.strictlySolo && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700">
            SOLO
          </span>
        )}
        {s.prefersSolo && !s.strictlySolo && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
            OWN ROOM
          </span>
        )}
      </div>
      <span className="text-gray-500 tabular-nums">
        {s.examTime ? `${s.examTime}` : '—'}
        {endTime ? ` – ${endTime}` : ''}
        {s.computedDurationMins ? ` (${s.computedDurationMins} min)` : ''}
      </span>
    </div>
  );
}

function RoomCard({ roomName, capacity, students }) {
  // Group students by course code
  const byCourse = {};
  for (const s of students) {
    const key = s.courseCode ?? 'Unknown';
    (byCourse[key] ??= []).push(s);
  }

  const used = students.length;
  const utilColour = used >= capacity
    ? 'text-red-600'
    : used >= Math.ceil(capacity * 0.75)
      ? 'text-amber-600'
      : 'text-green-600';

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-900">{roomName}</span>
        <span className={`text-xs font-medium ${utilColour}`}>
          {used} / {capacity} seat{capacity !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {Object.entries(byCourse).map(([course, courseStudents]) => (
          <div key={course} className="px-4 py-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              {course}
            </p>
            {courseStudents.map(s => <StudentRow key={s.id} s={s} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScheduleTab() {
  const today = new Date().toISOString().slice(0, 10);

  const [rooms,       setRooms]       = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [date,        setDate]        = useState(today);
  const [selectedIds, setSelectedIds] = useState([]);
  const [schedule,    setSchedule]    = useState(null);   // { rooms: [...] }
  const [schedLoading, setSchedLoading] = useState(false);
  const [generating,  setGenerating]  = useState(false);

  // Load available rooms
  useEffect(() => {
    api.get('/institution/rooms')
      .then(res => {
        const r = res.data ?? [];
        setRooms(r);
        setSelectedIds(r.map(x => x.id)); // select all by default
      })
      .catch(err => toast(err.message, 'error'))
      .finally(() => setRoomsLoading(false));
  }, []);

  // Load existing schedule for the selected date
  useEffect(() => {
    if (!date) return;
    setSchedLoading(true);
    api.get(`/institution/schedule?date=${date}`)
      .then(res => setSchedule(res.data))
      .catch(() => setSchedule(null))
      .finally(() => setSchedLoading(false));
  }, [date]);

  function toggleRoom(id) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }

  async function handleGenerate() {
    if (!date)              return toast('Select a date first', 'error');
    if (!selectedIds.length) return toast('Select at least one room', 'error');
    setGenerating(true);
    try {
      const res = await api.post('/institution/schedule', { date, roomIds: selectedIds });
      setSchedule(res.data);
      toast('Schedule generated');
    } catch (err) {
      toast(err.message, 'error');
    } finally { setGenerating(false); }
  }

  if (roomsLoading) return <div className="flex justify-center py-10"><Spinner /></div>;

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900">Exam Schedule</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Auto-assign confirmed students to rooms based on accommodations and grouping rules
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap gap-6 items-start">
          {/* Date picker */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Exam date *</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {/* Room selector */}
          {rooms.length > 0 && (
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-gray-500 mb-1">Rooms available today</label>
              <div className="flex flex-wrap gap-2">
                {rooms.map(r => {
                  const checked = selectedIds.includes(r.id);
                  return (
                    <label
                      key={r.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer
                        text-xs font-medium transition-colors
                        ${checked
                          ? 'border-brand-400 bg-brand-50 text-brand-700'
                          : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRoom(r.id)}
                        className="sr-only"
                      />
                      {r.name}
                      <span className="text-[10px] opacity-70">({r.capacity})</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {rooms.length === 0 && (
            <p className="text-xs text-amber-600 mt-5">
              No rooms defined yet — add rooms in the Rooms tab first.
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={generating || !date || !selectedIds.length}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600
                       hover:bg-brand-700 rounded-lg disabled:opacity-50 transition-colors"
          >
            {generating ? 'Generating…' : schedule ? 'Re-generate schedule' : 'Generate schedule'}
          </button>
        </div>
      </div>

      {/* Schedule output */}
      {schedLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : !schedule ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm font-medium text-gray-700">No schedule yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Select a date and rooms, then click Generate schedule.
          </p>
        </div>
      ) : !schedule.rooms?.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm font-medium text-gray-700">No confirmed bookings for this date</p>
          <p className="text-xs text-gray-400 mt-1">
            Confirm bookings in the Bookings tab before generating a schedule.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500">
              {schedule.rooms.reduce((n, r) => n + r.students.length, 0)} students
              across {schedule.rooms.length} room{schedule.rooms.length !== 1 ? 's' : ''}
              · {new Date(date).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schedule.rooms.map(r => (
              <RoomCard
                key={r.roomId}
                roomName={r.roomName}
                capacity={r.capacity}
                students={r.students}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="mt-4 flex gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700">SOLO</span>
              RWG / DRAGON — must be alone
            </div>
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">OWN ROOM</span>
              Prefers own room
            </div>
          </div>
        </>
      )}
    </div>
  );
}
