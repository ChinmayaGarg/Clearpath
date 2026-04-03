/**
 * Book state — Zustand store.
 * Replaces the global allBooks / vDate state from the original app.
 */
import { create } from 'zustand';
import { api }    from '../lib/api.js';

export const useBookStore = create((set, get) => ({
  books:       {},   // { 'YYYY-MM-DD': ExamDay }
  activeDate:  new Date().toISOString().split('T')[0],
  loading:     false,
  error:       null,

  setActiveDate: (date) => set({ activeDate: date }),

  async loadBook(date) {
    set({ loading: true, error: null });
    try {
      const data = await api.get(`/books/${date}`);
      set(state => ({
        books:   { ...state.books, [date]: data.book },
        loading: false,
      }));
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  async loadAllDates() {
    const data = await api.get('/books');
    set({ books: data.books });
  },

  async updateExamStatus(examId, status) {
    const date = get().activeDate;
    await api.patch(`/exams/${examId}/status`, { status });
    await get().loadBook(date);
  },

  getActiveBook: () => {
    const { books, activeDate } = get();
    return books[activeDate] ?? null;
  },
}));
