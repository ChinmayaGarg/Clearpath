/**
 * Auth state — Zustand store.
 * Holds the current user, their roles, and feature access.
 */
import { create } from 'zustand';
import { api }    from '../lib/api.js';

export const useAuthStore = create((set, get) => ({
  user:     null,
  roles:    [],
  features: [],
  loading:  true,

  async init() {
    try {
      const data = await api.get('/auth/me');
      set({ user: data.user, roles: data.roles, features: data.features, loading: false });
    } catch {
      set({ user: null, roles: [], features: [], loading: false });
    }
  },

  async login(email, password) {
    const data = await api.post('/auth/login', { email, password });
    set({ user: data.user, roles: data.roles, features: data.features });
    return data;
  },

  async logout() {
    await api.post('/auth/logout', {});
    set({ user: null, roles: [], features: [] });
  },

  hasRole:    (role)    => get().roles.includes(role),
  hasFeature: (feature) => get().features.includes(feature),
}));
