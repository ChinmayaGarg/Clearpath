import { useState, useEffect, useCallback } from 'react';
import { api }     from '../../lib/api.js';
import { toast }   from '../ui/Toast.jsx';
import Spinner     from '../ui/Spinner.jsx';

// ── Constants ─────────────────────────────────────────────────────────────────
const PX_PER_MIN   = 1.2;
const DAY_START    = 7 * 60;   // 07:00
const DAY_END      = 23 * 60;  // 23:00
const TOTAL_HEIGHT = (DAY_END - DAY_START) * PX_PER_MIN; // 1152 px
const HOURS        = Array.from({ length: DAY_END / 60 - DAY_START / 60 }, (_, i) => DAY_START / 60 + i);
const COL_WIDTH    = 130; // px per room column

const CALC_MAP = {
  scientific:       'Scientific',
  non_programmable: 'Non-programmable',
  financial:        'Financial',
  basic:            'Basic',
  none:             'No calculator',
};
const FMT_MAP  = { paper: 'Paper', crowdmark: 'Crowdmark', brightspace: 'Brightspace' };
const COLL_MAP = { delivery: 'Delivered to room', pickup_mah: 'MAH pickup', pickup_sexton: 'Sexton pickup' };
const BKLT_MAP = { not_needed: 'Not needed', engineering_booklet: 'Engineering booklet', essay_booklet: 'Essay booklet' };

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr()         { return new Date().toISOString().slice(0, 10); }
function shiftDate(d, n)    { const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10); }
function fmtDateLong(d)     { return new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
function fmtDateShort(d)    { return new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }); }

function timeToMins(t) {
  if (!t) return null;
  const [h, m] = String(t).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}
function minsToStr(m) {
  if (m == null) return null;
  return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
}
function blockTop(startMins)       { return (startMins - DAY_START) * PX_PER_MIN; }
function blockHeight(durationMins) { return Math.max(durationMins * PX_PER_MIN, 32); }

// ── AccomBadges ───────────────────────────────────────────────────────────────
function AccomBadges({ accommodations, small }) {
  if (!accommodations?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {accommodations.map(a => (
        <span key={a.code}
          className={`font-medium rounded px-1.5 py-0.5 ${small ? 'text-[9px]' : 'text-[10px]'}
            ${a.code.includes('RWG') || a.code.includes('DRAGON')
              ? 'bg-purple-100 text-purple-700'
              : 'bg-indigo-50 text-indigo-700'}`}>
          {a.code}
        </span>
      ))}
    </div>
  );
}

// ── Booking block — visual indicator only, click opens room panel ─────────────
function BookingBlock({ student, isRoomSelected, onClick }) {
  const startMins = timeToMins(student.examTime);
  const duration  = student.totalWritingMins ?? student.baseDurationMins ?? 0;
  const stbMins   = student.stbMins ?? 0;

  const hasTime = startMins != null;
  const top     = hasTime ? blockTop(startMins) : TOTAL_HEIGHT - 48;
  const height  = hasTime && duration ? blockHeight(duration + stbMins) : 32;
  const isRwg   = student.accommodations?.some(a => a.code.includes('RWG') || a.code.includes('DRAGON'));

  const bgCls = isRoomSelected
    ? 'bg-brand-200 border-brand-400'
    : isRwg
    ? 'bg-purple-100 border-purple-300 hover:bg-purple-200'
    : 'bg-blue-100 border-blue-300 hover:bg-blue-200';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      className={`absolute left-0.5 right-0.5 rounded border cursor-pointer transition-colors
                  overflow-hidden select-none ${bgCls}`}
      style={{ top, height }}
    >
      {startMins != null && height >= 24 && (
        <div className="p-1 text-[10px] text-gray-500 tabular-nums leading-tight truncate">
          {student.examTime}
        </div>
      )}
    </div>
  );
}

