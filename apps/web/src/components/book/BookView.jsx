import { useEffect, useState } from 'react';
import { useBook }             from '../../hooks/useBook.js';
import ExamCard                from './ExamCard.jsx';

function StatsBar({ stats }) {
  if (!stats || !stats.total) return null;
  return (
    <div className="flex flex-wrap gap-3 text-sm text-gray-600">
      <span><strong className="text-gray-900">{stats.total}</strong> exams</span>
      <span><strong className="text-gray-900">{stats.students}</strong> students</span>
      {stats.rwgCount > 0 && (
        <span className="text-red-600">
          <strong>{stats.rwgCount}</strong> RWG
        </span>
      )}
      {stats.pending > 0 && (
        <span className="text-gray-500">
          {stats.pending} pending
        </span>
      )}
      {stats.pickedUp > 0 && (
        <span className="text-green-600">
          {stats.pickedUp} done
        </span>
      )}
    </div>
  );
}

function AttentionBanner({ flagged }) {
  if (!flagged?.length) return null;
  return (
    <div className="mb-4 border border-amber-200 bg-amber-50 rounded-xl px-4 py-3">
      <p className="text-sm font-medium text-amber-800 mb-1">
        Needs attention before exams start
      </p>
      <ul className="space-y-0.5">
        {flagged.map(e => (
          <li key={e.id} className="text-xs text-amber-700">
            {e.course_code} — {e.status === 'pending' ? 'not yet emailed' : 'missing password'}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BookView() {
  const {
    book, date, loading, error,
    exams, stats, flagged,
    createBook,
  } = useBook();

  const [creating, setCreating] = useState(false);
  const [editExam, setEditExam] = useState(null);

  async function handleCreateBook() {
    setCreating(true);
    try {
      await createBook(date);
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-sm text-gray-400">
      Loading book…
    </div>
  );

  if (error) return (
    <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
      {error}
    </div>
  );

  if (!book) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <p className="text-sm text-gray-500">No book for {date}</p>
      <button
        onClick={handleCreateBook}
        disabled={creating}
        className="px-4 py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm
                   font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {creating ? 'Creating…' : '+ Create book for this day'}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Attention flags */}
      <AttentionBanner flagged={flagged} />

      {/* Exam list */}
      {exams.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-12">
          No exams yet — import a PDF to populate the book
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map(exam => (
            <ExamCard
              key={exam.id}
              exam={exam}
              onEdit={setEditExam}
            />
          ))}
        </div>
      )}

    </div>
  );
}
