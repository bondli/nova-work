import type { HeldOrder } from '@shared/types/buy'

const HELD_KEY = 'nova-buy-held-order'

/** 读取挂单：数据结构异常时按无挂单处理 */
export function readHeldOrder(): HeldOrder | null {
  try {
    const raw = window.localStorage.getItem(HELD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as HeldOrder
    return Array.isArray(parsed.cart) ? parsed : null
  } catch {
    return null
  }
}

/** 写入/清除挂单；本地存储异常时静默忽略，不影响收款主流程 */
export function writeHeldOrder(value: HeldOrder | null): void {
  try {
    if (value) window.localStorage.setItem(HELD_KEY, JSON.stringify(value))
    else window.localStorage.removeItem(HELD_KEY)
  } catch {
    return
  }
}
