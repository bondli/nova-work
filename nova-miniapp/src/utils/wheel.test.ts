import { describe, expect, it } from 'vitest'
import { nextWheelRotation } from './wheel'

describe('nextWheelRotation', () => {
  it('把 0 号扇区停到顶部时至少多转 5 圈', () => {
    expect(nextWheelRotation(0, 0)).toBe(1800)
  })

  it('落点始终等于扇区中心角度', () => {
    const rotation = nextWheelRotation(123, 2)
    const normalized = ((rotation % 360) + 360) % 360
    // 2 号扇区中心角 120°，停到顶部需要旋转 360-120=240°
    expect(normalized).toBe(240)
  })

  it('连续抽奖时在当前角度基础上继续累加', () => {
    const first = nextWheelRotation(0, 3)
    const second = nextWheelRotation(first, 1)
    expect(second).toBeGreaterThan(first)
  })
})
