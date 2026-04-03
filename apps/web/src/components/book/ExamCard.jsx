import { useState }        from 'react';
import StatusPipeline, { StatusBadge } from './StatusPipeline.jsx';
import { useBook }         from '../../hooks/useBook.js';

function RwgFlag() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium">
      RWG
    </span>
  );
}

export default function ExamCard({ exam, onEdit }) {
  const { updateStatus, deleteExam } = useBook();
  const [expanding, setExpanding]    = useState(false);
  const [note, setNote]              = useState('');
  const [loading, setLoading]        = useState(false);
  const [error, setError]            = useState('');

  async function handleAdvance(toStatus) {
    setError('');
    setLoading(true);
    try {
      await updateStatus(exam.id, toStatus, note || undefined);
      setNote('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${exam.course_code}? This cannot be undone.`)) return;
    try {
      await deleteExam(exam.id);
    } catch (err) {
      setError(err.message);
    }
  }

  const isCancelled = exam.status === 'cancelled';
  const needsPassword = exam.exam_type === 'brightspace' && !exam.password;

  return (
    <div className={`border rounded-xl p-4 transition-all ${
      isCancelled
        ? 'border-gray-100 bg-gray-50 opacity-60'
        : needsPassword
        ? 'border-amber-200 bg-amber-50'
        : 'border-gray-200 bg-white hover:border-gray-300'
    }`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 text-sm">
            {exam.course_code}
          </span>
          {exam.cross_listed_code && (
            <span className="text-xs text-gray-400">/ {exam.cross_listed_code}</span>
          )}
          {exam.rwg_flag && <RwgFlag />}
          {needsPassword && (
            <span className="text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-medium">
              Missing password
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onEdit?.(exam)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Edit
          </button>
          {exam.status === 'pending' && (
            <button
              onClick={handleDelete}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Rooms */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {exam.rooms.map(room => (
          <span key={room.id} className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
            {room.room_name} · {room.start_time?.slice(0, 5)} · {room.student_count} students
          </span>
        ))}
      </div>

      {/* Professor + details */}
      {(exam.professor_name || exam.materials || exam.duration_mins) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {exam.professor_name && (
            <span className="text-xs text-gray-500">{exam.professor_name}</span>
          )}
          {exam.duration_mins && (
            <span className="text-xs text-gray-500">{exam.duration_mins} min</span>
          )}
          {exam.materials && (
            <span className="text-xs text-gray-500 italic">{exam.materials}</span>
          )}
        </div>
      )}

      {/* Status pipeline */}
      {!isCancelled && (
        <div className="mt-3">
          <StatusPipeline
            status={exam.status}
            onAdvance={handleAdvance}
          />
        </div>
      )}

      {isCancelled && (
        <div className="mt-2">
          <StatusBadge status="cancelled" />
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
