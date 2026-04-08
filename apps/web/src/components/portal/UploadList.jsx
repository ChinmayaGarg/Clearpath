import { useState, useEffect } from 'react';
import { api }                 from '../../lib/api.js';
import { toast }               from '../ui/Toast.jsx';
import Spinner                 from '../ui/Spinner.jsx';

const TYPE_LABELS = {
  midterm:    'Midterm',
  endterm:    'End term',
  tutorial:   'Tutorial',
  lab:        'Lab',
  quiz:       'Quiz',
  assignment: 'Assignment',
  other:      'Other',
};

const MATCH_META = {
  unmatched: { label: 'Not yet matched', colour: 'text-gray-400'  },
  matched:   { label: 'Matched to book', colour: 'text-green-600' },
  conflict:  { label: 'Conflict',        colour: 'text-red-600'   },
};

function canEditUpload(upload) {
  if (!upload.dates?.length) return true;
  const now = new Date();
  return upload.dates.every(d => {
    const diffDays = (new Date(d.exam_date + 'T00:00:00') - now) / (1000 * 60 * 60 * 24);
    return diffDays > 2;
  });
}

function UploadCard({ upload, onEdit }) {
  const editable = canEditUpload(upload);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center flex-wrap gap-2">
          <span className="font-semibold text-gray-900">{upload.course_code}</span>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            {TYPE_LABELS[upload.exam_type_label] ?? upload.exam_type_label}
          </span>
          {upload.is_makeup && (
            <span className="text-xs text-purple-700 bg-purple-100 px-2 py-0.5 rounded font-medium">
              Makeup
            </span>
          )}
          {upload.rwg_flag && (
            <span className="text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded font-medium">
              RWG
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editable && (
            <button onClick={() => onEdit(upload.id)}
              className="text-xs text-brand-600 hover:text-brand-800 font-medium">
              Edit
            </button>
          )}
          {!editable && (
            <span className="text-xs text-gray-400 font-medium" title="Cannot edit within 2 days of the exam">
              Locked
            </span>
          )}
        </div>
      </div>

      {upload.version_label && (
        <p className="text-xs text-gray-500 mb-2 italic">{upload.version_label}</p>
      )}

      {/* Details */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-gray-500">
        {upload.delivery !== 'pending' && upload.delivery !== 'file_upload' && (
          <span>Delivery: {upload.delivery}</span>
        )}
        {upload.delivery === 'file_upload' && (
          upload.file_path ? (
            <span className="text-green-600 font-medium">✓ File uploaded</span>
          ) : (
            <span className="text-amber-600 font-medium">⚠ File pending upload</span>
          )
        )}
        {upload.materials && (
          <span>Materials: {upload.materials}</span>
        )}
        {upload.password && (
          <span className="text-green-600 font-medium">Password set ✓</span>
        )}
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
                  {d.time_slot && ` · ${d.time_slot.slice(0,5)}`}
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
        <p className="text-xs text-gray-400 mt-2">
          Editing is locked — exam is within 2 days
        </p>
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

export default function UploadList({ onEdit, onRefresh }) {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/portal/uploads')
      .then(d => setUploads(d.uploads))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  if (!uploads.length) return (
    <div className="text-center py-12 text-sm text-gray-400">
      No exam uploads yet — click "+ New exam upload" to get started
    </div>
  );

  const saved = uploads.filter(u => u.status === 'submitted');

  return (
    <div className="space-y-3">
      {saved.map(u => (
        <UploadCard key={u.id} upload={u} onEdit={onEdit} />
      ))}
    </div>
  );
}
