import { useState, useEffect } from 'react';
import { api }                 from '../../lib/api.js';
import { toast }               from '../ui/Toast.jsx';
import Spinner                 from '../ui/Spinner.jsx';

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
  endterm:    'End term',
  tutorial:   'Tutorial',
  lab:        'Lab',
  quiz:       'Quiz',
  other:      'Other',
};

const MATCH_META = {
  unmatched: { label: 'Not yet matched', colour: 'text-gray-400'  },
  matched:   { label: 'Matched to book', colour: 'text-green-600' },
  conflict:  { label: 'Conflict',        colour: 'text-red-600'   },
};

const todayStr = new Date().toISOString().slice(0, 10);

function fmt12(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function fmtDate(d) {
  const s = String(d).slice(0, 10);
  return new Date(s + 'T12:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** Returns true if the upload has at least one future date (>= today). */
function hasUpcomingDate(upload) {
  if (!upload.dates?.length) return false;
  return upload.dates.some(d => String(d.exam_date).slice(0, 10) >= todayStr);
}

function canEditUpload(upload) {
  if (!upload.dates?.length) return true;
  const now = new Date();
  return upload.dates.every(d => {
    const diffDays = (new Date(d.exam_date + 'T00:00:00') - now) / (1000 * 60 * 60 * 24);
    return diffDays > 2;
  });
}

// ── Missing-exam banner ───────────────────────────────────────────────────────

function MissingBanner({ courseCode, examDate, examTime, examType, studentCount }) {
  const typeLabel = TYPE_LABELS[examType] ?? examType ?? '';
  return (
    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
      <span className="text-red-500 text-base shrink-0 mt-0.5">⚠</span>
      <div>
        <p className="text-sm font-semibold text-red-700">
          {courseCode} — {studentCount} student{studentCount !== 1 ? 's' : ''} writing {typeLabel} on {fmtDate(examDate)}
          {examTime ? ` at ${fmt12(examTime)}` : ''}
        </p>
        <p className="text-xs text-red-500 mt-0.5">Exam not uploaded yet</p>
      </div>
    </div>
  );
}

// ── Upload card ───────────────────────────────────────────────────────────────

function UploadCard({ upload, onEdit }) {
  const editable = canEditUpload(upload);
  const isDropoff = upload.delivery === 'dropped';
  const dropoffConfirmed = !!upload.dropoff_confirmed_at;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center flex-wrap gap-2">
          <span className="font-semibold text-gray-900">{upload.course_code}</span>
          {upload.is_word_doc ? (
            <span className="text-xs text-purple-700 bg-purple-100 px-2 py-0.5 rounded font-medium">
              RWG Word doc
            </span>
          ) : (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {TYPE_LABELS[upload.exam_type_label] ?? upload.exam_type_label}
            </span>
          )}
          {upload.is_makeup && !upload.is_word_doc && (
            <span className="text-xs text-purple-700 bg-purple-100 px-2 py-0.5 rounded font-medium">
              Makeup
            </span>
          )}
          {upload.rwg_flag && !upload.is_word_doc && (
            <span className="text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded font-medium">
              RWG
            </span>
          )}
          {upload.status === 'draft' && (
            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded font-medium">
              Draft
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editable ? (
            <button onClick={() => onEdit(upload.id)}
              className="text-xs text-brand-600 hover:text-brand-800 font-medium">
              Edit
            </button>
          ) : (
            <span className="text-xs text-gray-400 font-medium" title="Cannot edit within 2 days of the exam">
              Locked
            </span>
          )}
        </div>
      </div>

      {upload.version_label && (
        <p className="text-xs text-gray-500 mb-2 italic">{upload.version_label}</p>
      )}

      {/* Delivery / file status */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-gray-500">
        {isDropoff ? (
          dropoffConfirmed ? (
            <span className="text-green-600 font-medium">Drop-off confirmed</span>
          ) : (
            <span className="text-red-600 font-medium">Pending drop-off</span>
          )
        ) : upload.delivery === 'file_upload' ? (
          upload.file_path ? (
            <span className="text-green-600 font-medium">File uploaded</span>
          ) : (
            <span className="text-amber-600 font-medium">File pending upload</span>
          )
        ) : upload.delivery && upload.delivery !== 'pending' ? (
          <span>Delivery: {upload.delivery}</span>
        ) : null}
        {upload.materials && <span>Materials: {upload.materials}</span>}
        {upload.password && <span className="text-green-600 font-medium">Password set</span>}
      </div>

      {/* Dates */}
      {upload.dates?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {upload.dates.map(d => {
            const match = MATCH_META[d.match_status] ?? MATCH_META.unmatched;
            return (
              <div key={d.id}
                className="text-xs bg-gray-50 border border-gray-200
                           px-2 py-1 rounded-lg flex items-center gap-1.5">
                <span className="text-gray-700">
                  {new Date(d.exam_date + 'T12:00:00').toLocaleDateString('en-CA', {
                    month: 'short', day: 'numeric',
                  })}
                  {d.time_slot && ` · ${d.time_slot.slice(0, 5)}`}
                </span>
                <span className={`font-medium ${match.colour}`}>
                  {match.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!editable && (
        <p className="text-xs text-gray-400 mt-2">Editing is locked — exam is within 2 days</p>
      )}

      {upload.submitted_at && (
        <p className="text-xs text-gray-400 mt-2">
          Submitted {new Date(upload.submitted_at).toLocaleDateString('en-CA', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </p>
      )}
    </div>
  );
}

function UploadCards({ uploads, onEdit }) {
  if (!uploads.length) return (
    <div className="text-center py-10 text-sm text-gray-400">No uploads in this category</div>
  );
  return (
    <div className="space-y-3">
      {uploads.map(u => <UploadCard key={u.id} upload={u} onEdit={onEdit} />)}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const UPLOAD_TABS = ['Upcoming', 'Pending', 'History'];

export default function UploadList({ onEdit }) {
  const [uploads,       setUploads]       = useState([]);
  const [missingCourses, setMissingCourses] = useState([]); // courses with students but no upload
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState('Upcoming');

  useEffect(() => {
    Promise.all([
      api.get('/portal/uploads'),
      api.get('/portal/my-students').catch(() => ({ courses: [] })),
    ])
      .then(([uploadsRes, studentsRes]) => {
        setUploads(uploadsRes.uploads ?? []);

        // Collect date groups where exam is upcoming and not uploaded
        const missing = [];
        for (const course of (studentsRes.courses ?? [])) {
          for (const dg of (course.dates ?? [])) {
            if (!dg.examUploaded && String(dg.examDate).slice(0, 10) >= todayStr) {
              const count = dg.students?.length ?? 0;
              missing.push({
                key: `${course.courseCode}__${dg.examDate}__${dg.examType}`,
                courseCode:   course.courseCode,
                examDate:     dg.examDate,
                examTime:     dg.examTime ?? null,
                examType:     dg.examType ?? null,
                studentCount: count,
              });
            }
          }
        }
        setMissingCourses(missing);
      })
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  // Classify uploads into tabs
  const pending  = uploads.filter(u => u.status === 'draft');
  const upcoming = uploads.filter(u => u.status === 'submitted' && hasUpcomingDate(u));
  const history  = uploads.filter(u => u.status === 'submitted' && !hasUpcomingDate(u));

  return (
    <div>
      {/* Missing-exam red banners */}
      {missingCourses.length > 0 && (
        <div className="space-y-2 mb-5">
          {missingCourses.map(b => (
            <MissingBanner key={b.key} {...b} />
          ))}
        </div>
      )}

      {/* Sub-tab strip */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {UPLOAD_TABS.map(t => {
          const count = t === 'Upcoming' ? upcoming.length
                      : t === 'Pending'  ? pending.length
                      : history.length;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
                ${activeTab === t
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t}
              {count > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full
                  ${t === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'Upcoming' && <UploadCards uploads={upcoming} onEdit={onEdit} />}
      {activeTab === 'Pending'  && <UploadCards uploads={pending}  onEdit={onEdit} />}
      {activeTab === 'History'  && <UploadCards uploads={history}  onEdit={onEdit} />}
    </div>
  );
}
