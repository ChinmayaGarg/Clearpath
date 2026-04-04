import { useEffect }    from 'react';
import { useBookStore } from '../store/bookStore.js';

export function useBook() {
  const store = useBookStore();

  // Load book for active date on first use
  useEffect(() => {
    if (store.activeDate) {
      store.loadBook(store.activeDate);
    }
  }, [store.activeDate]); // eslint-disable-line

  return {
    book:         store.activeBook,
    date:         store.activeDate,
    loading:      store.loading,
    error:        store.error,
    setDate:      store.setActiveDate,
    createBook:   store.createBook,
    updateStatus: store.updateExamStatus,
    updateField:  store.updateExamField,
    deleteExam:   store.deleteExam,
    loadBook:     store.loadBook,
    exams:        store.activeBook?.exams        ?? [],
    stats:        store.activeBook?.stats        ?? {},
    flagged:      store.activeBook?.needsAttention ?? [],
  };
}
