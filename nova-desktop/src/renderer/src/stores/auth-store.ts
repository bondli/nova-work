import { create } from 'zustand'
import type { AuthUser, LoginInput, RegisterInput } from '@shared/types/auth'
import { unwrap } from '@renderer/lib/ipc'

/**
 * 登录态 store。
 * loading：正在恢复会话；anonymous：未登录；authenticated：已登录。
 */
type AuthStatus = 'loading' | 'anonymous' | 'authenticated'

interface AuthState {
  user: AuthUser | null
  status: AuthStatus
  bootstrap: () => Promise<void>
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
}

/** 全局登录态：登录、注册、登出与会话恢复 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',

  // 应用启动时读取主进程会话，决定进入登录页还是应用壳
  bootstrap: async () => {
    try {
      const user = unwrap(await window.nova.auth.session())
      set({ user, status: user ? 'authenticated' : 'anonymous' })
    } catch {
      set({ user: null, status: 'anonymous' })
    }
  },

  login: async (input) => {
    const user = unwrap(await window.nova.auth.login(input))
    set({ user, status: 'authenticated' })
  },

  register: async (input) => {
    const user = unwrap(await window.nova.auth.register(input))
    set({ user, status: 'authenticated' })
  },

  logout: async () => {
    unwrap(await window.nova.auth.logout())
    set({ user: null, status: 'anonymous' })
  }
}))
