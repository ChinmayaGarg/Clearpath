import { useState }                         from 'react';
import StatusPipeline, { StatusBadge }      from './StatusPipeline.jsx';
import ExamEditModal                         from './ExamEditModal.jsx';
import { useBook }                           from '../../hooks/useBook.js';
import { formatTime }                        from '../../lib/utils.js';
import { toast }                             from '../ui/Toast.jsx';

export default function ExamCard({ exam }) {
  const { updateStatus, deleteExam } = useBook();
  const [showEdit, setShowEdit]       = useState(false);
  const [loading,  setLoading]        = useState(false);

  const isCancelled   = exam.status === 'cancelled';
  const needsPassword = exam.exam_type === 'brightspace' && !exam.password;

  async function handleAdvance(toStatus) {
    setLoading(true);
    try {
      await updateStatus(exam.id, toStatus);
      toast(`${exam.course_code} → ${toStatus.replace('_', ' ')}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${exam.course_code}?`)) return;
    try {
      await deleteExam(exam.id);
      toast(`${exam.course_code} deleted`, 'info');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <div className={`border rounded-xl p-4 transition-all ${
        isCancelled
          ? 'border-gray-100 bg-gray-50 opacity-60'
          : needsPassword
          ? 'border-amber-300 bg-amber-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}>

        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="font-semibold text-gray-900">
              {exam.course_code}
            </span>
            {exam.cross_listed_code && (
              <span className="text-xs text-gray-400">/ {exam.cross_listed_code}</span>
            )}
            {exam.rwg_flag && (
              <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700
                               text-xs font-medium">RWG</span>
            )}
            {needsPassword && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700
                               text-xs font-medium">⚠ No password</span>
            )}
            {exam.exam_type !== 'paper' && (
              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700
                               text-xs font-medium capitalize">{exam.exam_type}</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowEdit(true)}
              className="text-xs text-gray-400 hover:text-brand-600 transition-colors">
              Edit
            </button>
            {exam.status === 'pending' && (
              <button onClick={handleDelete}
                className="text-xs text-red-400 hover:text-red-600 transition-colors">
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Room slots */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {exam.rooms?.map(room => (
            <span key={room.id}
              className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
              {room.room_name} · {formatTime(room.start_time)} · {room.student_count} students
            </span>
          ))}
        </div>

        {/* Meta row */}
        {(exam.professor_name || exam.materials || exam.duration_mins) && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {exam.professor_name && (
              <span className="text-xs text-gray-500">{exam.professor_name}</span>
            )}
            {exam.duration_mins && (
              <span className="text-xs text-gray-400">{exam.duration_mins} min</span>
            )}
            {exam.materials && (
              <span className="text-xs text-gray-400 italic truncate max-w-xs">
                {exam.materials}
              </span>
            )}
          </div>
        )}

        {/* Status */}
        <div className="mt-3">
          {isCancelled
            ? <StatusBadge status="cancelled" />
            : <StatusPipeline
                status={exam.status}
                onAdvance={handleAdvance}
                disabled={loading}
              />
          }
        </div>

      </div>

      {showEdit && (
        <ExamEditModal exam={exam} onClose={() => setShowEdit(false)} />
      )}
    </>
  );
}
