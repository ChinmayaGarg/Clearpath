import { useState, useEffect } from 'react';
import { api }     from '../lib/api.js';
import { toast }   from '../components/ui/Toast.jsx';
import Spinner     from '../components/ui/Spinner.jsx';
import TopNav      from '../components/ui/TopNav.jsx';

const today = () => new Date().toISOString().slice(0, 10);

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function addMinutes(timeStr, mins) {
  if (!timeStr || !mins) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const total  = h * 60 + m + mins;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

// Group students by room
function groupByRoom(students) {
  const rooms = {};
  for (const s of students) {
    const key = s.roomName ?? '__unassigned__';
    (rooms[key] ??= []).push(s);
  }
  // Sort: named rooms first, unassigned last; within each room sort by course then time
  const entries = Object.entries(rooms).sort(([a], [b]) => {
    if (a === '__unassigned__') return 1;
    if (b === '__unassigned__') return -1;
    return a.localeCompare(b);
  });
  return entries;
}

function AccomBadges({ accommodations }) {
  if (!accommodations?.length) return <span className="text-xs text-gray-400">No accommodations</span>;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {accommodations.map(a => (
        <span key={a.code}
          className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-medium">
          {a.code}
        </span>
      ))}
    </div>
  );
}

function StudentRow({ s }) {
  const writingMins = s.totalWritingMins;
  const endTime     = addMinutes(s.examTime, writingMins);
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">
            {s.firstName} {s.lastName}
          </span>
          {s.studentNumber && (
            <span className="text-xs text-gray-400">#{s.studentNumber}</span>
          )}
        </div>
        <AccomBadges accommodations={s.accommodations} />
        {s.specialMaterialsNote && (
          <p className="text-xs text-gray-500 mt-0.5 italic">{s.specialMaterialsNote}</p>
        )}
      </div>
      <div className="text-right text-xs text-gray-500 shrink-0 ml-4">
        {s.examTime && <div className="tabular-nums">{s.examTime}{endTime ? ` – ${endTime}` : ''}</div>}
        {writingMins ? <div className="text-gray-400">{writingMins} min writing</div> : null}
        {s.stbMins > 0 && <div className="text-indigo-500">+{s.stbMins} min STB</div>}
      </div>
    </div>
  );
}

function RoomCard({ roomName, students }) {
  const isUnassigned = roomName === '__unassigned__';
  // Group by course within the room
  const byCourse = {};
  for (const s of students) {
    const key = `${s.courseCode}__${s.examType}`;
    (byCourse[key] ??= { courseCode: s.courseCode, examType: s.examType, students: [] }).students.push(s);
  }

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${isUnassigned ? 'border-amber-200' : 'border-gray-200'}`}>
      <div className={`flex items-center justify-between px-4 py-2.5
        ${isUnassigned ? 'bg-amber-50' : 'bg-gray-50'} border-b
        ${isUnassigned ? 'border-amber-200' : 'border-gray-200'}`}>
        <span className={`text-sm font-semibold ${isUnassigned ? 'text-amber-700' : 'text-gray-900'}`}>
          {isUnassigned ? 'Unassigned (no schedule run)' : roomName}
        </span>
        <span className="text-xs text-gray-500">{students.length} student{students.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="divide-y divide-gray-100">
        {Object.values(byCourse).map(group => (
          <div key={`${group.courseCode}-${group.examType}`} className="px-4 py-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              {group.courseCode} · {group.examType?.replace('_', ' ')}
            </p>
            {group.students.map(s => <StudentRow key={s.bookingId} s={s} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Prep() {
  const [date,     setDate]     = useState(today());
  const [students, setStudents] = useState([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    api.get(`/prep/students?date=${date}`)
      .then(res => setStudents(res.data ?? []))
      .catch(err => { toast(err.message, 'error'); setStudents([]); })
      .finally(() => setLoading(false));
  }, [date]);

  const rooms = groupByRoom(students);
  const roomCount = rooms.filter(([k]) => k !== '__unassigned__').length;
  const courseCount = new Set(students.map(s => s.courseCode)).size;

  function openEDE() {
    window.open(`/api/prep/ede?date=${date}`, '_blank', 'noopener');
  }
  function openLabels() {
    window.open(`/api/prep/labels?date=${date}`, '_blank', 'noopener');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Exam Prep</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Print EDE sheets and labels for confirmed exam bookings
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        </div>

        {/* Summary + actions bar */}
        {!loading && students.length > 0 && (
          <div className="flex items-center justify-between bg-white border border-gray-200
                          rounded-xl px-5 py-3 mb-5">
            <div className="flex gap-6 text-sm text-gray-600">
              <span><strong className="text-gray-900">{students.length}</strong> student{students.length !== 1 ? 's' : ''}</span>
              <span><strong className="text-gray-900">{roomCount}</strong> room{roomCount !== 1 ? 's' : ''}</span>
              <span><strong className="text-gray-900">{courseCount}</strong> course{courseCount !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={openEDE}
                className="px-4 py-1.5 text-sm font-medium text-white bg-brand-600
                           hover:bg-brand-700 rounded-lg transition-colors"
              >
                Print EDEs
              </button>
              <button
                onClick={openLabels}
                className="px-4 py-1.5 text-sm font-medium text-brand-700 border border-brand-300
                           hover:bg-brand-50 rounded-lg transition-colors"
              >
                Print Labels
              </button>
            </div>
          </div>
        )}

        {/* Date heading */}
        {date && (
          <p className="text-xs text-gray-400 mb-3">{fmtDate(date)}</p>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !students.length ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm font-medium text-gray-700">No confirmed students for this date</p>
            <p className="text-xs text-gray-400 mt-1">
              Confirm bookings in the Admin → Bookings tab, then run a schedule to assign rooms.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {rooms.map(([roomName, roomStudents]) => (
              <RoomCard key={roomName} roomName={roomName} students={roomStudents} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
