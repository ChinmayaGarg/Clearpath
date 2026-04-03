import { useBookStore } from '../store/bookStore.js';

export function useBook() {
  const activeBook   = useBookStore(s => s.activeBook);
  const activeDate   = useBookStore(s => s.activeDate);
  const loading      = useBookStore(s => s.loading);
  const error        = useBookStore(s => s.error);
  const setDate      = useBookStore(s => s.setActiveDate);
  const createBook   = useBookStore(s => s.createBook);
  const updateStatus = useBookStore(s => s.updateExamStatus);
  const updateField  = useBookStore(s => s.updateExamField);
  const deleteExam   = useBookStore(s => s.deleteExam);

  return {
    book: activeBook,
    date: activeDate,
    loading,
    error,
    setDate,
    createBook,
    updateStatus,
    updateField,
    deleteExam,
    exams:   activeBook?.exams   ?? [],
    stats:   activeBook?.stats   ?? {},
    flagged: activeBook?.needsAttention ?? [],
  };
}
