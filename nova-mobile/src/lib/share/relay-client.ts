/**
 * 文件共享中继客户端（手机端）。
 *
 * - 启动时从 POS /auth/share-token/mobile 换取 groupToken + relayUrl，连入 nova-relay
 * - 自动重连（指数退避）+ ping 心跳
 * - 处理远程 RPC：share:list（列文件）、share:download-start（分片下发）
 * - 主动调用：listRemote / downloadRemote
 *
 * 与桌面端 relay-client 协议完全一致，差异仅在运行时（RN 全局 WebSocket / expo-file-system）。
 */
import { randomUUID } from 'expo-crypto'

import { apiPost } from '@/src/lib/api'
import { getDeviceId, getDeviceName } from './device'
import { listLocalShareFiles, readShareFileBase64, writeShareFileBase64 } from './files'

export interface Peer {
  deviceId: string
  name: string
  role: 'desktop' | 'phone'
  online: boolean
}

export interface RelayStatus {
  connected: boolean
  peers: Peer[]
  lastError: string | null
}

export interface ShareFileInfo {
  name: string
  size: number
  mtime: number
}

interface RelayEnvelope {
  type: string
  id?: string
  timestamp?: number
  to?: string
  payload?: Record<string, unknown>
  sender?: { deviceId: string; name: string; role: string }
}

const CHUNK_SIZE = 256 * 1024
const MAX_FILE_SIZE = 300 * 1024 * 1024
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]
const PING_INTERVAL_MS = 25000
const RPC_TIMEOUT_MS = 30000

type Listener = (status: RelayStatus) => void

export class ShareRelayClient {
  private ws: WebSocket | null = null
  private connected = false
  private shouldRun = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private pongTimeout: ReturnType<typeof setTimeout> | null = null

  private relayUrl = ''
  private groupToken = ''
  private peers = new Map<string, Peer>()
  private lastError: string | null = null
  private listeners = new Set<Listener>()

  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private downloads = new Map<string, { name: string; chunks: Map<number, string>; total: number | null }>()

  onStatus(cb: Listener): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getStatus(): RelayStatus {
    return {
      connected: this.connected,
      peers: [...this.peers.values()].sort((a, b) => a.name.localeCompare(b.name)),
      lastError: this.lastError,
    }
  }

  async start(): Promise<void> {
    this.shouldRun = true
    try {
      const data = await apiPost<{ groupToken: string; relayUrl: string }>('/auth/share-token/mobile')
      this.groupToken = data.groupToken
      this.relayUrl = data.relayUrl
      this.reconnectAttempts = 0
      this.connect()
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : '获取共享令牌失败'
      this.emit()
      this.scheduleReconnect()
    }
  }

