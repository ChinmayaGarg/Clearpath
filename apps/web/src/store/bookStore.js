import { create } from 'zustand';
import { api }    from '../lib/api.js';

export const useBookStore = create((set, get) => ({
  // Calendar summary — all dates
  allDates:   [],
  // Full book data for the active date
  activeBook: null,
  activeDate: new Date().toISOString().split('T')[0],
  loading:    false,
  error:      null,

  setActiveDate: (date) => {
    set({ activeDate: date, activeBook: null });
    get().loadBook(date);
  },

  async loadAllDates() {
    try {
      const data = await api.get('/books');
      set({ allDates: data.books });
    } catch (err) {
      set({ error: err.message });
    }
  },

  async loadBook(date) {
    set({ loading: true, error: null });
    try {
      const data = await api.get(`/books/${date}`);
      set({ activeBook: data.book, loading: false });
    } catch (err) {
      if (err.message.includes('No book found')) {
        set({ activeBook: null, loading: false });
      } else {
        set({ error: err.message, loading: false });
      }
    }
  },

  async createBook(date) {
    const data = await api.post('/books', { date });
    set({ activeBook: data.book });
    get().loadAllDates();
    return data.book;
  },

  async updateExamStatus(examId, status, note) {
    await api.patch(`/exams/${examId}/status`, { status, note });
    get().loadBook(get().activeDate);
  },

  async updateExamField(examId, fields) {
    await api.patch(`/exams/${examId}`, fields);
    get().loadBook(get().activeDate);
  },

  async deleteExam(examId) {
    await api.delete(`/exams/${examId}`);
    get().loadBook(get().activeDate);
  },

  // Derived helpers
  getDateSummary: (date) =>
    get().allDates.find(d => d.date === date) ?? null,
}));
