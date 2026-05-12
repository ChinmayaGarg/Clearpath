import { useState, useEffect } from 'react';
import { api }    from '../../lib/api.js';
import Spinner    from '../ui/Spinner.jsx';

const STATUS_STYLES = {
  pending:             'bg-gray-100 text-gray-600',
  professor_approved:  'bg-blue-100 text-blue-700',
  confirmed:           'bg-green-100 text-green-700',
  professor_rejected:  'bg-red-100 text-red-700',
  cancelled:           'bg-gray-100 text-gray-400',
};

const STATUS_LABELS = {
  pending:             'Pending',
  professor_approved:  'Prof. Approved',
  confirmed:           'Confirmed',
  professor_rejected:  'Prof. Rejected',
  cancelled:           'Cancelled',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'pm' : 'am';
  return `${hour % 12 || 12}:${m}${ampm}`;
}

function ProfLink({ firstName, lastName, email }) {
  const name = [firstName, lastName].filter(Boolean).join(' ');
  if (!name) return <span className="text-gray-300">—</span>;
  if (!email) return <span className="text-sm text-gray-700">{name}</span>;
  return (
    <a href={`mailto:${email}`} className="text-sm text-brand-600 hover:underline">
      {name}
    </a>
  );
}

function AccommodationsTab({ accommodations }) {
  if (!accommodations.length) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        No approved accommodations on record
      </p>
    );
  }

  // Group by term
  const byTerm = accommodations.reduce((acc, row) => {
    if (!acc[row.term]) acc[row.term] = [];
    acc[row.term].push(row);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {Object.entries(byTerm).map(([term, rows]) => (
        <div key={term}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {term}
          </p>
          <div className="space-y-2">
            {rows.map(row => (
              <div key={row.id} className="flex items-start gap-2">
                <span className={`mt-0.5 inline-flex px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                  row.triggers_rwg_flag
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {row.code}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-gray-800">{row.label}</p>
                  {row.notes && (
                    <p className="text-xs text-gray-400 mt-0.5">{row.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CoursesTab({ courses }) {
  if (!courses.length) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">No courses linked</p>
    );
  }
  return (
    <div className="space-y-2">
      {courses.map(c => (
        <div key={c.course_code}
          className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
          <span className="text-sm font-mono text-gray-800">{c.course_code}</span>
          <ProfLink
            firstName={c.prof_first_name}
            lastName={c.prof_last_name}
            email={c.prof_email}
          />
        </div>
      ))}
    </div>
  );
}

function PastExamsTab({ exams }) {
  if (!exams.length) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">No past exams on record</p>
    );
  }
  return (
    <div className="space-y-2">
      {exams.map(e => (
        <div key={e.id}
          className={`border rounded-lg px-3 py-2.5 ${
            e.status === 'cancelled'
              ? 'border-gray-100 bg-gray-50 opacity-60'
              : 'border-gray-200 bg-white'
          }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium font-mono text-gray-900">
                {e.course_code}
              </span>
              <span className="text-xs text-gray-400 capitalize">
                {e.exam_type?.replace(/_/g, ' ')}
              </span>
              {e.status === 'cancelled' && (
                <span className="text-xs text-red-400">Cancelled</span>
              )}
            </div>
            <span className="text-xs text-gray-400">{formatDate(e.exam_date)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{e.room_name ?? '—'}</span>
            <ProfLink
              firstName={e.prof_first_name}
              lastName={e.prof_last_name}
              email={e.prof_email}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function FutureExamsTab({ exams }) {
  if (!exams.length) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">No upcoming exams</p>
    );
  }
  return (
    <div className="space-y-2">
      {exams.map(e => (
        <div key={e.id}
          className={`border rounded-lg px-3 py-2.5 ${
            e.status === 'cancelled' || e.status === 'professor_rejected'
              ? 'border-gray-100 bg-gray-50 opacity-60'
              : 'border-gray-200 bg-white'
          }`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium font-mono text-gray-900">
                {e.course_code}
              </span>
              <span className="text-xs text-gray-400 capitalize">
                {e.exam_type?.replace(/_/g, ' ')}
              </span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
              STATUS_STYLES[e.status] ?? 'bg-gray-100 text-gray-600'
            }`}>
              {STATUS_LABELS[e.status] ?? e.status}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>
              {formatDate(e.exam_date)}
              {e.exam_time && ` · ${formatTime(e.exam_time)}`}
              {e.student_duration_mins && ` · ${e.student_duration_mins} min`}
            </span>
            <span>{e.room_name ?? '—'}</span>
          </div>

          <div className="flex justify-end">
            <ProfLink
              firstName={e.prof_first_name}
              lastName={e.prof_last_name}
              email={e.prof_email}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

const TABS = ['Accommodations', 'Courses', 'Past Exams', 'Future Exams'];

export default function StudentSidePanel({ studentId, onClose }) {
  const [tab,            setTab]            = useState('Accommodations');
  const [student,        setStudent]        = useState(null);
  const [accommodations, setAccommodations] = useState([]);
  const [courses,        setCourses]        = useState([]);
  const [pastExams,      setPastExams]      = useState([]);
  const [futureExams,    setFutureExams]    = useState([]);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    setTab('Accommodations');

    const today = new Date().toISOString().slice(0, 10);

    Promise.all([
      api.get(`/students/${studentId}`),
      api.get(`/students/${studentId}/accommodations`),
      api.get(`/students/${studentId}/courses`),
      api.get(`/students/${studentId}/exam-requests`),
    ]).then(([profileData, accData, courseData, examData]) => {
      setStudent(profileData.student);
      setAccommodations(accData.accommodations ?? []);
      setCourses(courseData.courses ?? []);
      const all = examData.examRequests ?? [];
      setPastExams(all.filter(e => e.exam_date < today));
      setFutureExams(all.filter(e => e.exam_date >= today));
    }).finally(() => setLoading(false));
  }, [studentId]);

  const name = student
    ? `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown'
    : '';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-1/2 bg-white shadow-xl z-50
                      flex flex-col border-l border-gray-200">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            {loading ? (
              <div className="h-5 w-32 bg-gray-100 rounded animate-pulse" />
            ) : (
              <>
                <h2 className="text-base font-semibold text-gray-900">{name}</h2>
                {student?.student_number && (
                  <p className="text-xs font-mono text-gray-400 mt-0.5">
                    #{student.student_number}
                  </p>
                )}
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-200 shrink-0 px-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
              {t === 'Past Exams' && pastExams.length > 0 && (
                <span className="ml-1.5 bg-gray-100 text-gray-500 text-xs
                                 px-1.5 py-0.5 rounded-full">
                  {pastExams.length}
                </span>
              )}
              {t === 'Future Exams' && futureExams.length > 0 && (
                <span className="ml-1.5 bg-gray-100 text-gray-500 text-xs
                                 px-1.5 py-0.5 rounded-full">
                  {futureExams.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : (
            <>
              {tab === 'Accommodations' && (
                <AccommodationsTab accommodations={accommodations} />
              )}
              {tab === 'Courses' && (
                <CoursesTab courses={courses} />
              )}
              {tab === 'Past Exams' && (
                <PastExamsTab exams={pastExams} />
              )}
              {tab === 'Future Exams' && (
                <FutureExamsTab exams={futureExams} />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
