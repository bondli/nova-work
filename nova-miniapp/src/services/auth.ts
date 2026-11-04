import type { MemberSummary } from '@/types/api'
import { request } from './request'

export interface LoginPayload {
  token: string
  expiresIn: number
  member: MemberSummary
}

export interface SilentPayload {
  token?: string
  expiresIn?: number
  member?: MemberSummary
  needPhoneAuth?: boolean
}

/** 微信登录：code 换 openid，phoneCode 换手机号；手机号即会员号 */
export const loginByPhone = (code: string, phoneCode: string): Promise<LoginPayload> =>
  request<LoginPayload>('/mini/auth/login', {
    method: 'POST',
    data: { code, phoneCode },
    skipAuth: true
  })

/** 静默续期：openid 已绑定会员时无需再次授权手机号 */
export const silentLogin = (code: string): Promise<SilentPayload> =>
  request<SilentPayload>('/mini/auth/silent', {
    method: 'POST',
    data: { code },
    skipAuth: true
  })
