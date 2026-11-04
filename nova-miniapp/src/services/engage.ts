import type { DrawResult, LotteryConfig, SignInResult, SignInStatus } from '@/types/api'
import { request } from './request'

export const getSignInStatus = (): Promise<SignInStatus> => request<SignInStatus>('/mini/signin/status')

export const signIn = (): Promise<SignInResult> => request<SignInResult>('/mini/signin', { method: 'POST' })

export const getLotteryConfig = (): Promise<LotteryConfig> => request<LotteryConfig>('/mini/lottery/config')

export const drawLottery = (requestId: string): Promise<DrawResult> =>
  request<DrawResult>('/mini/lottery/draw', { method: 'POST', data: { requestId } })
