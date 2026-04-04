import { useEffect, useRef, useState } from 'react';
import { useBook }                     from '../../hooks/useBook.js';
import ExamCard                        from './ExamCard.jsx';
import Spinner                         from '../ui/Spinner.jsx';
import { toast }                       from '../ui/Toast.jsx';

function StatsBar({ stats }) {
  if (!stats?.total) return null;
  return (
    <div className="flex flex-wrap gap-4 text-sm mb-4">
      <span>
        <strong className="text-gray-900">{stats.total}</strong>
        <span className="text-gray-500 ml-1">exams</span>
      </span>
      <span>
        <strong className="text-gray-900">{stats.students}</strong>
        <span className="text-gray-500 ml-1">students</span>
      </span>
      {stats.rwgCount > 0 && (
        <span className="text-red-600 font-medium">{stats.rwgCount} RWG</span>
      )}
      {stats.pending > 0 && (
        <span className="text-gray-400">{stats.pending} pending</span>
      )}
      {stats.pickedUp > 0 && (
        <span className="text-green-600">{stats.pickedUp} done</span>
      )}
    </div>
  );
}

function AttentionBanner({ flagged }) {
  if (!flagged?.length) return null;
  return (
    <div className="mb-4 border border-amber-200 bg-amber-50 rounded-xl px-4 py-3">
      <p className="text-sm font-medium text-amber-800 mb-1">Needs attention</p>
      {flagged.map(e => (
        <p key={e.id} className="text-xs text-amber-700">
          {e.course_code} —{' '}
          {e.status === 'pending' ? 'not yet emailed' : 'missing password'}
        </p>
      ))}
    </div>
  );
}

export default function BookView({ filter = 'all' }) {
  const { book, date, loading, error, exams, stats, flagged, createBook, loadBook } = useBook();
  const [creating, setCreating] = useState(false);

  // Load book when date changes — single stable effect
  const loadedDate = useRef(null);
  useEffect(() => {
    if (date && date !== loadedDate.current) {
      loadedDate.current = date;
      loadBook(date);
    }
  }, [date, loadBook]);

  async function handleCreate() {
    setCreating(true);
    try {
      await createBook(date);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  if (loading) return (
    <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  );

  if (error) return (
    <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</div>
  );

  if (!book) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <p className="text-sm text-gray-500">No book for this date</p>
      <button
        onClick={handleCreate}
        disabled={creating}
        className="px-4 py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm
                   font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {creating ? 'Creating…' : '+ Create book for this day'}
      </button>
    </div>
  );

  const filtered = exams.filter(e => {
    if (filter === 'pending')  return e.status === 'pending';
    if (filter === 'emailed')  return e.status === 'emailed';
    if (filter === 'received') return e.status === 'received';
    if (filter === 'rwg')      return e.rwg_flag;
    return true;
  });

  return (
    <div>
      <StatsBar stats={stats} />
      <AttentionBanner flagged={flagged} />
      {filtered.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-12">
          {exams.length === 0
            ? 'No exams yet — import a PDF to populate this book'
            : 'No exams match this filter'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(exam => (
            <ExamCard key={exam.id} exam={exam} />
          ))}
        </div>
      )}
    </div>
  );
}
