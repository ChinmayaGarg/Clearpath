import { useState, useEffect, useCallback } from 'react';
import { api }     from '../lib/api.js';
import { toast }   from '../components/ui/Toast.jsx';
import Spinner     from '../components/ui/Spinner.jsx';
import TopNav      from '../components/ui/TopNav.jsx';

const today = () => new Date().toISOString().slice(0, 10);

const TYPE_LABELS = {
  // current
  final:      'Final',
  midterm:    'Midterm',
  quiz_1:     'Quiz 1',
  quiz_2:     'Quiz 2',
  quiz_3:     'Quiz 3',
  quiz_4:     'Quiz 4',
  test_1:     'Test 1',
  test_2:     'Test 2',
  test_3:     'Test 3',
  assignment: 'Assignment',
  // legacy
  endterm:    'End Term',
  tutorial:   'Tutorial',
  lab:        'Lab',
  quiz:       'Quiz',
  other:      'Other',
};

function fmtDate(d) {
  const s = String(d).slice(0, 10);
  return new Date(s + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function fmtDateShort(d) {
  const s = String(d).slice(0, 10);
  return new Date(s + 'T12:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
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

function AttendanceBadge({ status, bookingId, acting, onAttendance }) {
  const isActing = acting === bookingId;
  if (status === 'show') {
    return (
      <div className="flex items-center gap-1 mt-1">
        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Show</span>
        <button
          disabled={isActing}
          onClick={() => onAttendance(bookingId, null)}
          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40"
          title="Clear attendance"
        >×</button>
      </div>
    );
  }
  if (status === 'no_show') {
    return (
      <div className="flex items-center gap-1 mt-1">
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">No Show</span>
        <button
          disabled={isActing}
          onClick={() => onAttendance(bookingId, null)}
          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40"
          title="Clear attendance"
        >×</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 mt-1">
      <button
        disabled={isActing}
        onClick={() => onAttendance(bookingId, 'show')}
        className="text-xs px-2 py-0.5 rounded-full border border-green-300 text-green-700
                   hover:bg-green-50 disabled:opacity-40 transition-colors"
      >
        {isActing ? '…' : 'Show'}
      </button>
      <button
        disabled={isActing}
        onClick={() => onAttendance(bookingId, 'no_show')}
        className="text-xs px-2 py-0.5 rounded-full border border-red-300 text-red-700
                   hover:bg-red-50 disabled:opacity-40 transition-colors"
      >
        {isActing ? '…' : 'No Show'}
      </button>
    </div>
  );
}

function StudentRow({ s, acting, onAttendance }) {
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
        <AttendanceBadge
          status={s.attendanceStatus}
          bookingId={s.bookingId}
          acting={acting}
          onAttendance={onAttendance}
        />
      </div>
      <div className="text-right text-xs text-gray-500 shrink-0 ml-4">
        {s.examTime && <div className="tabular-nums">{s.examTime}{endTime ? ` – ${endTime}` : ''}</div>}
        {writingMins ? <div className="text-gray-400">{writingMins} min writing</div> : null}
        {s.stbMins > 0 && <div className="text-indigo-500">+{s.stbMins} min STB</div>}
      </div>
    </div>
  );
}

function RoomCard({ roomName, students, acting, onAttendance }) {
  const isUnassigned = roomName === '__unassigned__';
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
            {group.students.map(s => (
              <StudentRow key={s.bookingId} s={s} acting={acting} onAttendance={onAttendance} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Drop-off edit form options ────────────────────────────────────────────────

const EXAM_FORMATS = [
  { value: '',           label: 'Select…'      },
  { value: 'paper',      label: 'Paper'         },
  { value: 'crowdmark',  label: 'Crowdmark'     },
  { value: 'brightspace',label: 'Brightspace'   },
];

const CALCULATOR_TYPES = [
  { value: '',                label: 'Select…'                                         },
  { value: 'scientific',      label: 'Scientific calculator'                           },
  { value: 'non_programmable',label: 'Non-programmable & non-communicable calculator'  },
  { value: 'financial',       label: 'Financial calculator'                            },
  { value: 'basic',           label: 'Basic calculator'                                },
  { value: 'none',            label: 'No calculator'                                   },
];

const COLLECTION_METHODS = [
  { value: '',               label: 'Select…'                           },
  { value: 'delivery',       label: 'Delivered to room after exam'      },
  { value: 'pickup_mah',     label: 'Pickup from MAH (Studley Campus)'  },
  { value: 'pickup_sexton',  label: 'Pickup from Sexton Campus'         },
];

const BOOKLET_TYPES = [
  { value: '',                    label: 'Select…'            },
  { value: 'not_needed',          label: 'Not needed'         },
  { value: 'engineering_booklet', label: 'Engineering booklet'},
  { value: 'essay_booklet',       label: 'Essay booklet'      },
];

// ── DropoffCard ───────────────────────────────────────────────────────────────

function DropoffCard({ dropoff, onConfirmed }) {
  const [editOpen,     setEditOpen]     = useState(false);
  const [confirming,   setConfirming]   = useState(false);
  // localData drives the card summary — updated instantly on "Save", no API call yet
  const [localData,    setLocalData]    = useState(dropoff);
  // pendingEdits holds the payload to flush to the DB when "Mark as received" is clicked
  const [pendingEdits, setPendingEdits] = useState(null);
  const [form, setForm] = useState(() => ({
    exam_duration_mins:     dropoff.exam_duration_mins ?? '',
    exam_format:            dropoff.exam_format ?? '',
    calculator_type:        dropoff.calculator_type ?? '',
    scantron_needed:        dropoff.scantron_needed ?? '',
    booklet_type:           dropoff.booklet_type ?? '',
    exam_collection_method: dropoff.exam_collection_method ?? '',
    student_instructions:   dropoff.student_instructions ?? '',
    materials:              dropoff.materials ?? '',
    password:               dropoff.password ?? '',
    estimated_copies:       dropoff.estimated_copies ?? '',
  }));

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  // Synchronous — just updates local display, no API call
  function handleSave() {
    const payload = {
      ...form,
      exam_duration_mins:     form.exam_duration_mins  !== '' ? Number(form.exam_duration_mins)  : null,
      scantron_needed:        form.scantron_needed || null,
      estimated_copies:       form.estimated_copies !== '' ? Number(form.estimated_copies) : null,
      exam_format:            form.exam_format            || null,
      calculator_type:        form.calculator_type        || null,
      booklet_type:           form.booklet_type           || null,
      exam_collection_method: form.exam_collection_method || null,
      student_instructions:   form.student_instructions   || null,
      materials:              form.materials              || null,
      password:               form.password               || null,
    };
    setLocalData(prev => ({ ...prev, ...payload }));
    setPendingEdits(payload);
    setEditOpen(false);
    toast('Details updated — will be saved when you confirm receipt', 'success');
  }

  // Flushes any pending edits to DB first, then confirms the drop-off
  async function handleConfirm() {
    setConfirming(true);
    try {
      if (pendingEdits) {
        await api.patch(`/prep/dropoffs/${dropoff.upload_id}`, pendingEdits);
      }
      await api.post(`/prep/dropoffs/${dropoff.upload_id}/confirm`, {});
      toast('Drop-off confirmed', 'success');
      onConfirmed(dropoff.upload_id);
    } catch (err) {
      toast(err.message ?? 'Failed to confirm', 'error');
      setConfirming(false);
    }
  }

  const d = localData;
  return (
    <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 bg-orange-50 border-b border-orange-200">
        <div>
          <span className="text-sm font-semibold text-gray-900">{d.course_code}</span>
          <span className="text-xs text-gray-500 ml-2">
            {fmtDateShort(d.exam_date)}
            {d.time_slot ? ` · ${d.time_slot}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
            Physical drop-off
          </span>
          <button
            onClick={() => setEditOpen(o => !o)}
            className="text-xs text-brand-600 hover:text-brand-800 font-medium"
          >
            {editOpen ? 'Close' : 'Edit details'}
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-700">
          <span className="font-medium">{d.prof_first} {d.prof_last}</span>
          {d.prof_email && (
            <span className="text-gray-400 ml-1.5 text-xs">{d.prof_email}</span>
          )}
          {d.student_count > 0 && (
            <span className="text-gray-500 ml-3 text-xs">
              {d.student_count} confirmed student{d.student_count !== 1 ? 's' : ''}
            </span>
          )}
          {d.exam_duration_mins && (
            <span className="text-gray-400 ml-3 text-xs">{d.exam_duration_mins} min</span>
          )}
          {d.estimated_copies && (
            <span className="text-gray-400 ml-3 text-xs">{d.estimated_copies} copies</span>
          )}
        </div>
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="px-4 py-1.5 text-sm font-medium text-white bg-green-600
                     hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors shrink-0 ml-3"
        >
          {confirming ? 'Confirming…' : 'Mark as received'}
        </button>
      </div>

      {/* Inline edit form */}
      {editOpen && (
        <div className="px-4 pb-4 border-t border-orange-100 pt-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Edit exam details</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Duration (minutes)</label>
              <input
                type="number" min="1" max="600"
                value={form.exam_duration_mins}
                onChange={e => set('exam_duration_mins', e.target.value)}
                placeholder="e.g. 120"
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Exam format</label>
              <select
                value={form.exam_format}
                onChange={e => set('exam_format', e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {EXAM_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Calculator</label>
              <select
                value={form.calculator_type}
                onChange={e => set('calculator_type', e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {CALCULATOR_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Scantron needed</label>
              <select
                value={form.scantron_needed}
                onChange={e => set('scantron_needed', e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                <option value="">Select…</option>
                <option value="not_needed">Not needed</option>
                <option value="purple">Purple</option>
                <option value="green">Green</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Booklet type</label>
              <select
                value={form.booklet_type}
                onChange={e => set('booklet_type', e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {BOOKLET_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Exam collection method</label>
              <select
                value={form.exam_collection_method}
                onChange={e => set('exam_collection_method', e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {COLLECTION_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Materials permitted</label>
            <textarea
              value={form.materials}
              onChange={e => set('materials', e.target.value)}
              rows={2}
              placeholder="e.g. one double-sided cue sheet"
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                         resize-none focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Student instructions</label>
            <textarea
              value={form.student_instructions}
              onChange={e => set('student_instructions', e.target.value)}
              rows={2}
              placeholder="e.g. PDF submission allowed in last 10 minutes"
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                         resize-none focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          {form.exam_format === 'brightspace' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password (Brightspace)</label>
              <input
                type="text"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder="Exam password"
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Estimated copies</label>
              <input
                type="number" min="1"
                value={form.estimated_copies}
                onChange={e => set('estimated_copies', e.target.value)}
                placeholder="e.g. 30"
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setEditOpen(false)}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-xs font-medium text-white bg-brand-600
                         hover:bg-brand-800 rounded-lg transition-colors"
            >
              Save changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dropoffs Tab ──────────────────────────────────────────────────────────────

function DropoffsTab() {
  const [dropoffs, setDropoffs] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/prep/dropoffs')
      .then(res => setDropoffs(res.dropoffs ?? []))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleConfirmed(uploadId) {
    setDropoffs(prev => prev.filter(d => d.upload_id !== uploadId));
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;

  if (!dropoffs.length) return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <p className="text-sm font-medium text-gray-700">No pending physical drop-offs</p>
      <p className="text-xs text-gray-400 mt-1">
        Professors who choose to drop off exam papers will appear here until you confirm receipt.
      </p>
    </div>
  );

  // Filter by query — matches course code, professor name/email, or date string
  const q = query.trim().toLowerCase();
  const filtered = q
    ? dropoffs.filter(d =>
        d.course_code?.toLowerCase().includes(q) ||
        `${d.prof_first} ${d.prof_last}`.toLowerCase().includes(q) ||
        d.prof_email?.toLowerCase().includes(q) ||
        String(d.exam_date).slice(0, 10).includes(q)
      )
    : dropoffs;

  // Group by exam date
  const byDate = {};
  for (const d of filtered) {
    const key = String(d.exam_date).slice(0, 10);
    (byDate[key] ??= []).push(d);
  }

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="relative">
        <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none text-sm">
          ⌕
        </span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by course, professor, or date…"
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-500">No drop-offs match "{query}"</p>
        </div>
      ) : (
        Object.entries(byDate).map(([dateKey, items]) => (
          <div key={dateKey}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {fmtDate(dateKey)}
              <span className="ml-2 font-normal normal-case text-gray-300">
                {items.length} drop-off{items.length !== 1 ? 's' : ''}
              </span>
            </p>
            <div className="space-y-3">
              {items.map(d => (
                <DropoffCard key={d.upload_id} dropoff={d} onConfirmed={handleConfirmed} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Exam Day Tab ──────────────────────────────────────────────────────────────

function ExamDayTab() {
  const [date,       setDate]       = useState(today());
  const [labelsDate, setLabelsDate] = useState('');
  const [students,   setStudents]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [acting,     setActing]     = useState(null);

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

  const rooms = groupByRoom(students);
  const roomCount = rooms.filter(([k]) => k !== '__unassigned__').length;
  const courseCount = new Set(students.map(s => s.courseCode)).size;

  // Course+type groups with students but no exam upload
  const missingUploadCourses = [...new Map(
    students
      .filter(s => !s.examUploaded)
      .map(s => {
        const key = `${s.courseCode}__${s.examType}__${s.examTime ?? ''}`;
        return [key, {
          courseCode: s.courseCode,
          examType:   s.examType,
          examTime:   s.examTime,
          students:   students.filter(x => x.courseCode === s.courseCode && x.examType === s.examType && x.examTime === s.examTime && !x.examUploaded),
        }];
      })
  ).values()];

  return (
    <div>
      {/* Date picker + actions */}
      <div className="flex items-center justify-between mb-5">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2
                     focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        {!loading && students.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => window.open(`/api/prep/ede?date=${date}`, '_blank', 'noopener')}
              className="px-4 py-1.5 text-sm font-medium text-white bg-brand-600
                         hover:bg-brand-700 rounded-lg transition-colors"
            >
              Print EDEs
            </button>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={labelsDate || date}
                onChange={e => setLabelsDate(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                title="Labels date (defaults to selected exam day)"
              />
              <button
                onClick={() => window.open(`/api/prep/labels?date=${labelsDate || date}`, '_blank', 'noopener')}
                className="px-4 py-1.5 text-sm font-medium text-brand-700 border border-brand-300
                           hover:bg-brand-50 rounded-lg transition-colors"
              >
                Print Labels
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Summary bar */}
      {!loading && students.length > 0 && (
        <div className="flex gap-6 text-sm text-gray-600 bg-white border border-gray-200
                        rounded-xl px-5 py-3 mb-4">
          <span><strong className="text-gray-900">{students.length}</strong> student{students.length !== 1 ? 's' : ''}</span>
          <span><strong className="text-gray-900">{roomCount}</strong> room{roomCount !== 1 ? 's' : ''}</span>
          <span><strong className="text-gray-900">{courseCount}</strong> course{courseCount !== 1 ? 's' : ''}</span>
          <span>
            <strong className="text-green-700">{students.filter(s => s.attendanceStatus === 'show').length}</strong>
            {' / '}{students.length} attended
          </span>
        </div>
      )}

      {date && (
        <p className="text-xs text-gray-400 mb-3">{fmtDate(date)}</p>
      )}

      {/* Missing exam uploads warning */}
      {!loading && missingUploadCourses.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1.5">
          <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
            <span>⚠</span>
            Exam not uploaded for {missingUploadCourses.length} course{missingUploadCourses.length !== 1 ? 's' : ''} — EDEs will be incomplete
          </p>
          {missingUploadCourses.map(c => (
            <div key={`${c.courseCode}__${c.examType}__${c.examTime ?? ''}`} className="flex items-center gap-2 text-xs text-red-600">
              <span className="font-semibold">{c.courseCode}</span>
              {c.examType && <span>· {TYPE_LABELS[c.examType] ?? c.examType}</span>}
              {c.examTime && <span>· {c.examTime.slice(0,5)}</span>}
              <span className="text-red-400">· {c.students.length} student{c.students.length !== 1 ? 's' : ''} affected</span>
            </div>
          ))}
        </div>
      )}

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
            <RoomCard key={roomName} roomName={roomName} students={roomStudents}
              acting={acting} onAttendance={handleAttendance} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Exam Detail Card (shared by both Exam Details and Exam Book tabs) ─────────

const FMT_LABELS    = { paper: 'Paper', crowdmark: 'Crowdmark', brightspace: 'Brightspace' };
const BOOKLET_MAP   = { not_needed: 'Not needed', engineering_booklet: 'Engineering booklet', essay_booklet: 'Essay booklet' };
const CALC_MAP      = { scientific: 'Scientific', non_programmable: 'Non-programmable', financial: 'Financial', basic: 'Basic', none: 'No calculator' };
const COLLECT_MAP   = { delivery: 'Delivered to room', pickup_mah: 'MAH pickup', pickup_sexton: 'Sexton pickup' };

function DeliveryBadge({ delivery, dropoffConfirmedAt, filePath }) {
  if (delivery === 'dropped') {
    return dropoffConfirmedAt
      ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium shrink-0">Drop-off confirmed</span>
      : <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium shrink-0">Pending drop-off</span>;
  }
  return filePath
    ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium shrink-0">File uploaded</span>
    : <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium shrink-0">File not uploaded</span>;
}

function ExamDetailCard({ e }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-sm font-bold text-gray-900">{e.course_code}</span>
          {e.is_word_doc ? (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">RWG Word doc</span>
          ) : (
            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
              {TYPE_LABELS[e.exam_type_label] ?? e.exam_type_label}
            </span>
          )}
          {e.rwg_flag && !e.is_word_doc && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">RWG</span>
          )}
          {e.is_makeup && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">Makeup</span>
          )}
          {e.version_label && (
            <span className="text-xs text-gray-400 italic">{e.version_label}</span>
          )}
        </div>
        <DeliveryBadge delivery={e.delivery} dropoffConfirmedAt={e.dropoff_confirmed_at} filePath={e.file_path} />
      </div>

      {/* Prof + dates */}
      <div className="px-4 pt-3 pb-2 space-y-1.5">
        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
          <span className="font-medium text-gray-700">{e.prof_first} {e.prof_last}</span>
          {e.prof_email && <span>{e.prof_email}</span>}
          {e.prof_phone && <span>{e.prof_phone}</span>}
        </div>
        {/* dates array (Exam Details) or single time_slot (Exam Book) */}
        {e.dates?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {e.dates.map((d, i) => (
              <div key={i} className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                <span className="text-gray-700 font-medium">{fmtDateShort(d.exam_date)}</span>
                {d.time_slot && <span className="text-gray-400">· {d.time_slot.slice(0,5)}</span>}
                <span className="text-gray-400">· {d.student_count} student{d.student_count != 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        )}
        {/* Exam Book uses flat time_slot + student_count */}
        {!e.dates && (
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {e.time_slot && <span>{e.time_slot.slice(0,5)}</span>}
            <span>{e.student_count ?? 0} student{e.student_count != 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Exam fields grid */}
      {!e.is_word_doc && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 px-4 py-3 border-t border-gray-100 text-xs">
          {[
            ['Duration',    e.exam_duration_mins ? `${e.exam_duration_mins} min` : null],
            ['Format',      FMT_LABELS[e.exam_format] ?? null],
            ['Booklet',     BOOKLET_MAP[e.booklet_type] ?? null],
            ['Scantron',    { not_needed: 'Not needed', purple: 'Purple', green: 'Green' }[e.scantron_needed] ?? null],
            ['Calculator',  CALC_MAP[e.calculator_type] ?? null],
            ['Collection',  COLLECT_MAP[e.exam_collection_method] ?? null],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-gray-400 uppercase tracking-wide text-[9px] font-semibold">{label}</p>
              <p className="text-gray-800 font-medium mt-0.5">{val ?? <span className="text-gray-300">—</span>}</p>
            </div>
          ))}
        </div>
      )}

      {/* Text fields */}
      {(e.materials || e.student_instructions || e.password) && (
        <div className="px-4 pb-3 space-y-1 border-t border-gray-100 pt-2 text-xs">
          {e.materials           && <p className="text-gray-600"><span className="font-semibold text-gray-500">Materials:</span> {e.materials}</p>}
          {e.student_instructions && <p className="text-gray-600"><span className="font-semibold text-gray-500">Instructions:</span> {e.student_instructions}</p>}
          {e.password            && <p className="text-gray-600"><span className="font-semibold text-gray-500">Password:</span> <span className="font-mono font-bold">{e.password}</span></p>}
        </div>
      )}
    </div>
  );
}

// ── Exam Details Tab ──────────────────────────────────────────────────────────

function ExamDetailsTab() {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query,   setQuery]   = useState('');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    api.get('/prep/exam-details')
      .then(res => setUploads(res.uploads ?? []))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const filtered = uploads.filter(u => {
    if (dateFilter && !u.dates?.some(d => String(d.exam_date).slice(0, 10) === dateFilter)) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!u.course_code.toLowerCase().includes(q)
        && !`${u.prof_first} ${u.prof_last}`.toLowerCase().includes(q)
        && !(u.prof_email ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Search + date filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm">⌕</span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by course code or professor…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
          />
        </div>
        <div className="relative">
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600 text-base"
              title="Clear date filter"
            >×</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-500">
            {dateFilter || query ? 'No exams match the current filters' : 'No submitted upcoming exams'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(u => <ExamDetailCard key={u.upload_id} e={u} />)}
        </div>
      )}
    </div>
  );
}

// ── Exam Book Card ────────────────────────────────────────────────────────────

function fmt12(t) {
  if (!t) return null;
  const [h, m] = String(t).slice(0, 5).split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function ExamBookCard({ e }) {
  return (
    <div className={`border rounded-xl p-4 transition-all ${
      e.rwg_flag ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-300'
    }`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center flex-wrap gap-1.5">
          <span className="font-semibold text-gray-900">{e.course_code}</span>
          {e.is_word_doc && (
            <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-xs font-medium">RWG Word doc</span>
          )}
          {e.rwg_flag && !e.is_word_doc && (
            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium">RWG</span>
          )}
          {!e.is_word_doc && e.exam_type_label && (
            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-xs">
              {TYPE_LABELS[e.exam_type_label] ?? e.exam_type_label}
            </span>
          )}
          {e.is_makeup && (
            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-medium">Makeup</span>
          )}
          {e.version_label && (
            <span className="text-xs text-gray-400 italic">{e.version_label}</span>
          )}
        </div>
        <DeliveryBadge delivery={e.delivery} dropoffConfirmedAt={e.dropoff_confirmed_at} filePath={e.file_path} />
      </div>

      {/* Room / time chips */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {e.rooms?.length > 0
          ? e.rooms.map((r, i) => (
              <span key={i} className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                {r.student_count} @ {r.room_name ?? 'Unassigned'} @ {fmt12(r.start_time)}
              </span>
            ))
          : (
              <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                {e.student_count ?? 0} student{e.student_count != 1 ? 's' : ''}{e.time_slot ? ` · ${fmt12(e.time_slot)}` : ''}
              </span>
            )
        }
      </div>

      {/* Meta row */}
      {(e.prof_first || e.exam_duration_mins || e.exam_format || e.materials) && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {e.prof_first && (
            <span className="text-xs text-gray-500">{e.prof_first} {e.prof_last}</span>
          )}
          {e.exam_duration_mins && (
            <span className="text-xs text-gray-400">{e.exam_duration_mins} min</span>
          )}
          {e.exam_format && (
            <span className="text-xs text-gray-400">{FMT_LABELS[e.exam_format] ?? e.exam_format}</span>
          )}
          {e.materials && (
            <span className="text-xs text-gray-400 italic truncate max-w-xs">{e.materials}</span>
          )}
        </div>
      )}

      {/* No details fallback */}
      {!e.exam_duration_mins && !e.exam_format && !e.materials && !e.prof_first && (
        <p className="mt-2 text-xs text-gray-400 italic">No exam details yet</p>
      )}
    </div>
  );
}

// ── Exam Book Tab ─────────────────────────────────────────────────────────────

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function ExamBookTab() {
  const [date,   setDate]   = useState(today());
  const [exams,  setExams]  = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    api.get(`/prep/exam-book?date=${date}`)
      .then(res => setExams(res.exams ?? []))
      .catch(err => { toast(err.message, 'error'); setExams([]); })
      .finally(() => setLoading(false));
  }, [date]);

  const totalStudents = exams.reduce((n, e) => n + parseInt(e.student_count || 0), 0);

  return (
    <div>
      {/* Date nav */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(d => shiftDate(d, -1))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500 text-sm transition-colors">
            ←
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[160px] text-center">{fmtDate(date)}</span>
          <button onClick={() => setDate(d => shiftDate(d, 1))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500 text-sm transition-colors">
            →
          </button>
          <button onClick={() => setDate(today())}
            className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Today
          </button>
        </div>
        {!loading && exams.length > 0 && (
          <button
            onClick={() => window.open(`/api/prep/exam-book/print?date=${date}`, '_blank', 'noopener')}
            className="px-4 py-1.5 text-sm font-medium text-white bg-brand-600
                       hover:bg-brand-700 rounded-lg transition-colors">
            Print
          </button>
        )}
      </div>

      {/* Summary bar */}
      {!loading && exams.length > 0 && (
        <div className="flex gap-6 text-sm text-gray-600 bg-white border border-gray-200
                        rounded-xl px-5 py-3 mb-4">
          <span><strong className="text-gray-900">{exams.length}</strong> exam{exams.length !== 1 ? 's' : ''}</span>
          <span><strong className="text-gray-900">{totalStudents}</strong> student{totalStudents !== 1 ? 's' : ''}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : exams.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm font-medium text-gray-700">No submitted exams for this date</p>
          <p className="text-xs text-gray-400 mt-1">Professors need to submit their exam uploads for this date.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map(e => <ExamBookCard key={e.upload_id} e={e} />)}
        </div>
      )}
    </div>
  );
}

// ── Returns Tab ───────────────────────────────────────────────────────────────

const STAGE_ORDER  = ['prepped', 'ongoing', 'finished', 'returned'];
const STAGE_LABELS = { prepped: 'Prepped', ongoing: 'Ongoing', finished: 'Finished' };

function stageLabel(stage, collectionMethod) {
  if (stage === 'returned') {
    return collectionMethod === 'delivery' ? 'Delivered' : 'Prof Picked Up';
  }
  return STAGE_LABELS[stage] ?? 'Scheduled';
}

function returnedLabel(collectionMethod) {
  return collectionMethod === 'delivery' ? 'Delivered' : 'Prof Picked Up';
}

function fmtDateTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleString('en-CA', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function StageStepper({ sessionStage, collectionMethod }) {
  const allStages = ['scheduled', ...STAGE_ORDER];
  const currentIdx = sessionStage ? STAGE_ORDER.indexOf(sessionStage) + 1 : 0;

  const labels = [
    'Scheduled',
    'Prepped',
    'Ongoing',
    'Finished',
    returnedLabel(collectionMethod),
  ];

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {allStages.map((s, i) => {
        const done    = i < currentIdx;
        const current = i === currentIdx;
        return (
          <div key={s} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300 text-xs">—</span>}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full
              ${done    ? 'bg-green-100 text-green-700' : ''}
              ${current ? 'bg-brand-100 text-brand-700 ring-1 ring-brand-400' : ''}
              ${!done && !current ? 'text-gray-400' : ''}`}>
              {done ? '✓ ' : ''}{labels[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ReturnForm({ exam, acting, onAdvance }) {
  const expected = (exam.confirmedCount ?? 0) - (exam.noShowCount ?? 0);
  const expectedExtra = (exam.estimatedCopies ?? 0) - expected;
  const [completed, setCompleted] = useState('');
  const [extra,     setExtra]     = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const c = parseInt(completed);
    const x = parseInt(extra);
    if (isNaN(c) || c < 0 || isNaN(x) || x < 0) {
      toast('Enter valid copy counts (≥ 0)', 'error');
      return;
    }
    onAdvance(exam.uploadDateId, 'returned', { completedCopies: c, extraCopies: x });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 pt-3 border-t border-gray-100 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Record returned copies</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Completed copies returned</label>
          <input
            type="number" min="0" value={completed}
            onChange={e => setCompleted(e.target.value)}
            placeholder={`Expected: ${expected > 0 ? expected : '—'} (${exam.confirmedCount ?? 0} confirmed − ${exam.noShowCount ?? 0} no-show)`}
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Extra/blank copies returned</label>
          <input
            type="number" min="0" value={extra}
            onChange={e => setExtra(e.target.value)}
            placeholder={`Expected: ${expectedExtra > 0 ? expectedExtra : '—'}`}
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={acting === exam.uploadDateId}
          className="px-4 py-1.5 text-xs font-medium text-white bg-green-600
                     hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors"
        >
          {acting === exam.uploadDateId ? 'Saving…' : 'Confirm return'}
        </button>
      </div>
    </form>
  );
}

function AuditTrail({ audit }) {
  const [open, setOpen] = useState(false);
  if (!audit?.length) return null;
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
      >
        <span>{open ? '▾' : '▸'}</span> History ({audit.length})
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {audit.map((a, i) => (
            <div key={i} className="text-xs text-gray-500 flex items-center gap-2">
              <span className="text-gray-300">{fmtDateTime(a.changed_at)}</span>
              <span className="font-medium text-gray-600">
                {a.changer_first ? `${a.changer_first} ${a.changer_last}` : 'System'}
              </span>
              <span>→ {stageLabel(a.to_stage, null)}</span>
              {a.note && <span className="text-gray-400 italic">{a.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExamReturnCard({ exam, acting, expandedReturn, setExpandedReturn, onAdvance }) {
  const stage    = exam.sessionStage;
  const stageIdx = stage ? STAGE_ORDER.indexOf(stage) : -1;
  const nextStage = stageIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[stageIdx + 1] : null;
  const isReturned = stage === 'returned';
  const isExpandedReturn = expandedReturn === exam.uploadDateId;

  const nextLabel = nextStage === 'returned'
    ? returnedLabel(exam.examCollectionMethod)
    : nextStage ? STAGE_LABELS[nextStage] : null;

  function handleAdvance() {
    if (nextStage === 'returned') {
      setExpandedReturn(isExpandedReturn ? null : exam.uploadDateId);
    } else if (nextStage) {
      onAdvance(exam.uploadDateId, nextStage);
    }
  }

  const timeSlotShort = exam.timeSlot ? exam.timeSlot.slice(0, 5) : null;

  return (
    <div className={`bg-white rounded-xl border overflow-hidden
      ${exam.missedPrep && !isReturned ? 'border-amber-300' : 'border-gray-200'}`}>

      {/* Header */}
      <div className={`px-4 py-3 border-b
        ${exam.missedPrep && !isReturned ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-gray-900">{exam.courseCode}</span>
              {exam.examTypeLabel && (
                <span className="text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded capitalize">
                  {exam.examTypeLabel.replace(/_/g, ' ')}
                </span>
              )}
              {exam.versionLabel && <span className="text-xs text-gray-400 italic">{exam.versionLabel}</span>}
              {exam.rwgFlag  && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">RWG</span>}
              {exam.isMakeup && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Makeup</span>}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
              <span>{fmtDate(exam.examDate)}{timeSlotShort ? ` · ${timeSlotShort}` : ''}</span>
              {exam.profFirst && <span>{exam.profFirst} {exam.profLast}</span>}
              {exam.profEmail && <span className="text-gray-400">{exam.profEmail}</span>}
              {exam.examCollectionMethod && (
                <span className={`font-medium ${exam.examCollectionMethod === 'delivery' ? 'text-blue-600' : 'text-indigo-600'}`}>
                  {exam.examCollectionMethod === 'delivery' ? 'Delivery' : 'Prof Pickup'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Missed prep warning */}
        {exam.missedPrep && !isReturned && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 font-medium">
            <span>⚠</span>
            <span>Exam went live without being marked Prepped</span>
          </div>
        )}
      </div>

      {/* Stepper + action */}
      <div className="px-4 py-3">
        <StageStepper sessionStage={stage} collectionMethod={exam.examCollectionMethod} />

        {/* Returned summary */}
        {isReturned && (
          <div className="mt-2 flex gap-4 text-xs text-gray-600">
            <span><strong className="text-gray-900">{exam.completedCopiesReturned ?? '—'}</strong> completed copies</span>
            <span><strong className="text-gray-900">{exam.extraCopiesReturned ?? '—'}</strong> extra/blank copies</span>
            {exam.stageUpdatedAt && <span className="text-gray-400">· {fmtDateTime(exam.stageUpdatedAt)}</span>}
          </div>
        )}

        {/* Ongoing: last student info */}
        {stage === 'ongoing' && exam.writers?.length > 0 && (
          <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5">
            <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide mb-1">
              Last student finishing
            </p>
            {(() => {
              const last = exam.writers[0];
              return (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      {last.firstName} {last.lastName}
                    </span>
                    {last.studentNumber && (
                      <span className="text-xs text-gray-400 ml-1.5">#{last.studentNumber}</span>
                    )}
                    {last.roomName && (
                      <span className="text-xs text-gray-500 ml-2">· {last.roomName}</span>
                    )}
                  </div>
                  {last.estimatedFinish && (
                    <span className="text-xs font-semibold text-indigo-700 shrink-0">
                      Est. finish {last.estimatedFinish}
                    </span>
                  )}
                </div>
              );
            })()}
            {exam.writers.length > 1 && (
              <p className="text-xs text-gray-400 mt-0.5">
                + {exam.writers.length - 1} other student{exam.writers.length - 1 !== 1 ? 's' : ''} writing
              </p>
            )}
          </div>
        )}

        {/* Advance button */}
        {!isReturned && nextStage && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleAdvance}
              disabled={acting === exam.uploadDateId}
              className="px-4 py-1.5 text-xs font-medium text-white bg-brand-600
                         hover:bg-brand-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              {acting === exam.uploadDateId ? 'Saving…' : `Mark ${nextLabel} →`}
            </button>
          </div>
        )}

        {/* Copy count form (for returned stage) */}
        {isExpandedReturn && (
          <ReturnForm
            exam={exam}
            acting={acting}
            onAdvance={(...args) => { setExpandedReturn(null); onAdvance(...args); }}
          />
        )}

        <AuditTrail audit={exam.audit} />
      </div>
    </div>
  );
}

function ReturnsTab() {
  const [exams,          setExams]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [showAll,        setShowAll]        = useState(false);
  const [acting,         setActing]         = useState(null);
  const [expandedReturn, setExpandedReturn] = useState(null);

  const load = useCallback((all) => {
    setLoading(true);
    const qs = all ? '?all=true' : '';
    api.get(`/prep/exam-returns${qs}`)
      .then(res => setExams(res.exams ?? []))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(showAll); }, [load, showAll]);

  async function handleAdvance(uploadDateId, stage, extra = {}) {
    setActing(uploadDateId);
    try {
      await api.patch(`/prep/exam-returns/${uploadDateId}/stage`, { stage, ...extra });
      setExams(prev => prev.map(e => {
        if (e.uploadDateId !== uploadDateId) return e;
        return {
          ...e,
          sessionStage: stage,
          completedCopiesReturned: extra.completedCopies ?? e.completedCopiesReturned,
          extraCopiesReturned:     extra.extraCopies     ?? e.extraCopiesReturned,
          audit: [
            { to_stage: stage, changer_first: null, changer_last: null, changed_at: new Date().toISOString() },
            ...(e.audit ?? []),
          ].slice(0, 5),
        };
      }));
      toast(`Marked as ${stage}`, 'success');
    } catch (err) {
      toast(err.message ?? 'Failed to update stage', 'error');
    } finally {
      setActing(null);
    }
  }

  // Group by exam date
  const byDate = {};
  for (const e of exams) {
    const key = String(e.examDate).slice(0, 10);
    (byDate[key] ??= []).push(e);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Exam Returns</h2>
          <p className="text-xs text-gray-500 mt-0.5">Track exam materials back to professors</p>
        </div>
        <button
          onClick={() => setShowAll(a => !a)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
            ${showAll
              ? 'bg-brand-600 text-white border-brand-600'
              : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
        >
          {showAll ? 'Showing all' : 'Show all'}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !exams.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm font-medium text-gray-700">
            {showAll ? 'No submitted exams found' : 'No active exam sessions in the last 30 days'}
          </p>
          {!showAll && (
            <button onClick={() => setShowAll(true)} className="text-xs text-brand-600 mt-1 hover:underline">
              Show all history
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byDate).map(([dateKey, dateExams]) => (
            <div key={dateKey}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {fmtDate(dateKey)}
                <span className="ml-2 font-normal normal-case text-gray-300">
                  {dateExams.length} exam{dateExams.length !== 1 ? 's' : ''}
                </span>
              </p>
              <div className="space-y-3">
                {dateExams.map(e => (
                  <ExamReturnCard
                    key={e.uploadDateId}
                    exam={e}
                    acting={acting}
                    expandedReturn={expandedReturn}
                    setExpandedReturn={setExpandedReturn}
                    onAdvance={handleAdvance}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = ['Exam Day', 'Exam Details', 'Exam Book', 'Dropoffs', 'Returns'];

export default function Prep() {
  const [tab, setTab] = useState('Exam Day');

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      {/* Secondary tab bar — sticky below the main nav */}
      <div className="bg-white border-b border-gray-200 sticky top-14 z-20">
        <div className="max-w-4xl mx-auto px-4 flex">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                ${tab === t
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Exam Prep</h1>
        </div>

        {tab === 'Exam Day'     && <ExamDayTab />}
        {tab === 'Exam Details' && <ExamDetailsTab />}
        {tab === 'Exam Book'    && <ExamBookTab />}
        {tab === 'Dropoffs'     && <DropoffsTab />}
        {tab === 'Returns'      && <ReturnsTab />}
      </div>
    </div>
  );
}
