import { create } from 'zustand';
import * as api from '../api/client';
import { saveTokens, clearTokens } from '../api/client';

interface User { id: string; username: string; email: string; elo: number; accountLevel: number; }
interface AuthState {
  user: User | null; isLoading: boolean; error: string | null;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  clearError: () => void;
}
export const useAuthStore = create<AuthState>((set) => ({
  user: null, isLoading: true, error: null, // true until loadUser completes
  login: async (usernameOrEmail, password) => {
    set({ isLoading: true, error: null });
    try { const result = await api.login(usernameOrEmail, password); await saveTokens(result.tokens.accessToken, result.tokens.refreshToken); set({ user: result.user, isLoading: false }); }
    catch (err) { set({ error: err instanceof Error ? err.message : 'Login failed', isLoading: false }); }
  },
  register: async (username, email, password) => {
    set({ isLoading: true, error: null });
    try { const result = await api.register(username, email, password); await saveTokens(result.tokens.accessToken, result.tokens.refreshToken); set({ user: result.user, isLoading: false }); }
    catch (err) { set({ error: err instanceof Error ? err.message : 'Registration failed', isLoading: false }); }
  },
  logout: async () => { set({ isLoading: true }); try { await api.logout(); } catch { } await clearTokens(); set({ user: null, isLoading: false }); },
  loadUser: async () => {
    set({ isLoading: true });
    try { const token = await api.getAccessToken(); if (!token) { set({ isLoading: false }); return; } const profile = await api.getMe(); set({ user: profile, isLoading: false }); }
    catch { await clearTokens(); set({ user: null, isLoading: false }); }
  },
  clearError: () => set({ error: null }),
}));
