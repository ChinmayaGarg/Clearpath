import { useState, useEffect } from 'react';
import { api }                 from '../../lib/api.js';
import Spinner                 from '../ui/Spinner.jsx';
import { toast }               from '../ui/Toast.jsx';

const DELIVERY_LABELS = {
  pickup: 'Pickup', dropped: 'Dropped off',
  delivery: 'Delivery', pending: 'TBC',
};
const TYPE_LABELS = {
  midterm: 'Midterm', endterm: 'End term', tutorial: 'Tutorial',
  lab: 'Lab', quiz: 'Quiz', assignment: 'Assignment', other: 'Other',
};
const MATCH_META = {
  unmatched: { label: 'Unmatched', colour: 'text-gray-400'  },
  matched:   { label: 'Matched',   colour: 'text-green-600' },
  conflict:  { label: 'Conflict',  colour: 'text-red-600'   },
};
const REUSE_META = {
  pending:  { label: 'Pending professor response', colour: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Reuse approved',             colour: 'bg-green-100 text-green-700' },
  denied:   { label: 'Reuse denied',               colour: 'bg-red-100 text-red-600'     },
};

function UploadCard({ upload, onApply, applying }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2.5">
      {/* Header */}
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
              <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                Makeup
              </span>
            )}
            {upload.rwg_flag && (
              <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                RWG
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {upload.professor_name} ·{' '}
            {upload.submitted_at
              ? new Date(upload.submitted_at).toLocaleDateString('en-CA', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })
              : 'Not submitted'}
          </p>
        </div>
        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
          {upload.status}
        </span>
      </div>

      {/* Fields */}
      <div className="space-y-1.5">
        {upload.delivery !== 'pending' && (
          <div className="flex gap-3">
            <span className="text-xs text-gray-500 w-20 shrink-0">Delivery</span>
            <span className="text-sm text-gray-800">{DELIVERY_LABELS[upload.delivery]}</span>
          </div>
        )}
        {upload.materials && (
          <div className="flex gap-3">
            <span className="text-xs text-gray-500 w-20 shrink-0">Materials</span>
            <span className="text-sm text-gray-800">{upload.materials}</span>
          </div>
        )}
        {upload.password && (
          <div className="flex gap-3">
            <span className="text-xs text-gray-500 w-20 shrink-0">Password</span>
            <span className="text-sm font-medium text-green-700 font-mono">
              {upload.password}
            </span>
          </div>
        )}
      </div>

      {/* Dates */}
      {upload.dates?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {upload.dates.map((d, i) => (
            <span key={i}
              className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded">
              {new Date(d.exam_date + 'T12:00:00').toLocaleDateString('en-CA', {
                month: 'short', day: 'numeric',
              })}
              {d.time_slot && ` · ${d.time_slot.slice(0,5)}`}
              {!d.time_slot && <span className="text-gray-400 ml-1">(all times)</span>}
              {d.match_status && (
                <span className={`ml-1.5 ${MATCH_META[d.match_status]?.colour}`}>
                  {MATCH_META[d.match_status]?.label}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Apply button */}
      {onApply && (
        <button onClick={onApply} disabled={applying}
          className="w-full py-1.5 border border-brand-600 text-brand-700 text-xs
                     font-medium rounded-lg hover:bg-brand-50 transition-colors
                     disabled:opacity-50 mt-1">
          {applying ? 'Applying…' : '↓ Apply to exam fields'}
        </button>
      )}
    </div>
  );
}

export default function UploadPanel({ exam, onApplyUpload }) {
  const [data,       setData]       = useState(null);
  const [available,  setAvailable]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [applying,   setApplying]   = useState(false);
  const [linking,    setLinking]    = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  async function load() {
    try {
      const [uploadData, availData] = await Promise.all([
        api.get(`/exams/${exam.id}/upload`).catch(() => null),
        api.get(`/exams/${exam.id}/uploads/available`).catch(() => ({ uploads: [] })),
      ]);
      setData(uploadData);
      setAvailable(availData.uploads ?? []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [exam.id]); // eslint-disable-line

  async function handleApply() {
    if (!data?.upload) return;
    setApplying(true);
    try {
      await api.patch(`/exams/${exam.id}`, {
        delivery:  data.upload.delivery !== 'pending' ? data.upload.delivery : undefined,
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

  async function handleLink(uploadId) {
    setLinking(uploadId);
    try {
      await api.post(`/exams/${exam.id}/uploads/${uploadId}/link`, {});
      toast('Upload linked', 'success');
      setShowPicker(false);
      await load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLinking(null);
    }
  }

  if (loading) return (
    <div className="flex justify-center py-6"><Spinner /></div>
  );

  const upload      = data?.upload;
  const reuse       = data?.reuseRequest;
  const makeupStats = data?.makeupStats;

  return (
    <div className="space-y-4">

      {/* Matched upload */}
      {upload ? (
        <>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Linked professor submission
            </span>
            <button onClick={() => setShowPicker(s => !s)}
              className="text-xs text-brand-600 hover:text-brand-800 ml-auto">
              Change
            </button>
          </div>
          <UploadCard
            upload={upload}
            onApply={handleApply}
            applying={applying}
          />
        </>
      ) : (
        <div className="text-center py-6">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm font-medium text-gray-600">No submission linked yet</p>
          <p className="text-xs text-gray-400 mt-1 mb-3">
            The matching engine links uploads automatically after PDF import,
            or you can link one manually below
          </p>
          <button onClick={() => setShowPicker(s => !s)}
            className="px-3 py-1.5 border border-brand-600 text-brand-700
                       text-xs font-medium rounded-lg hover:bg-brand-50">
            {showPicker ? 'Hide' : 'Link a professor upload'}
          </button>
        </div>
      )}

      {/* Manual upload picker */}
      {showPicker && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
            <p className="text-xs font-medium text-gray-600">
              Available submissions for {exam.course_code}
            </p>
          </div>
          {available.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              No submitted uploads found for {exam.course_code}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {available.map(u => (
                <div key={u.id} className="p-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {TYPE_LABELS[u.exam_type_label]} — {u.professor_name}
                      </span>
                      {u.version_label && (
                        <span className="text-xs text-gray-400 ml-2">{u.version_label}</span>
                      )}
                      <div className="flex gap-2 mt-0.5">
                        {u.password && (
                          <span className="text-xs text-green-600">Password ✓</span>
                        )}
                        {u.dates?.map((d, i) => (
                          <span key={i} className="text-xs text-gray-400">
                            {new Date(d.exam_date + 'T12:00:00').toLocaleDateString('en-CA', {
                              month: 'short', day: 'numeric',
                            })}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleLink(u.id)}
                      disabled={linking === u.id}
                      className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white
                                 text-xs font-medium rounded-lg transition-colors
                                 disabled:opacity-50 shrink-0 ml-3"
                    >
                      {linking === u.id ? 'Linking…' : 'Link'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Makeup stats */}
      {makeupStats && parseInt(makeupStats.makeup_count) > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-purple-800">
            {makeupStats.makeup_count} makeup student{makeupStats.makeup_count !== '1' ? 's' : ''}
          </p>
          <p className="text-xs text-purple-600 mt-0.5">
            Prior appointment detected within 20 days
          </p>
        </div>
      )}

      {/* Reuse request */}
      {reuse && (
        <div className="border border-gray-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-700">Reuse request</span>
            <span className={`text-xs px-2 py-0.5 rounded font-medium
                             ${REUSE_META[reuse.status]?.colour}`}>
              {REUSE_META[reuse.status]?.label}
            </span>
          </div>
          <p className="text-xs text-gray-600">
            {reuse.version_label ?? reuse.course_code} — {TYPE_LABELS[reuse.exam_type_label]}
          </p>
          {reuse.professor_note && (
            <p className="text-xs text-gray-500 italic mt-1">
              Professor: "{reuse.professor_note}"
            </p>
          )}
        </div>
      )}

    </div>
  );
}
