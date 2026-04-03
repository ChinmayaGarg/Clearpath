import { useEffect }  from 'react';
import { useBook }    from '../hooks/useBook.js';
import { useBookStore } from '../store/bookStore.js';
import BookView       from '../components/book/BookView.jsx';

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

export default function Book() {
  const { date, setDate } = useBook();
  const loadAllDates      = useBookStore(s => s.loadAllDates);
  const allDates          = useBookStore(s => s.allDates);

  useEffect(() => {
    loadAllDates();
  }, [loadAllDates]);

  function shiftDate(days) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">

      {/* Date navigation */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => shiftDate(-1)}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50
                     text-gray-500 transition-colors"
          aria-label="Previous day"
        >
          ←
        </button>

        <div className="flex-1">
          <h1 className="text-lg font-semibold text-gray-900">
            {formatDate(date)}
          </h1>
        </div>

        <button
          onClick={() => shiftDate(1)}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50
                     text-gray-500 transition-colors"
          aria-label="Next day"
        >
          →
        </button>

        <button
          onClick={() => setDate(new Date().toISOString().split('T')[0])}
          className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200
                     rounded-lg hover:bg-gray-50 transition-colors"
        >
          Today
        </button>
      </div>

      {/* Book content */}
      <BookView />

    </div>
  );
}
