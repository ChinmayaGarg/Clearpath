/**
 * UploadPanel — shown inside ExamEditModal for leads.
 * Displays what the professor submitted, match status, and reuse requests.
 */
import { useState, useEffect } from 'react';
import { api }                 from '../../lib/api.js';
import Spinner                 from '../ui/Spinner.jsx';
import { toast }               from '../ui/Toast.jsx';

const DELIVERY_LABELS = {
  pickup:   'Pickup by lead',
  dropped:  'Dropped off by professor',
  delivery: 'Delivery to room',
  pending:  'To be confirmed',
};

const TYPE_LABELS = {
  midterm:    'Midterm',    endterm:    'End term',
  tutorial:   'Tutorial',  lab:        'Lab',
  quiz:       'Quiz',      assignment: 'Assignment',
  other:      'Other',
};

const MATCH_META = {
  unmatched: { label: 'Not matched',    colour: 'text-gray-400'  },
  matched:   { label: 'Matched',        colour: 'text-green-600' },
  conflict:  { label: 'Conflict',       colour: 'text-red-600'   },
};

const REUSE_META = {
  pending:  { label: 'Awaiting professor',  colour: 'bg-amber-100 text-amber-700'  },
  approved: { label: 'Reuse approved',      colour: 'bg-green-100 text-green-700'  },
  denied:   { label: 'Reuse denied',        colour: 'bg-red-100 text-red-600'      },
};

function Field({ label, value, highlight }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <span className={`text-sm ${highlight ? 'font-medium text-green-700' : 'text-gray-800'}`}>
        {value}
      </span>
    </div>
  );
}

export default function UploadPanel({ exam, onApplyUpload }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    api.get(`/exams/${exam.id}/upload`)
      .then(d => setData(d))
      .catch(err => {
        // 404 or no upload — not an error, just no submission yet
        if (!err.message.includes('404')) {
          toast(err.message, 'error');
        }
      })
      .finally(() => setLoading(false));
  }, [exam.id]); // eslint-disable-line

  async function handleApply() {
    if (!data?.upload) return;
    setApplying(true);
    try {
      // Apply upload fields to the exam
      await api.patch(`/exams/${exam.id}`, {
        delivery:  data.upload.delivery  !== 'pending' ? data.upload.delivery  : undefined,
        materials: data.upload.materials ?? undefined,
        password:  data.upload.password  ?? undefined,
        rwgFlag:   data.upload.rwg_flag  ?? undefined,
      });
      toast('Upload applied to exam', 'success');
      onApplyUpload?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setApplying(false);
    }
  }

  if (loading) return <div className="flex justify-center py-6"><Spinner /></div>;

  const { upload, reuseRequest, makeupStats } = data ?? {};

  // No upload matched
  if (!upload) {
    return (
      <div className="space-y-3">
        <div className="text-center py-8 text-sm text-gray-400">
          <div className="text-3xl mb-3">📭</div>
          <p className="font-medium text-gray-500">No professor submission yet</p>
          <p className="text-xs mt-1 text-gray-400">
            The professor hasn't uploaded exam details for this course
          </p>
        </div>

        {makeupStats && parseInt(makeupStats.makeup_count) > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
            <p className="text-sm font-medium text-purple-800">
              {makeupStats.makeup_count} makeup student{makeupStats.makeup_count !== '1' ? 's' : ''}
            </p>
            <p className="text-xs text-purple-600 mt-0.5">
              These students had a prior appointment for this course within 20 days
            </p>
          </div>
        )}

        {/* Reuse request status */}
        {reuseRequest && (
          <ReuseRequestCard request={reuseRequest} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Upload header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">
              {TYPE_LABELS[upload.exam_type_label] ?? upload.exam_type_label}
            </span>
            {upload.version_label && (
              <span className="text-xs text-gray-500 italic">{upload.version_label}</span>
            )}
            {upload.is_makeup && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5
                               rounded font-medium">Makeup</span>
            )}
            {upload.rwg_flag && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5
                               rounded font-medium">RWG</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Submitted by {upload.professor_name} ·{' '}
            {upload.submitted_at
              ? new Date(upload.submitted_at).toLocaleDateString('en-CA', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })
              : 'Not yet submitted'
            }
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
          upload.status === 'submitted'
            ? 'bg-green-100 text-green-700'
            : 'bg-gray-100 text-gray-500'
        }`}>
          {upload.status}
        </span>
      </div>

      {/* Fields */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
        <Field label="Delivery"  value={DELIVERY_LABELS[upload.delivery]} />
        <Field label="Materials" value={upload.materials} />
        <Field label="Password"  value={upload.password} highlight />
        {upload.makeup_notes && (
          <Field label="Makeup notes" value={upload.makeup_notes} />
        )}
      </div>

      {/* Date match status */}
      {upload.dates?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Date matches</p>
          <div className="space-y-1">
            {upload.dates.map((d, i) => {
              const meta = MATCH_META[d.match_status] ?? MATCH_META.unmatched;
              return (
                <div key={i}
                  className="flex items-center justify-between text-xs
                             bg-white border border-gray-100 rounded-lg px-3 py-1.5">
                  <span className="text-gray-700">
                    {new Date(d.exam_date + 'T12:00:00').toLocaleDateString('en-CA', {
                      month: 'short', day: 'numeric',
                    })}
                    {d.time_slot && ` · ${d.time_slot.slice(0,5)}`}
                    {!d.time_slot && (
                      <span className="text-gray-400 ml-1">(all times)</span>
                    )}
                  </span>
                  <span className={`font-medium ${meta.colour}`}>{meta.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Makeup students */}
      {makeupStats && parseInt(makeupStats.makeup_count) > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-purple-800">
            {makeupStats.makeup_count} of {makeupStats.total_appointments} students
            are makeup sittings
          </p>
        </div>
      )}

      {/* Reuse request */}
      {reuseRequest && <ReuseRequestCard request={reuseRequest} />}

      {/* Apply button — fills exam fields from upload */}
      {upload.status === 'submitted' && (
        <div className="border-t border-gray-100 pt-3">
          <button
            onClick={handleApply}
            disabled={applying}
            className="w-full py-2 border border-brand-600 text-brand-700
                       text-sm font-medium rounded-lg hover:bg-brand-50
                       transition-colors disabled:opacity-50"
          >
            {applying ? 'Applying…' : '↓ Apply to exam fields'}
          </button>
          <p className="text-xs text-gray-400 text-center mt-1">
            Fills delivery, materials, and password from professor's submission
          </p>
        </div>
      )}

    </div>
  );
}

function ReuseRequestCard({ request }) {
  const meta = REUSE_META[request.status] ?? REUSE_META.pending;
  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-700">Reuse request</span>
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${meta.colour}`}>
          {meta.label}
        </span>
      </div>
      <p className="text-xs text-gray-600">
        {request.version_label ?? request.course_code} — {TYPE_LABELS[request.exam_type_label]}
      </p>
      {request.professor_note && (
        <p className="text-xs text-gray-500 italic mt-1">
          Professor: "{request.professor_note}"
        </p>
      )}
      {request.status === 'pending' && (
        <p className="text-xs text-amber-600 mt-1">
          Awaiting professor response
        </p>
      )}
    </div>
  );
}
