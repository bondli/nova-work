/**
 * 手机端设备身份。
 * deviceId 持久化到 SecureStore，首次启动时生成，之后稳定不变。
 */
import * as SecureStore from 'expo-secure-store'
import { randomUUID } from 'expo-crypto'
import { Platform } from 'react-native'

const KEY_DEVICE_ID = 'nova.share.deviceId'

let cachedId: string | null = null
let cachedName: string | null = null

export async function getDeviceId(): Promise<string> {
  if (cachedId) return cachedId
  try {
    const stored = await SecureStore.getItemAsync(KEY_DEVICE_ID)
    if (stored) {
      cachedId = stored
      return cachedId
    }
  } catch {
    /* ignore */
  }
  cachedId = `phone-${randomUUID()}`
  try {
    await SecureStore.setItemAsync(KEY_DEVICE_ID, cachedId)
  } catch {
    /* ignore */
  }
  return cachedId
}

export async function getDeviceName(): Promise<string> {
  if (cachedName) return cachedName
  const os = Platform.OS === 'ios' ? 'iPhone' : 'Android'
  cachedName = `${os} 手机`
  return cachedName
}
