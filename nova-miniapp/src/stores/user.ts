import Taro from '@tarojs/taro'
import { create } from 'zustand'
import { MEMBER_KEY, TOKEN_KEY, UNAUTHORIZED_EVENT } from '@/constants'
import type { MemberSummary } from '@/types/api'
import { loginByPhone, silentLogin } from '@/services/auth'
import { getProfile } from '@/services/profile'

interface UserState {
  token: string
  member: MemberSummary | null
  /** 静默登录已尝试过，避免页面重复请求 */
  silentChecked: boolean
  silentLogin: () => Promise<void>
  login: (phoneCode: string) => Promise<void>
  refreshProfile: () => Promise<void>
  logout: () => void
}

const readToken = (): string => (Taro.getStorageSync(TOKEN_KEY) as string) || ''
const readMember = (): MemberSummary | null => {
  const cached = Taro.getStorageSync(MEMBER_KEY) as MemberSummary | undefined
  return cached ?? null
}

const persistSession = (token: string, member: MemberSummary): void => {
  Taro.setStorageSync(TOKEN_KEY, token)
  Taro.setStorageSync(MEMBER_KEY, member)
}

export const useUserStore = create<UserState>((set, get) => ({
  token: readToken(),
  member: readMember(),
  silentChecked: false,

  // 启动静默续期：openid 已绑定会员时，7 天内无需再次授权手机号
  silentLogin: async () => {
    if (get().silentChecked || get().token) {
      set({ silentChecked: true })
      return
    }
    set({ silentChecked: true })
    try {
      const { code } = await Taro.login()
      if (!code) return
      const result = await silentLogin(code)
      if (result.token && result.member) {
        persistSession(result.token, result.member)
        set({ token: result.token, member: result.member })
      }
    } catch {
      // 未绑定 openid 或微信凭证缺失时不打扰用户，等用户点击授权
    }
  },

  // 微信授权手机号登录：手机号即门店会员号
  login: async (phoneCode: string) => {
    const { code } = await Taro.login()
    if (!code) throw new Error('微信登录失败，请稍后重试')
    const result = await loginByPhone(code, phoneCode)
    persistSession(result.token, result.member)
    set({ token: result.token, member: result.member })
  },

  refreshProfile: async () => {
    if (!get().token) return
    const member = await getProfile()
    Taro.setStorageSync(MEMBER_KEY, member)
    set({ member })
  },

  logout: () => {
    Taro.removeStorageSync(TOKEN_KEY)
    Taro.removeStorageSync(MEMBER_KEY)
    set({ token: '', member: null })
  }
}))

// 401 由请求层广播，这里统一清空登录态；页面据此切回登录引导
Taro.eventCenter.on(UNAUTHORIZED_EVENT, () => {
  useUserStore.setState({ token: '', member: null })
})
