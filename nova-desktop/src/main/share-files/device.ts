/**
 * 本机设备身份。
 * 首次使用时生成 ~/.nova/device.json：{ deviceId, name }
 * deviceId 稳定不变，作为本机在中继侧的唯一标识。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { NOVA_HOME } from '../services/settings'

interface DeviceIdentity {
  deviceId: string
  name: string
}

const DEVICE_FILE = join(NOVA_HOME, 'device.json')

let cached: DeviceIdentity | null = null

export function getDeviceIdentity(): DeviceIdentity {
  if (cached) return cached
  try {
    if (existsSync(DEVICE_FILE)) {
      const raw = JSON.parse(readFileSync(DEVICE_FILE, 'utf8')) as Partial<DeviceIdentity>
      if (raw.deviceId && raw.name) {
        cached = { deviceId: raw.deviceId, name: raw.name }
        return cached
      }
    }
  } catch {
    /* 损坏则重新生成 */
  }
  const identity: DeviceIdentity = {
    deviceId: `desktop-${randomUUID()}`,
    name: `${hostname() || 'Nova'} 的桌面`,
  }
  try {
    if (!existsSync(NOVA_HOME)) mkdirSync(NOVA_HOME, { recursive: true })
    writeFileSync(DEVICE_FILE, JSON.stringify(identity, null, 2))
  } catch {
    /* 写失败也允许内存态运行 */
  }
  cached = identity
  return cached
}
