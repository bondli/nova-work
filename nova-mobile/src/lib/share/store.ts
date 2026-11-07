/**
 * 文件共享状态管理。
 * - relayClient 单例：登录后启动，登出后停止
 * - Zustand store：中继状态、设备列表、文件列表供页面订阅
 */
import { create } from 'zustand'
import { ShareRelayClient, type RelayStatus, type ShareFileInfo } from './relay-client'
import { listLocalShareFiles } from './files'

let relayClient: ShareRelayClient | null = null

interface ShareState {
  status: RelayStatus
  localFiles: ShareFileInfo[]
  start: () => void
  stop: () => void
  refreshLocal: () => Promise<void>
}

export const useShareStore = create<ShareState>((set, get) => ({
  status: { connected: false, peers: [], lastError: null },
  localFiles: [],

  start: () => {
    if (relayClient) return
    relayClient = new ShareRelayClient()
    relayClient.onStatus((status) => set({ status }))
    void relayClient.start()
  },

  stop: () => {
    relayClient?.shutdown()
    relayClient = null
    set({ status: { connected: false, peers: [], lastError: null } })
  },

  refreshLocal: async () => {
    try {
      const files = await listLocalShareFiles()
      set({ localFiles: files })
    } catch {
      /* ignore */
    }
  },
}))

/** 供页面调用：列远程设备文件 */
export function listRemoteFiles(deviceId: string): Promise<ShareFileInfo[]> {
  if (!relayClient) return Promise.reject(new Error('中继未启动'))
  return relayClient.listRemote(deviceId)
}

/** 供页面调用：下载远程设备文件，返回本地 uri */
export function downloadRemoteFile(deviceId: string, name: string): Promise<string> {
  if (!relayClient) return Promise.reject(new Error('中继未启动'))
  return relayClient.downloadRemote(deviceId, name)
}
