import { create } from 'zustand';
import { api }    from '../lib/api.js';

export const useBookStore = create((set, get) => ({
  allDates:   [],
  activeBook: null,
  activeDate: new Date().toISOString().split('T')[0],
  loading:    false,
  error:      null,

  // Just update the date — BookView will detect the change and call loadBook
  setActiveDate: (date) => {
    set({ activeDate: date, activeBook: null, error: null });
  },

  async loadAllDates() {
    try {
      const data = await api.get('/books');
      set({ allDates: data.books });
    } catch (err) {
      console.error('loadAllDates failed:', err.message);
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
    await get().loadBook(get().activeDate);
  },

  async updateExamField(examId, fields) {
    await api.patch(`/exams/${examId}`, fields);
    await get().loadBook(get().activeDate);
  },

  async deleteExam(examId) {
    await api.delete(`/exams/${examId}`);
    await get().loadBook(get().activeDate);
  },
}));
