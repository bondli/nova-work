// 大转盘落点计算：奖品扇区中心停在顶部指针处，并额外旋转 turns 圈
// 转盘样式固定 6 扇区：奖池需保持 6 项（谢谢参与 + 5 个奖品）
export const WHEEL_SECTOR_COUNT = 6

export function nextWheelRotation(
  currentRotation: number,
  prizeIndex: number,
  turns = 5
): number {
  const sectorAngle = 360 / WHEEL_SECTOR_COUNT
  const target = ((360 - prizeIndex * sectorAngle) % 360 + 360) % 360
  const current = ((currentRotation % 360) + 360) % 360
  const delta = ((target - current + 360) % 360)
  return currentRotation + 360 * turns + delta
}

/** 生成抽奖/兑换幂等 ID，避免客户端重复提交造成重复扣分 */
export function createRequestId(): string {
  return `${Date.now()}${Math.random().toString(36).slice(2, 10)}`
}
