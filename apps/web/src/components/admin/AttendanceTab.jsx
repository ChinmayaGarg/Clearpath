import { useState, useEffect, useMemo, useRef } from 'react';
import { api }   from '../../lib/api.js';
import { toast } from '../ui/Toast.jsx';
import Spinner   from '../ui/Spinner.jsx';

const today = () => new Date().toISOString().slice(0, 10);

// Searchable dropdown used for Room and Course filters
function SearchDropdown({ value, onChange, options, placeholder, displayLabel }) {
  const [query,  setQuery]  = useState('');
  const [open,   setOpen]   = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(query.toLowerCase()),
  );

  const selectedLabel = value ? (options.find(o => o.value === value)?.label ?? value) : '';

  function select(val) {
    onChange(val);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <input
          type="text"
          value={open ? query : selectedLabel}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-3 pr-7 py-1.5 text-sm border border-gray-300 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
        />
        {value ? (
          <button
            type="button"
            onClick={() => { select(''); setQuery(''); }}
            className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600 text-base"
          >×</button>
        ) : (
          <span className="absolute inset-y-0 right-2 flex items-center text-gray-400 pointer-events-none text-xs">▾</span>
        )}
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200
                        rounded-lg shadow-lg z-20 max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">No results</p>
          ) : (
            filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => select(o.value)}
                className={`w-full text-left px-3 py-2 text-xs border-b border-gray-100 last:border-0
                            transition-colors hover:bg-gray-50
                            ${o.value === value ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'}`}
              >
                {displayLabel ? displayLabel(o) : o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_FILTERS = ['All', 'Show', 'No Show', 'Not Recorded'];

function fmtDate(d) {
  const s = String(d).slice(0, 10);
  return new Date(s + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function AttendanceControls({ bookingId, status, acting, onAttendance }) {
  const isActing = acting === bookingId;
  if (status === 'show') {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">Show</span>
        <button
          disabled={isActing}
          onClick={() => onAttendance(bookingId, 'no_show')}
          className="px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200
                     rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
        >{isActing ? '…' : 'No Show'}</button>
        <button
          disabled={isActing}
          onClick={() => onAttendance(bookingId, null)}
          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 px-1"
          title="Clear"
        >×</button>
      </div>
    );
  }
  if (status === 'no_show') {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-medium">No Show</span>
        <button
          disabled={isActing}
          onClick={() => onAttendance(bookingId, 'show')}
          className="px-2.5 py-1 text-xs font-medium text-green-700 border border-green-300
                     rounded-lg hover:bg-green-50 disabled:opacity-40 transition-colors"
        >{isActing ? '…' : 'Show'}</button>
        <button
          disabled={isActing}
          onClick={() => onAttendance(bookingId, null)}
          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 px-1"
          title="Clear"
        >×</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        disabled={isActing}
        onClick={() => onAttendance(bookingId, 'show')}
        className="px-2.5 py-1 text-xs font-medium text-green-700 border border-green-300
                   rounded-lg hover:bg-green-50 disabled:opacity-40 transition-colors"
      >{isActing ? '…' : 'Show'}</button>
      <button
        disabled={isActing}
        onClick={() => onAttendance(bookingId, 'no_show')}
        className="px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200
                   rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
      >{isActing ? '…' : 'No Show'}</button>
    </div>
  );
}

export default function AttendanceTab() {
  const [date,       setDate]      = useState(today());
  const [students,   setStudents]  = useState([]);
  const [loading,    setLoading]   = useState(false);
  const [acting,     setActing]    = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [roomFilter,   setRoomFilter]   = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [query,        setQuery]        = useState('');

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

  // Derive filter option lists from full student set
  const rooms = useMemo(() => {
    const names = [...new Set(students.map(s => s.roomName ?? '__unassigned__'))].sort((a, b) => {
      if (a === '__unassigned__') return 1;
      if (b === '__unassigned__') return -1;
      return a.localeCompare(b);
    });
    return names;
  }, [students]);

  const courses = useMemo(() =>
    [...new Set(students.map(s => s.courseCode))].sort(),
  [students]);

  // Summary counts (always over full set, not filtered)
  const showCount        = students.filter(s => s.attendanceStatus === 'show').length;
  const noShowCount      = students.filter(s => s.attendanceStatus === 'no_show').length;
  const notRecordedCount = students.filter(s => !s.attendanceStatus).length;

  // Apply all filters
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter(s => {
      if (statusFilter === 'Show'         && s.attendanceStatus !== 'show')    return false;
      if (statusFilter === 'No Show'      && s.attendanceStatus !== 'no_show') return false;
      if (statusFilter === 'Not Recorded' && s.attendanceStatus)               return false;

      const roomKey = s.roomName ?? '__unassigned__';
      if (roomFilter && roomKey !== roomFilter) return false;

      if (courseFilter && s.courseCode !== courseFilter) return false;

      if (q) {
        const name    = `${s.firstName} ${s.lastName}`.toLowerCase();
        const banner  = (s.studentNumber ?? '').toLowerCase();
        const prof    = `${s.profFirstName ?? ''} ${s.profLastName ?? ''}`.toLowerCase().trim();
        const profEmail = (s.profEmail ?? '').toLowerCase();
        if (!name.includes(q) && !banner.includes(q) && !prof.includes(q) && !profEmail.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [students, statusFilter, roomFilter, courseFilter, query]);

  // Group filtered students by room
  const byRoom = useMemo(() => {
    const map = {};
    for (const s of filtered) {
      const key = s.roomName ?? '__unassigned__';
      (map[key] ??= []).push(s);
    }
    return Object.entries(map).sort(([a], [b]) => {
      if (a === '__unassigned__') return 1;
      if (b === '__unassigned__') return -1;
      return a.localeCompare(b);
    });
  }, [filtered]);

  const hasFilters = statusFilter !== 'All' || roomFilter || courseFilter || query.trim();

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
          onChange={e => { setDate(e.target.value); setRoomFilter(''); setCourseFilter(''); setQuery(''); setStatusFilter('All'); }}
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
          <span className="text-green-700"><strong>{showCount}</strong> show</span>
          <span className="text-red-600"><strong>{noShowCount}</strong> no-show</span>
          <span className="text-gray-500"><strong>{notRecordedCount}</strong> not recorded</span>
        </div>
      )}

      {/* Search + dropdowns */}
      {!loading && students.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm pointer-events-none">⌕</span>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, banner ID, professor…"
              className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600 text-base"
              >×</button>
            )}
          </div>

          {/* Room filter */}
          <div className="w-44">
            <SearchDropdown
              value={roomFilter}
              onChange={setRoomFilter}
              options={rooms.map(r => ({ value: r, label: r === '__unassigned__' ? 'Unassigned' : r }))}
              placeholder="All rooms"
            />
          </div>

          {/* Course filter */}
          <div className="w-44">
            <SearchDropdown
              value={courseFilter}
              onChange={setCourseFilter}
              options={courses.map(c => ({ value: c, label: c }))}
              placeholder="All courses"
            />
          </div>

          {/* Clear filters */}
          {hasFilters && statusFilter === 'All' && (
            <button
              onClick={() => { setRoomFilter(''); setCourseFilter(''); setQuery(''); }}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200
                         rounded-lg hover:bg-gray-50 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Status filter tabs */}
      {!loading && students.length > 0 && (
        <div className="flex gap-1 mb-4">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                ${statusFilter === f
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
          <p className="text-xs text-gray-400 mt-1">{date ? fmtDate(date) : ''}</p>
        </div>
      ) : byRoom.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">No students match the current filters</p>
        </div>
      ) : (
        <div className="space-y-4">
          {byRoom.map(([roomName, roomStudents]) => {
            const isUnassigned = roomName === '__unassigned__';
            // Group within room by course+examType
            const byCourse = {};
            for (const s of roomStudents) {
              const key = `${s.courseCode}__${s.examType}`;
              (byCourse[key] ??= { courseCode: s.courseCode, examType: s.examType, students: [] }).students.push(s);
            }
            const roomShow     = roomStudents.filter(s => s.attendanceStatus === 'show').length;
            const roomNoShow   = roomStudents.filter(s => s.attendanceStatus === 'no_show').length;
            const roomPending  = roomStudents.filter(s => !s.attendanceStatus).length;

            return (
              <div key={roomName}
                className={`bg-white rounded-xl border overflow-hidden
                  ${isUnassigned ? 'border-amber-200' : 'border-gray-200'}`}>
                {/* Room header */}
                <div className={`flex items-center justify-between px-4 py-2.5 border-b
                  ${isUnassigned ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                  <span className={`text-sm font-semibold ${isUnassigned ? 'text-amber-700' : 'text-gray-900'}`}>
                    {isUnassigned ? 'Unassigned (no schedule run)' : roomName}
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    {roomShow    > 0 && <span className="text-green-700 font-medium">{roomShow} show</span>}
                    {roomNoShow  > 0 && <span className="text-red-600 font-medium">{roomNoShow} no-show</span>}
                    {roomPending > 0 && <span className="text-gray-400">{roomPending} pending</span>}
                    <span className="text-gray-400">{roomStudents.length} student{roomStudents.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Students grouped by course */}
                <div className="divide-y divide-gray-100">
                  {Object.values(byCourse).map(group => (
                    <div key={`${group.courseCode}-${group.examType}`} className="px-4 py-2">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                        {group.courseCode} · {group.examType?.replace(/_/g, ' ')}
                      </p>
                      <div className="space-y-1.5">
                        {group.students.map(s => (
                          <div key={s.bookingId}
                            className="flex items-center justify-between gap-4 py-1.5">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-gray-900">
                                  {s.firstName} {s.lastName}
                                </span>
                                {s.studentNumber && (
                                  <span className="text-xs text-gray-400">#{s.studentNumber}</span>
                                )}
                                {s.profFirstName && (
                                  <span className="text-xs text-gray-400">
                                    · {s.profFirstName} {s.profLastName}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                                {s.examTime && <span>{s.examTime.slice(0, 5)}</span>}
                                {s.accommodations?.length > 0 && (
                                  <span>{s.accommodations.map(a => a.code).join(', ')}</span>
                                )}
                              </div>
                            </div>
                            <AttendanceControls
                              bookingId={s.bookingId}
                              status={s.attendanceStatus}
                              acting={acting}
                              onAttendance={handleAttendance}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
