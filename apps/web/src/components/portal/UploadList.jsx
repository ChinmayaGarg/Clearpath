import { useState, useEffect } from 'react';
import { api }                 from '../../lib/api.js';
import { toast }               from '../ui/Toast.jsx';
import Spinner                 from '../ui/Spinner.jsx';
import UploadThreadPanel       from './UploadThreadPanel.jsx';

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
    const diffDays = (new Date(String(d.exam_date).slice(0, 10) + 'T00:00:00') - now) / (1000 * 60 * 60 * 24);
    return diffDays > 2;
  });
}

// ── Missing-exam banners ──────────────────────────────────────────────────────

function MissingWordDocBanner({ courseCode, examDate, examTime, examType, onUpload }) {
  const typeLabel = TYPE_LABELS[examType] ?? examType ?? '';
  return (
    <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
      <span className="text-purple-500 text-base shrink-0">⚠</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-purple-700">
          {courseCode} — Word doc needed for RWG/Dragon students — {typeLabel} on {fmtDate(examDate)}
          {examTime ? ` at ${fmt12(examTime)}` : ''}
        </p>
        <p className="text-xs text-purple-500 mt-0.5">Upload a .docx version of this exam for students with RWG or Dragon accommodation</p>
      </div>
      {onUpload && (
        <button
          onClick={onUpload}
          className="shrink-0 px-3 py-1.5 text-xs font-medium text-purple-700 border border-purple-300
                     bg-white hover:bg-purple-100 rounded-lg transition-colors"
        >
          Upload Word doc
        </button>
      )}
    </div>
  );
}

function MissingBanner({ courseCode, examDate, examTime, examType, studentCount, onUpload }) {
  const typeLabel = TYPE_LABELS[examType] ?? examType ?? '';
  return (
    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
      <span className="text-red-500 text-base shrink-0">⚠</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-700">
          {courseCode} — {studentCount} student{studentCount !== 1 ? 's' : ''} writing {typeLabel} on {fmtDate(examDate)}
          {examTime ? ` at ${fmt12(examTime)}` : ''}
        </p>
        <p className="text-xs text-red-500 mt-0.5">Exam not uploaded yet</p>
      </div>
      {onUpload && (
        <button
          onClick={onUpload}
          className="shrink-0 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-300
                     bg-white hover:bg-red-100 rounded-lg transition-colors"
        >
          Upload exam
        </button>
      )}
    </div>
  );
}

// ── Upload card ───────────────────────────────────────────────────────────────