  shutdown(): void {
    this.shouldRun = false
    this.teardownSocket()
    this.clearReconnect()
    this.connected = false
    this.downloads.clear()
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error('中继已断开'))
    }
    this.pending.clear()
  }

  listRemote(deviceId: string): Promise<ShareFileInfo[]> {
    return this.call<ShareFileInfo[]>('share:list', {}, deviceId)
  }

  async downloadRemote(deviceId: string, name: string): Promise<string> {
    const id = randomUUID()
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.downloads.delete(id)
        this.pending.delete(id)
        reject(new Error('下载超时'))
      }, RPC_TIMEOUT_MS * 4)

      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          this.pending.delete(id)
          resolve(v as string)
        },
        reject: (e) => {
          clearTimeout(timer)
          this.pending.delete(id)
          this.downloads.delete(id)
          reject(e)
        },
        timer,
      })
      this.downloads.set(id, { name, chunks: new Map(), total: null })
      this.send('share:download-start', { name }, { id, to: deviceId })
    })
  }

  // ===== 连接管理 =====

  private async httpToWsUrl(): Promise<string> {
    const u = new URL(this.relayUrl)
    const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    const deviceId = await getDeviceId()
    const name = await getDeviceName()
    const q = new URLSearchParams({
      role: 'phone',
      deviceId,
      name,
      groupToken: this.groupToken,
    })
    const path = u.pathname.endsWith('/') ? u.pathname.slice(0, -1) : u.pathname
    return `${wsProto}//${u.host}${path}/ws?${q.toString()}`
  }

  private connect(): void {
    if (!this.relayUrl) return
    let urlPromise: Promise<string>
    try {
      urlPromise = this.httpToWsUrl()
    } catch {
      this.lastError = '中继地址格式无效'
      this.emit()
      return
    }
    void urlPromise.then((url) => {
      const ws = new WebSocket(url)
      this.ws = ws

      ws.onopen = () => {
        this.connected = true
        this.reconnectAttempts = 0
        this.lastError = null
        this.startHeartbeat()
        this.emit()
      }

      ws.onmessage = (event) => {
        let msg: RelayEnvelope
        try {
          msg = JSON.parse(event.data as string) as RelayEnvelope
        } catch {
          return
        }
        void this.handleMessage(msg)
      }

      ws.onclose = () => {
        this.connected = false
        this.stopHeartbeat()
        for (const p of this.peers.values()) p.online = false
        this.emit()
        if (this.shouldRun && this.relayUrl) this.scheduleReconnect()
      }

      ws.onerror = () => {
        this.lastError = '中继连接失败'
      }
    }).catch(() => {
      this.lastError = '中继地址格式无效'
      this.emit()
    })
  }

  private teardownSocket(): void {
    this.stopHeartbeat()
    if (this.ws) {
      try {
        this.ws.onopen = null
        this.ws.onmessage = null
        this.ws.onclose = null
        this.ws.onerror = null
        this.ws.close()
      } catch {
        /* ignore */
      }
      this.ws = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempts, RECONNECT_DELAYS.length - 1)]
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.shouldRun) void this.start()
    }, delay)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      try {
        this.send('relay:ping', {})
      } catch {
        /* ignore */
      }
    }, PING_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout)
      this.pongTimeout = null
    }
  }

  // ===== 消息处理 =====

  private async handleMessage(msg: RelayEnvelope): Promise<void> {
    switch (msg.type) {
      case 'relay:hello': {
        const list = (msg.payload?.peers ?? []) as { deviceId: string; name: string; role: string }[]
        this.peers = new Map(list.map((p) => [p.deviceId, { deviceId: p.deviceId, name: p.name, role: p.role as Peer['role'], online: true }]))
        this.emit()
        return
      }
      case 'relay:pong':
        return
      case 'relay:peer-online': {
        const p = msg.payload as { deviceId: string; name: string; role: string }
        this.peers.set(p.deviceId, { deviceId: p.deviceId, name: p.name, role: p.role as Peer['role'], online: true })
        this.emit()
        return
      }
      case 'relay:peer-offline': {
        const p = this.peers.get(msg.payload?.deviceId as string)
        if (p) {
          p.online = false
          this.emit()
        }
        return
      }
      case 'relay:error': {
        const id = msg.id
        if (id && this.pending.has(id)) {
          const pend = this.pending.get(id)!
          clearTimeout(pend.timer)
          this.pending.delete(id)
          this.downloads.delete(id)
          pend.reject(new Error(String(msg.payload?.message ?? '中继错误')))
        } else {
          this.lastError = String(msg.payload?.message ?? '中继错误')
          this.emit()
        }
        return
      }
      default:
        break
    }

    if (msg.type === 'share:chunk' && msg.id) {
      const dl = this.downloads.get(msg.id)
      if (dl) {
        const index = Number(msg.payload?.index)
        const data = String(msg.payload?.data ?? '')
        dl.chunks.set(index, data)
        if (msg.payload?.total != null) dl.total = Number(msg.payload.total)
        return
      }
    }
    if (msg.type === 'share:download-end' && msg.id) {
      const dl = this.downloads.get(msg.id)
      const pend = this.pending.get(msg.id)
      if (dl && pend) {
        try {
          const total = dl.total ?? dl.chunks.size
          const parts: string[] = []
          for (let i = 0; i < total; i++) {
            const b64 = dl.chunks.get(i)
            if (!b64) throw new Error(`缺失分片 ${i}`)
            parts.push(b64)
          }
          const base64 = parts.join('')
          const uri = await writeShareFileBase64(dl.name, base64)
          this.downloads.delete(msg.id)
          clearTimeout(pend.timer)
          this.pending.delete(msg.id)
          pend.resolve(uri)
        } catch (e) {
          this.downloads.delete(msg.id)
          clearTimeout(pend.timer)
          this.pending.delete(msg.id)
          pend.reject(e instanceof Error ? e : new Error('下载失败'))
        }
      }
      return
    }

    if (msg.id && this.pending.has(msg.id) && msg.type !== 'share:chunk' && msg.type !== 'share:download-end') {
      const pend = this.pending.get(msg.id)!
      clearTimeout(pend.timer)
      this.pending.delete(msg.id)
      pend.resolve(msg.payload)
      return
    }

    if (!msg.type.startsWith('relay:')) {
      await this.handleRemoteRpc(msg)
    }
  }

  private async handleRemoteRpc(msg: RelayEnvelope): Promise<void> {
    const reply = (payload: unknown) => this.send(msg.type, payload, { id: msg.id, to: msg.sender?.deviceId })
    const replyError = (message: string) => this.send('relay:error', { message }, { id: msg.id, to: msg.sender?.deviceId })

    try {
      switch (msg.type) {
        case 'share:list': {
          const files = await listLocalShareFiles()
          await reply(files)
          return
        }
        case 'share:download-start': {
          const name = String(msg.payload?.name ?? '')
          if (!name) throw new Error('文件名必填')
          const { base64, size } = await readShareFileBase64(name)
          if (size > MAX_FILE_SIZE) throw new Error(`文件超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 上限`)
          const total = Math.ceil(size / CHUNK_SIZE) || 1
          for (let i = 0; i < total; i++) {
            const slice = base64.slice(i * CHUNK_SIZE_B64, (i + 1) * CHUNK_SIZE_B64)
            this.send('share:chunk', { name, index: i, total, data: slice }, { id: msg.id, to: msg.sender?.deviceId })
          }
          this.send('share:download-end', { name, size }, { id: msg.id, to: msg.sender?.deviceId })
          return
        }
        default:
          await replyError(`不支持的消息类型: ${msg.type}`)
          return
      }
    } catch (err) {
      await replyError(err instanceof Error ? err.message : String(err))
    }
  }

  // ===== 发送 =====

  private send(type: string, payload: unknown, extra: Partial<RelayEnvelope> = {}): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const envelope: RelayEnvelope = {
      type,
      timestamp: Math.floor(Date.now() / 1000),
      payload: payload as Record<string, unknown>,
      ...extra,
    }
    this.ws.send(JSON.stringify(envelope))
  }

  private call<T>(type: string, payload: unknown, to: string): Promise<T> {
    if (!this.connected) return Promise.reject(new Error('中继未连接'))
    const id = randomUUID()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('请求超时'))
      }, RPC_TIMEOUT_MS)
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); this.pending.delete(id); resolve(v as T) },
        reject: (e) => { clearTimeout(timer); this.pending.delete(id); reject(e) },
        timer,
      })
      this.send(type, payload, { id, to })
    })
  }

  private emit(): void {
    const status = this.getStatus()
    for (const cb of this.listeners) cb(status)
  }
}

/** base64 编码后每片大小：256KB 原始数据 → 约 341KB base64 */
const CHUNK_SIZE_B64 = Math.ceil((CHUNK_SIZE * 4) / 3)