// ── Room panel — student list for a selected room ─────────────────────────────
function RoomPanel({ room, students, onClose, onSelectStudent, onAttendance, acting }) {
  const sorted = [...students].sort((a, b) => {
    const ta = timeToMins(a.examTime) ?? Infinity;
    const tb = timeToMins(b.examTime) ?? Infinity;
    return ta - tb;
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-[460px] bg-white border-l border-gray-200 shadow-2xl z-50 overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{room.name}</h2>
            <p className="text-xs text-gray-400">
              Capacity: {room.capacity}
              {room.features?.length > 0 && ` · ${room.features.join(', ')}`}
            </p>
          </div>
          <button onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600 text-2xl leading-none p-1 ml-3">
            ×
          </button>
        </div>

        {/* Student list */}
        <div className="flex-1 divide-y divide-gray-100">
          {sorted.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No students assigned</p>
          ) : sorted.map(s => {
            const startMins = timeToMins(s.examTime);
            const dur = (s.totalWritingMins ?? s.baseDurationMins ?? 0) + (s.stbMins ?? 0);
            const endMins = startMins != null && dur ? startMins + dur : null;
            const isActing = acting === s.bookingId;

            return (
              <div key={s.bookingId} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-gray-400 tabular-nums">
                      {s.examTime
                        ? <>{s.examTime}{endMins ? ` – ${minsToStr(endMins)}` : ''}</>
                        : <span className="text-amber-500">No time set</span>
                      }
                    </p>
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {s.firstName} {s.lastName}
                      {s.studentNumber && (
                        <span className="text-xs text-gray-400 font-normal ml-1.5">#{s.studentNumber}</span>
                      )}
                    </p>
                    <AccomBadges accommodations={s.accommodations} small />
                  </div>
                  <button
                    onClick={() => onSelectStudent(s)}
                    className="shrink-0 text-xs text-brand-600 hover:text-brand-800 font-medium whitespace-nowrap"
                  >
                    Details →
                  </button>
                </div>

                {/* Attendance */}
                <div className="flex items-center gap-2 mt-2">
                  {s.attendanceStatus === 'show' ? (
                    <>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Show</span>
                      <button onClick={() => onAttendance(s.bookingId, null)} disabled={isActing}
                        className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40">Clear</button>
                    </>
                  ) : s.attendanceStatus === 'no_show' ? (
                    <>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">No Show</span>
                      <button onClick={() => onAttendance(s.bookingId, null)} disabled={isActing}
                        className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40">Clear</button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => onAttendance(s.bookingId, 'show')}
                        disabled={isActing}
                        className="px-2 py-0.5 text-xs border border-green-300 text-green-700 hover:bg-green-50 rounded disabled:opacity-40 transition-colors"
                      >
                        {isActing ? '…' : 'Show'}
                      </button>
                      <button
                        onClick={() => onAttendance(s.bookingId, 'no_show')}
                        disabled={isActing}
                        className="px-2 py-0.5 text-xs border border-red-300 text-red-700 hover:bg-red-50 rounded disabled:opacity-40 transition-colors"
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
      </div>
    </>
  );
}

// ── Student detail panel ──────────────────────────────────────────────────────
function StudentPanel({ student, rooms, date, onClose, onBack, onAttendanceChange, onRoomChange }) {
  const [moving,     setMoving]     = useState(false);
  const [targetRoom, setTargetRoom] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [saving,     setSaving]     = useState(false);

  const startMins  = timeToMins(student.examTime);
  const duration   = student.totalWritingMins ?? student.baseDurationMins ?? 0;
  const stbMins    = student.stbMins ?? 0;
  const endMins    = startMins != null && duration ? startMins + duration + stbMins : null;

  async function handleAttendance(status) {
    try {
      await api.patch(`/prep/bookings/${student.bookingId}/attendance`, { status });
      onAttendanceChange(student.bookingId, status);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleMove() {
    if (!targetRoom) return;
    setSaving(true);
    try {
      await api.post('/institution/schedule/assign', {
        bookingId: student.bookingId,
        roomId:    targetRoom,
        date,
        ...(targetTime ? { examTime: targetTime } : {}),
      });
      const room = rooms.find(r => r.id === targetRoom);
      onRoomChange(student.bookingId, targetRoom, room?.name ?? null, targetTime || null);
      toast('Room updated', 'success');
      setMoving(false);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleUnassign() {
    setSaving(true);
    try {
      await api.delete(`/institution/schedule/assign/${student.bookingId}`);
      onRoomChange(student.bookingId, null, null, null);
      toast('Removed from room', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-[460px] bg-white border-l border-gray-200
                      shadow-2xl z-50 overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button onClick={onBack}
                className="shrink-0 text-brand-600 hover:text-brand-800 text-xs font-medium">
                ← Back
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 truncate">
                {student.firstName} {student.lastName}
              </h2>
              {student.studentNumber && (
                <span className="text-xs text-gray-400">#{student.studentNumber}</span>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600 text-2xl leading-none p-1 ml-3">
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 flex-1">

          {/* ① Accommodations */}
          {student.accommodations?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Accommodations</p>
              <AccomBadges accommodations={student.accommodations} />
              {student.specialMaterialsNote && (
                <p className="text-xs text-gray-500 mt-1 italic">{student.specialMaterialsNote}</p>
              )}
            </div>
          )}

          {/* ② Exam timing */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Room</span>
              <span className="text-sm font-semibold text-gray-900">
                {student.roomName ?? <span className="text-amber-600">Unassigned</span>}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Time</span>
              <span className="text-sm font-mono text-gray-800">
                {student.examTime ?? '—'}
                {endMins ? ` – ${minsToStr(endMins)}` : ''}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Writing</span>
              <span className="text-sm text-gray-700">
                {duration ? `${duration} min` : '—'}
                {stbMins > 0 && <span className="text-indigo-500 ml-1">+{stbMins} min STB</span>}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Course</span>
              <span className="text-sm font-medium text-gray-800">
                {student.courseCode}
                <span className="text-xs text-gray-400 font-normal ml-1 capitalize">
                  {student.examType?.replace(/_/g, ' ')}
                </span>
              </span>
            </div>
          </div>

          {/* ③ Exam details */}
          {student.examUploaded && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Exam details</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {[
                  ['Format',     FMT_MAP[student.profExamFormat]],
                  ['Calculator', CALC_MAP[student.calculatorType]],
                  ['Scantron',   student.scantronNeeded && student.scantronNeeded !== 'not_needed'
                                   ? { not_needed: null, purple: 'Purple', green: 'Green' }[student.scantronNeeded]
                                   : null],
                  ['Booklet',    BKLT_MAP[student.bookletType]],
                  ['Collection', COLL_MAP[student.examCollectionMethod]],
                ].map(([label, val]) => val ? (
                  <div key={label}>
                    <span className="text-gray-400">{label}: </span>
                    <span className="text-gray-700 font-medium">{val}</span>
                  </div>
                ) : null)}
              </div>
              {student.materials && (
                <p className="text-xs text-gray-600 mt-1.5">
                  <span className="text-gray-400 font-medium">Materials: </span>{student.materials}
                </p>
              )}
              {student.studentInstructions && (
                <p className="text-xs text-gray-600 mt-1">
                  <span className="text-gray-400 font-medium">Instructions: </span>{student.studentInstructions}
                </p>
              )}
              {student.examPassword && (
                <p className="text-xs text-gray-600 mt-1">
                  <span className="text-gray-400 font-medium">Password: </span>
                  <span className="font-mono font-bold">{student.examPassword}</span>
                </p>
              )}
              {student.uploadId && (
                <a
                  href={`/api/prep/uploads/${student.uploadId}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 mt-1.5"
                >
                  📎 Download exam file
                </a>
              )}
            </div>
          )}
          {!student.examUploaded && (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Exam not yet uploaded for this course
            </div>
          )}

          {/* ④ Professor contact */}
          {(student.profFirstName || student.profEmail || student.profPhone) && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Professor</p>
              <div className="space-y-0.5">
                {student.profFirstName && (
                  <p className="text-sm text-gray-800 font-medium">
                    {student.profFirstName} {student.profLastName}
                  </p>
                )}
                {student.profPhone && (
                  <a href={`tel:${student.profPhone}`}
                    className="block text-xs text-brand-600 hover:text-brand-800 hover:underline">
                    📞 {student.profPhone}
                  </a>
                )}
                {student.profEmail && (
                  <a href={`mailto:${student.profEmail}`}
                    className="block text-xs text-brand-600 hover:text-brand-800 hover:underline truncate">
                    ✉ {student.profEmail}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ⑤ Attendance */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Attendance</p>
            {student.attendanceStatus === 'show' && (
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">Show</span>
                <button onClick={() => handleAttendance(null)}
                  className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
              </div>
            )}
            {student.attendanceStatus === 'no_show' && (
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-medium">No Show</span>
                <button onClick={() => handleAttendance(null)}
                  className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
              </div>
            )}
            {!student.attendanceStatus && (
              <div className="flex gap-2">
                <button onClick={() => handleAttendance('show')}
                  className="px-3 py-1.5 text-xs font-medium border border-green-300 text-green-700
                             hover:bg-green-50 rounded-lg transition-colors">
                  Mark Show
                </button>
                <button onClick={() => handleAttendance('no_show')}
                  className="px-3 py-1.5 text-xs font-medium border border-red-300 text-red-700
                             hover:bg-red-50 rounded-lg transition-colors">
                  Mark No Show
                </button>
              </div>
            )}
          </div>

          {/* ⑥ Room actions */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Room</p>
            {!moving ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setMoving(true); setTargetRoom(student.roomId ?? ''); setTargetTime(''); }}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-700
                             hover:bg-gray-50 rounded-lg transition-colors"
                >
                  {student.roomId ? 'Move to different room' : 'Assign to room'}
                </button>
                {student.roomId && (
                  <button
                    onClick={handleUnassign}
                    disabled={saving}
                    className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors"
                  >
                    {saving ? 'Removing…' : 'Remove from room'}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={targetRoom}
                    onChange={e => setTargetRoom(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                  >
                    <option value="">Select room…</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} (cap. {r.capacity})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={targetTime}
                    onChange={e => setTargetTime(e.target.value)}
                    placeholder="Exam time (optional)"
                    className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                  <button
                    onClick={handleMove}
                    disabled={!targetRoom || saving}
                    className="px-3 py-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-700
                               text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setMoving(false)}
                    className="text-xs text-gray-500 hover:text-gray-700 px-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}

// ── Unbooked students panel ───────────────────────────────────────────────────
function UnbookedPanel({ students, rooms, date, onAssigned }) {
  const [assigningId, setAssigningId] = useState(null);
  const [targetRoom,  setTargetRoom]  = useState('');
  const [targetTime,  setTargetTime]  = useState('');
  const [saving,      setSaving]      = useState(false);

  async function handleAssign(student) {
    if (!targetRoom) return;
    setSaving(true);
    try {
      await api.post('/institution/schedule/assign', {
        bookingId: student.bookingId,
        roomId:    targetRoom,
        date,
        ...(targetTime ? { examTime: targetTime } : {}),
      });
      const room = rooms.find(r => r.id === targetRoom);
      onAssigned(student.bookingId, targetRoom, room?.name ?? null, targetTime || null);
      toast('Assigned to room', 'success');
      setAssigningId(null);
      setTargetRoom('');
      setTargetTime('');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!students.length) return (
    <div className="text-xs text-gray-400 text-center py-4">All students are assigned to rooms</div>
  );

  return (
    <div className="space-y-2">
      {students.map(s => {
        const isExpanded = assigningId === s.bookingId;
        return (
          <div key={s.bookingId}
            className="bg-white rounded-xl border border-amber-200 px-3 py-2.5 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {s.firstName} {s.lastName}
                  {s.studentNumber && <span className="text-xs text-gray-400 ml-1.5">#{s.studentNumber}</span>}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {s.courseCode}
                  {s.examType && <span className="ml-1 capitalize">{s.examType.replace(/_/g, ' ')}</span>}
                  {s.examTime && <span className="ml-1 tabular-nums">· {s.examTime}</span>}
                  {s.totalWritingMins && <span className="ml-1 text-gray-400">· {s.totalWritingMins} min</span>}
                </p>
                <AccomBadges accommodations={s.accommodations} small />
              </div>
              <button
                onClick={() => {
                  setAssigningId(isExpanded ? null : s.bookingId);
                  setTargetRoom('');
                  setTargetTime('');
                }}
                className="shrink-0 text-xs text-brand-600 hover:text-brand-800 font-medium"
              >
                {isExpanded ? 'Cancel' : 'Assign →'}
              </button>
            </div>
            {isExpanded && (
              <div className="pt-1 border-t border-gray-100 space-y-1.5">
                <select
                  value={targetRoom}
                  onChange={e => setTargetRoom(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs
                             focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                >
                  <option value="">Select room…</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>{r.name} (cap. {r.capacity})</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={targetTime}
                    onChange={e => setTargetTime(e.target.value)}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs
                               focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                  />
                  <button
                    onClick={() => handleAssign(s)}
                    disabled={!targetRoom || saving}
                    className="px-3 py-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-700
                               text-white rounded-lg transition-colors disabled:opacity-50 shrink-0"
                  >
                    {saving ? '…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EdDashboardTab() {
  const [date,         setDate]         = useState(todayStr());
  const [rooms,        setRooms]        = useState([]);
  const [students,     setStudents]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [roomSearch,   setRoomSearch]   = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [onlyOccupied, setOnlyOccupied] = useState(false);
  const [unbookedOpen, setUnbookedOpen] = useState(false);
  const [selectedRoom,    setSelectedRoom]    = useState(null); // room object
  const [selectedStudent, setSelectedStudent] = useState(null); // student object
  const [acting,       setActing]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [roomsRes, studentsRes] = await Promise.all([
        api.get('/institution/rooms'),
        api.get(`/prep/students?date=${date}`),
      ]);
      setRooms(roomsRes.data ?? []);
      setStudents(studentsRes.data ?? []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const assignedMap = {};
  const unbooked    = [];
  for (const s of students) {
    if (!s.roomId) { unbooked.push(s); continue; }
    (assignedMap[s.roomId] ??= []).push(s);
  }

  const q  = roomSearch.trim().toLowerCase();
  const cq = courseFilter.trim().toUpperCase();
  const filteredRooms = rooms.filter(r => {
    if (q  && !r.name.toLowerCase().includes(q)) return false;
    if (onlyOccupied && !assignedMap[r.id]?.length) return false;
    if (cq && !assignedMap[r.id]?.some(s => s.courseCode?.toUpperCase().includes(cq))) return false;
    return true;
  });

  // ── Attendance handler ───────────────────────────────────────────────────
  async function handleAttendance(bookingId, status) {
    setActing(bookingId);
    try {
      await api.patch(`/prep/bookings/${bookingId}/attendance`, { status });
      setStudents(prev => prev.map(s =>
        s.bookingId === bookingId ? { ...s, attendanceStatus: status } : s,
      ));
      if (selectedStudent?.bookingId === bookingId) {
        setSelectedStudent(prev => ({ ...prev, attendanceStatus: status }));
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setActing(null);
    }
  }

  // ── Room change handler (move / unassign / assign) ───────────────────────
  function handleRoomChange(bookingId, roomId, roomName, examTime) {
    setStudents(prev => prev.map(s =>
      s.bookingId === bookingId ? {
        ...s,
        roomId,
        roomName,
        ...(examTime != null ? { examTime } : {}),
      } : s,
    ));
    setSelectedStudent(null); // always return to room panel or close
  }

  // ── Summary counts ────────────────────────────────────────────────────────
  const showCount   = students.filter(s => s.attendanceStatus === 'show').length;
  const noShowCount = students.filter(s => s.attendanceStatus === 'no_show').length;

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        {/* Date nav */}
        <div className="flex items-center gap-1">
          <button onClick={() => setDate(d => shiftDate(d, -1))}
            className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 text-sm">←</button>
          <span className="text-sm font-semibold text-gray-800 min-w-[180px] text-center">
            {fmtDateShort(date)}
          </span>
          <button onClick={() => setDate(d => shiftDate(d, 1))}
            className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 text-sm">→</button>
          <button onClick={() => setDate(todayStr())}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
            Today
          </button>
        </div>

        {/* Room search */}
        <input
          value={roomSearch}
          onChange={e => setRoomSearch(e.target.value)}
          placeholder="Search rooms…"
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-40
                     focus:outline-none focus:ring-2 focus:ring-brand-600"
        />

        {/* Course filter */}
        <input
          value={courseFilter}
          onChange={e => setCourseFilter(e.target.value)}
          placeholder="Filter by course…"
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-36
                     focus:outline-none focus:ring-2 focus:ring-brand-600"
        />

        {/* Only occupied toggle */}
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyOccupied}
            onChange={e => setOnlyOccupied(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600"
          />
          Only occupied
        </label>

        {/* Summary */}
        {!loading && students.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-gray-500 ml-auto">
            <span><strong className="text-gray-800">{students.length}</strong> students</span>
            <span><strong className="text-green-700">{showCount}</strong> show</span>
            <span><strong className="text-red-600">{noShowCount}</strong> no-show</span>
          </div>
        )}

        {/* Unbooked toggle */}
        {!loading && unbooked.length > 0 && (
          <button
            onClick={() => setUnbookedOpen(o => !o)}
            className={`ml-auto px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
              ${unbookedOpen
                ? 'bg-amber-100 border-amber-400 text-amber-800'
                : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'}`}
          >
            {unbooked.length} unbooked {unbookedOpen ? '▴' : '▾'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <>
          {/* ── Timeline grid ──────────────────────────────────────────────── */}
          <div
            className="border border-gray-200 rounded-xl overflow-auto bg-white"
            style={{ maxHeight: 'calc(100vh - 220px)' }}
          >
            {/* Sticky header row */}
            <div className="flex sticky top-0 z-20 bg-white border-b border-gray-200">
              {/* Time corner */}
              <div className="sticky left-0 z-30 bg-white border-r border-gray-200 shrink-0"
                style={{ width: 56, minHeight: 44 }} />
              {/* Room headers */}
              {filteredRooms.map(room => (
                <div
                  key={room.id}
                  className="shrink-0 border-r border-gray-100 last:border-r-0 px-1.5 py-2"
                  style={{ width: COL_WIDTH }}
                >
                  <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{room.name}</p>
                  <p className="text-[10px] text-gray-400">
                    cap. {room.capacity}
                    {assignedMap[room.id]?.length > 0 && (
                      <span className="ml-1 text-brand-600 font-medium">
                        · {assignedMap[room.id].length}
                      </span>
                    )}
                  </p>
                </div>
              ))}
              {filteredRooms.length === 0 && (
                <div className="px-4 py-3 text-xs text-gray-400">No rooms match filters</div>
              )}
            </div>

            {/* Body: time axis + room columns */}
            <div className="flex" style={{ height: TOTAL_HEIGHT }}>
              {/* Sticky time column */}
              <div className="sticky left-0 z-10 bg-white border-r border-gray-200 shrink-0 relative"
                style={{ width: 56 }}>
                {HOURS.map(h => (
                  <div key={h}
                    className="absolute text-[10px] text-gray-400 tabular-nums text-right pr-2"
                    style={{ top: (h * 60 - DAY_START) * PX_PER_MIN - 7, width: 52 }}>
                    {h}:00
                  </div>
                ))}
              </div>

              {/* Room columns */}
              {filteredRooms.map(room => {
                const roomStudents = assignedMap[room.id] ?? [];
                const isEmpty = roomStudents.length === 0;
                const isSelected = selectedRoom?.id === room.id;
                return (
                  <div
                    key={room.id}
                    className={`shrink-0 relative border-r border-gray-100 last:border-r-0
                      ${isEmpty ? 'bg-emerald-50/60' : isSelected ? 'bg-brand-50/40' : 'bg-white'}`}
                    style={{ width: COL_WIDTH, height: TOTAL_HEIGHT }}
                  >
                    {/* Hourly gridlines */}
                    {HOURS.map(h => (
                      <div key={h}
                        className="absolute left-0 right-0 border-t border-gray-100 pointer-events-none"
                        style={{ top: (h * 60 - DAY_START) * PX_PER_MIN }} />
                    ))}

                    {/* Booking blocks — visual indicators, click also opens room panel */}
                    {roomStudents.map(s => (
                      <BookingBlock
                        key={s.bookingId}
                        student={s}
                        isRoomSelected={isSelected}
                        onClick={() => setSelectedRoom(room)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Unbooked panel ─────────────────────────────────────────────── */}
          {unbookedOpen && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-800 mb-3">
                Unbooked students — {fmtDateShort(date)}
                <span className="text-amber-600 font-normal ml-1">({unbooked.length})</span>
              </p>
              <UnbookedPanel
                students={unbooked}
                rooms={rooms}
                date={date}
                onAssigned={handleRoomChange}
              />
            </div>
          )}

          {/* Empty state */}
          {students.length === 0 && !loading && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center mt-2">
              <p className="text-sm font-medium text-gray-700">No confirmed students for {fmtDateLong(date)}</p>
              <p className="text-xs text-gray-400 mt-1">
                Confirm bookings in the Admin → Bookings tab, then run a schedule to assign rooms.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Panels ─────────────────────────────────────────────────────────── */}
      {selectedStudent ? (
        <StudentPanel
          student={selectedStudent}
          rooms={rooms}
          date={date}
          onBack={() => setSelectedStudent(null)}
          onClose={() => { setSelectedStudent(null); setSelectedRoom(null); }}
          onAttendanceChange={(bookingId, status) => {
            setStudents(prev => prev.map(s =>
              s.bookingId === bookingId ? { ...s, attendanceStatus: status } : s,
            ));
            setSelectedStudent(prev => ({ ...prev, attendanceStatus: status }));
          }}
          onRoomChange={handleRoomChange}
        />
      ) : selectedRoom ? (
        <RoomPanel
          room={selectedRoom}
          students={assignedMap[selectedRoom.id] ?? []}
          onClose={() => setSelectedRoom(null)}
          onSelectStudent={setSelectedStudent}
          onAttendance={handleAttendance}
          acting={acting}
        />
      ) : null}
    </div>
  );
}