function UploadCard({ upload, onEdit, onThread }) {
  const editable = canEditUpload(upload);
  const isDropoff = upload.delivery === 'dropped';
  const dropoffConfirmed = !!upload.dropoff_confirmed_at;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center flex-wrap gap-2">
          <span className="font-semibold text-gray-900">{upload.course_code}</span>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            {TYPE_LABELS[upload.exam_type_label] ?? upload.exam_type_label}
          </span>
          {upload.is_word_doc && (
            <span className="text-xs text-purple-700 bg-purple-100 px-2 py-0.5 rounded font-medium">
              RWG Word doc
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
          <button onClick={() => onThread(upload)}
            className="text-xs text-gray-500 hover:text-brand-600 font-medium">
            Messages
          </button>
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
          (upload.file_path || upload.has_files) ? (
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
          {upload.dates.map(d => (
            <div key={d.id}
              className="text-xs bg-gray-50 border border-gray-200
                         px-2 py-1 rounded-lg text-gray-700">
              {new Date(String(d.exam_date).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-CA', {
                month: 'short', day: 'numeric',
              })}
              {d.time_slot && ` · ${d.time_slot.slice(0, 5)}`}
            </div>
          ))}
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

function UploadCards({ uploads, onEdit, onThread }) {
  if (!uploads.length) return (
    <div className="text-center py-10 text-sm text-gray-400">No uploads in this category</div>
  );
  return (
    <div className="space-y-3">
      {uploads.map(u => <UploadCard key={u.id} upload={u} onEdit={onEdit} onThread={onThread} />)}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const UPLOAD_TABS = ['Upcoming', 'Pending', 'History'];

export default function UploadList({ onEdit, onNewUpload, onNewWordDocUpload }) {
  const [uploads,        setUploads]        = useState([]);
  const [missingCourses, setMissingCourses] = useState([]);
  const [missingWordDocs, setMissingWordDocs] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [activeTab,      setActiveTab]      = useState('Upcoming');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [filterType,     setFilterType]     = useState('all');
  const [threadUpload,   setThreadUpload]   = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/portal/uploads'),
      api.get('/portal/my-students').catch(() => ({ courses: [] })),
    ])
      .then(([uploadsRes, studentsRes]) => {
        setUploads(uploadsRes.uploads ?? []);

        const missing   = [];
        const missingWd = [];
        for (const course of (studentsRes.courses ?? [])) {
          for (const dg of (course.dates ?? [])) {
            const dateStr = String(dg.examDate).slice(0, 10);
            const nonCancelledCount = dg.students?.filter(s => s.status !== 'cancelled').length ?? 0;
            if (!dg.examUploaded && dateStr >= todayStr && nonCancelledCount > 0) {
              missing.push({
                key: `${course.courseCode}__${dg.examDate}__${dg.examType}`,
                courseId:     course.courseId,
                courseCode:   course.courseCode,
                examDate:     dg.examDate,
                examTime:     dg.examTime ?? null,
                examType:     dg.examType ?? null,
                studentCount: nonCancelledCount,
              });
            }
            if (dg.hasRwgStudents && !dg.wordDocUploaded && dateStr >= todayStr && nonCancelledCount > 0) {
              missingWd.push({
                key: `wd__${course.courseCode}__${dg.examDate}__${dg.examType}`,
                courseId:   course.courseId,
                courseCode: course.courseCode,
                examDate:   dg.examDate,
                examTime:   dg.examTime ?? null,
                examType:   dg.examType ?? null,
              });
            }
          }
        }
        setMissingCourses(missing);
        setMissingWordDocs(missingWd);
      })
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  // Classify uploads into tabs
  const pending  = uploads.filter(u => u.status === 'draft');
  const upcoming = uploads.filter(u => u.status === 'submitted' && hasUpcomingDate(u));
  const history  = uploads.filter(u => u.status === 'submitted' && !hasUpcomingDate(u));

  // Search + filter
  function applyFilters(list) {
    return list.filter(u => {
      const q = searchQuery.trim().toLowerCase();
      const matchSearch = !q || u.course_code.toLowerCase().includes(q);
      const matchType   = filterType === 'all' || u.exam_type_label === filterType;
      return matchSearch && matchType;
    });
  }
  const visibleUpcoming = applyFilters(upcoming);
  const visiblePending  = applyFilters(pending);
  const visibleHistory  = applyFilters(history);

  // Collect all type labels present across all tabs for the filter dropdown
  const availableTypes = [...new Set(uploads.map(u => u.exam_type_label).filter(Boolean))].sort();

  return (
    <div>
      {/* Missing-exam red banners */}
      {missingCourses.length > 0 && (
        <div className="space-y-2 mb-3">
          {missingCourses.map(b => (
            <MissingBanner
              key={b.key}
              {...b}
              onUpload={onNewUpload ? () => onNewUpload({
                courseId:   b.courseId,
                examType:   b.examType,
                examDate:   b.examDate,
                examTime:   b.examTime,
              }) : undefined}
            />
          ))}
        </div>
      )}

      {/* Missing Word doc purple banners */}
      {missingWordDocs.length > 0 && (
        <div className="space-y-2 mb-5">
          {missingWordDocs.map(b => (
            <MissingWordDocBanner
              key={b.key}
              {...b}
              onUpload={onNewWordDocUpload ? () => onNewWordDocUpload({
                courseId:   b.courseId,
                examType:   b.examType,
                examDate:   b.examDate,
                examTime:   b.examTime,
              }) : undefined}
            />
          ))}
        </div>
      )}

      {/* Search + filter bar */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by course code…"
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white
                     focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="all">All types</option>
          {availableTypes.map(t => (
            <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>
          ))}
        </select>
        {(searchQuery || filterType !== 'all') && (
          <button
            onClick={() => { setSearchQuery(''); setFilterType('all'); }}
            className="px-3 py-1.5 text-xs text-gray-500 border border-gray-300 rounded-lg
                       hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Sub-tab strip */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {UPLOAD_TABS.map(t => {
          const count = t === 'Upcoming' ? visibleUpcoming.length
                      : t === 'Pending'  ? visiblePending.length
                      : visibleHistory.length;
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
      {activeTab === 'Upcoming' && <UploadCards uploads={visibleUpcoming} onEdit={onEdit} onThread={setThreadUpload} />}
      {activeTab === 'Pending'  && <UploadCards uploads={visiblePending}  onEdit={onEdit} onThread={setThreadUpload} />}
      {activeTab === 'History'  && <UploadCards uploads={visibleHistory}  onEdit={onEdit} onThread={setThreadUpload} />}

      {threadUpload && (
        <UploadThreadPanel upload={threadUpload} onClose={() => setThreadUpload(null)} />
      )}
    </div>
  );
}
