import { create } from 'zustand';
import type { AuthResponse } from '../types';

interface AuthStore {
  user: AuthResponse['user'] | null;
  token: string | null;
  setAuth: (response: AuthResponse) => void;
  logout: () => void;
}

// M1 fix: hydrate from localStorage on cold load
const _storedToken = localStorage.getItem('access_token');
const _storedUser = (() => {
  try { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; }
  catch { return null; }
})();

export const useAuthStore = create<AuthStore>((set) => ({
  user: _storedUser,
  token: _storedToken,
  setAuth: (response) => {
    if (response.access) localStorage.setItem('access_token', response.access);
    if (response.refresh) localStorage.setItem('refresh_token', response.refresh);
    if (response.user) localStorage.setItem('user', JSON.stringify(response.user));
    set({ user: response.user || null, token: response.access || null });
  },
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    set({ user: null, token: null });
  },
}));
