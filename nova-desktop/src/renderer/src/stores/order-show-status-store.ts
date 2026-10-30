import { create } from 'zustand'
import { useAuthStore } from './auth-store'

/** 订单对外可见范围：hidden=对商场隐藏部分订单，all=全部订单 */
export type OrderShowStatus = 'all' | 'hidden'

/** 开关值缓存 */
const CACHE_KEY = 'orderShowStatus'

/** 本次登录已落过默认值的角色，避免刷新后被角色默认值覆盖 */
const ROLE_KEY = 'orderShowStatusRole'

/** 5 分钟倒计时的截止时间：切换会整页刷新，定时器活不过刷新，所以只把截止点存下来 */
const DEADLINE_KEY = 'orderShowStatusDeadline'

/** 导购员切到 all 后允许查看的时长 */
const CLERK_REVERT_MS = 5 * 60_000

let revertTimer: ReturnType<typeof setTimeout> | null = null

function readValue(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeValue(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // 缓存不可用时只保留内存状态
  }
}

function readStatus(): OrderShowStatus {
  return readValue(CACHE_KEY) === 'all' ? 'all' : 'hidden'
}

function writeStatus(value: OrderShowStatus): void {
  writeValue(CACHE_KEY, value)
}

function readDeadline(): number {
  return Number(readValue(DEADLINE_KEY)) || 0
}

function writeDeadline(at: number | null): void {
  writeValue(DEADLINE_KEY, at === null ? null : String(at))
}

/** 整页刷新：location.reload() 会被主进程的 will-navigate 拦截，必须走主进程重载 */
function reloadApp(): void {
  void window.nova.system.reload()
}

function clearRevertTimer(): void {
  if (revertTimer) {
    clearTimeout(revertTimer)
    revertTimer = null
  }
}

/** 回退为 hidden 并整页刷新 */
function revertToHidden(): void {
  clearRevertTimer()
  writeDeadline(null)
  writeStatus('hidden')
  useOrderShowStatusStore.setState({ showStatus: 'hidden' })
  reloadApp()
}

/** 按截止时间挂 5 分钟倒计时；已过期则立即回退 */
function startCountdown(at: number): void {
  clearRevertTimer()
  const delay = at - Date.now()
  if (delay <= 0) {
    revertToHidden()
    return
  }
  revertTimer = setTimeout(() => {
    revertTimer = null
    revertToHidden()
  }, delay)
}

interface OrderShowStatusState {
  showStatus: OrderShowStatus
  /** 登录后按角色落默认值：管理员 all，导购员 hidden */
  initForRole: () => void
  /** 切换可见范围：导购员切到 all 时开始 5 分钟倒计时 */
  toggle: () => void
}

/**
 * 订单隐藏开关（给商场检查用）。
 * 隐藏时查询订单/报表都会带上 showStatus=hidden，只统计「正常」订单。
 */
export const useOrderShowStatusStore = create<OrderShowStatusState>((set, get) => ({
  showStatus: readStatus(),

  initForRole: () => {
    const role = useAuthStore.getState().user?.role
    // 登录态未就绪时不做判定，避免把导购员误落成管理员的 all
    if (!role) return

    // 换角色或本次会话首次进入：落角色默认值
    if (readValue(ROLE_KEY) !== role) {
      writeValue(ROLE_KEY, role)
      clearRevertTimer()
      writeDeadline(null)
      const next: OrderShowStatus = role === 'clerk' ? 'hidden' : 'all'
      writeStatus(next)
      set({ showStatus: next })
      return
    }

    // 刷新 / 重新进入：按缓存恢复，有未到期的倒计时就重新挂上
    const at = readDeadline()
    if (at > 0) startCountdown(at)
  },

  toggle: () => {
    const role = useAuthStore.getState().user?.role
    const next: OrderShowStatus = get().showStatus === 'all' ? 'hidden' : 'all'
    clearRevertTimer()
    writeStatus(next)

    // 导购员切到 all 开始倒计时；切回 hidden 则把倒计时清掉
    if (next === 'all' && role === 'clerk') {
      const at = Date.now() + CLERK_REVERT_MS
      writeDeadline(at)
      // 当前页面先挂上，避免重载失败时倒计时丢失；重载成功后由 initForRole 按剩余时间重挂
      startCountdown(at)
    } else {
      writeDeadline(null)
    }
    set({ showStatus: next })

    reloadApp()
  }
}))

/** 组件内订阅当前可见范围 */
export function useOrderShowStatus(): OrderShowStatus {
  return useOrderShowStatusStore((state) => state.showStatus)
}

/** 取当前可见范围，供数据访问层拼查询参数 */
export function getOrderShowStatus(): OrderShowStatus {
  return useOrderShowStatusStore.getState().showStatus
}
