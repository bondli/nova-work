import { create } from 'zustand';

import { ApiError, apiPost, configureApi } from '@/src/lib/api';
import { DEFAULT_BASE_URL, clearSession, loadSession, saveBaseUrl, saveSession } from '@/src/lib/storage';
import type { LoginResult, SessionUser } from '@/src/lib/types';

interface AuthState {
  ready: boolean;
  baseUrl: string;
  token: string | null;
  user: SessionUser | null;
  /** 启动时从 SecureStore 恢复会话 */
  hydrate: () => Promise<void>;
  login: (input: { baseUrl: string; username: string; password: string }) => Promise<void>;
  updateBaseUrl: (baseUrl: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ready: false,
  baseUrl: DEFAULT_BASE_URL,
  token: null,
  user: null,

  hydrate: async () => {
    const stored = await loadSession();
    const baseUrl = stored.baseUrl ?? DEFAULT_BASE_URL;
    configureApi({ baseUrl, token: stored.token ?? null });
    set({
      ready: true,
      baseUrl,
      token: stored.token ?? null,
      user: stored.user ?? null,
    });
  },

  login: async ({ baseUrl, username, password }) => {
    configureApi({ baseUrl, token: null });
    const result = await apiPost<LoginResult>('/auth/mobile-login', { username, password });
    if (!result?.token || !result.user) {
      throw new ApiError('登录返回异常，请稍后重试');
    }

    configureApi({ token: result.token });
    await saveSession({ baseUrl, token: result.token, user: result.user });
    set({ baseUrl, token: result.token, user: result.user });
  },

  updateBaseUrl: async (baseUrl) => {
    configureApi({ baseUrl });
    await saveBaseUrl(baseUrl);
    set({ baseUrl });
  },

  logout: async () => {
    configureApi({ token: null });
    await clearSession();
    set({ token: null, user: null });
    // 保留 baseUrl，方便同一台设备再次登录
    void get().baseUrl;
  },
}));
