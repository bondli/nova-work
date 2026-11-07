/**
 * 文件共享中继客户端（桌面端）。
 *
 * - 启动时从 POS /auth/share-token 换取 groupToken + relayUrl，连入 nova-relay
 * - 自动重连（指数退避）+ ping 心跳
 * - 处理远程 RPC：share:list（列文件）、share:download-start（分片下发）
 * - 主动调用：listRemote / downloadRemote
 */
import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import { getServerConfig } from '../services/server-config'
import { getDeviceIdentity } from './device'
import { listShareFiles, readShareFile, type ShareFileInfo } from './service'

/** 同组设备 */
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

interface RelayEnvelope {
  type: string
  id?: string
  timestamp?: number
  to?: string
  payload?: Record<string, unknown>
  sender?: { deviceId: string; name: string; role: string }
}

/** 分片大小：256KB，base64 后约 341KB，远低于 relay 4MB 上限 */
const CHUNK_SIZE = 256 * 1024
/** 首版单文件上限 300MB */
const MAX_FILE_SIZE = 300 * 1024 * 1024
const RECONNECT_DELAYS = [1_000, 2_000, 5_000, 10_000, 30_000]
const PING_INTERVAL_MS = 25_000
const RPC_TIMEOUT_MS = 30_000

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

  /** 待响应的 RPC：id → { resolve, reject, timer } */
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  /** 进行中的下载：id → { chunks: Map<index, base64>, total, name } */
  private downloads = new Map<string, { name: string; chunks: Map<number, string>; total: number | null }>()

  constructor(private onStatusChange: (status: RelayStatus) => void) {}

  /** 从 POS 换取令牌并连接 */
  async start(): Promise<void> {
    this.shouldRun = true
    try {
      const { groupToken, relayUrl } = await this.fetchShareToken()
      this.groupToken = groupToken
      this.relayUrl = relayUrl
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
    for (const d of this.downloads.values()) d.chunks.clear()
    this.downloads.clear()
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error('中继已断开'))
    }
    this.pending.clear()
  }

  getStatus(): RelayStatus {
    return {
      connected: this.connected,
      peers: [...this.peers.values()].sort((a, b) => a.name.localeCompare(b.name)),
      lastError: this.lastError,
    }
  }

  /** 列远程设备共享文件 */
  listRemote(deviceId: string): Promise<ShareFileInfo[]> {
    return this.call<ShareFileInfo[]>('share:list', {}, deviceId)
  }

  /** 下载远程设备文件，返回 Buffer */
  async downloadRemote(deviceId: string, name: string): Promise<Buffer> {
    const id = randomUUID()
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.downloads.delete(id)
        this.pending.delete(id)
        reject(new Error('下载超时'))
      }, RPC_TIMEOUT_MS * 4) // 下载超时放宽到 2 分钟

      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          this.pending.delete(id)
          resolve(v as Buffer)
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

  private async fetchShareToken(): Promise<{ groupToken: string; relayUrl: string }> {
    const config = await getServerConfig()
    const url = `${config.baseUrl}/auth/share-token`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-nova-token': config.token ?? '', 'Content-Type': 'application/json' },
    })
    if (!res.ok) throw new Error(`获取共享令牌失败 (${res.status})`)
    const data = (await res.json()) as { groupToken: string; relayUrl: string }
    if (!data.groupToken || !data.relayUrl) throw new Error('共享令牌响应不完整')
    return data
  }

  private httpToWsUrl(): string {
    const u = new URL(this.relayUrl)
    const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    const identity = getDeviceIdentity()
    const q = new URLSearchParams({
      role: 'desktop',
      deviceId: identity.deviceId,
      name: identity.name,
      groupToken: this.groupToken,
    })
    return `${wsProto}//${u.host}${u.pathname.replace(/\/$/, '')}/ws?${q.toString()}`
  }

  private connect(): void {
    if (!this.relayUrl) return
    let url: string
    try {
      url = this.httpToWsUrl()
    } catch {
      this.lastError = '中继地址格式无效'
      this.emit()
      return
    }

    const ws = new WebSocket(url, { handshakeTimeout: 10_000 })
    this.ws = ws

    ws.on('open', () => {
      this.connected = true
      this.reconnectAttempts = 0
      this.lastError = null
      this.startHeartbeat()
      this.emit()
    })

    ws.on('message', (raw) => {
      let msg: RelayEnvelope
      try {
        msg = JSON.parse(raw.toString()) as RelayEnvelope
      } catch {
        return
      }
      void this.handleMessage(msg)
    })

    ws.on('pong', () => {
      if (this.pongTimeout) {
        clearTimeout(this.pongTimeout)
        this.pongTimeout = null
      }
    })

    ws.on('close', () => {
      this.connected = false
      this.stopHeartbeat()
      for (const p of this.peers.values()) p.online = false
      this.emit()
      if (this.shouldRun && this.relayUrl) this.scheduleReconnect()
    })

    ws.on('error', () => {
      this.lastError = '中继连接失败'
    })
  }

  private teardownSocket(): void {
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.removeAllListeners()
      try { this.ws.close() } catch { /* ignore */ }
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
      this.ws.ping()
      this.pongTimeout = setTimeout(() => {
        try { this.ws?.terminate() } catch { /* ignore */ }
      }, 10_000)
    }, PING_INTERVAL_MS)
    this.pingTimer.unref?.()
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
    // 系统消息
    switch (msg.type) {
      case 'relay:hello': {
        const list = (msg.payload?.peers ?? []) as Array<{ deviceId: string; name: string; role: string }>
        this.peers = new Map(list.map((p) => [p.deviceId, { deviceId: p.deviceId, name: p.name, role: p.role as Peer['role'], online: true }]))
        this.emit()
        return
      }
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
        // 如果是某个 pending RPC 的错误，reject 它
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

    // 下载分片（请求方收到）
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
          const bufs: Buffer[] = []
          for (let i = 0; i < total; i++) {
            const b64 = dl.chunks.get(i)
            if (!b64) throw new Error(`缺失分片 ${i}`)
            bufs.push(Buffer.from(b64, 'base64'))
          }
          const buffer = Buffer.concat(bufs)
          this.downloads.delete(msg.id)
          clearTimeout(pend.timer)
          this.pending.delete(msg.id)
          pend.resolve(buffer)
        } catch (e) {
          this.downloads.delete(msg.id)
          clearTimeout(pend.timer)
          this.pending.delete(msg.id)
          pend.reject(e instanceof Error ? e : new Error('下载失败'))
        }
      }
      return
    }

    // RPC 响应（带 id 且是我们发起的）
    if (msg.id && this.pending.has(msg.id) && msg.type !== 'share:chunk' && msg.type !== 'share:download-end') {
      const pend = this.pending.get(msg.id)!
      clearTimeout(pend.timer)
      this.pending.delete(msg.id)
      pend.resolve(msg.payload)
      return
    }

    // 业务 RPC（远程设备请求本机）
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
          const files = await listShareFiles()
          await reply(files)
          return
        }
        case 'share:download-start': {
          const name = String(msg.payload?.name ?? '')
          if (!name) throw new Error('文件名必填')
          const buffer = await readShareFile(name)
          if (buffer.length > MAX_FILE_SIZE) {
            throw new Error(`文件超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 上限`)
          }
          const total = Math.ceil(buffer.length / CHUNK_SIZE) || 1
          for (let i = 0; i < total; i++) {
            const slice = buffer.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
            this.send('share:chunk', { name, index: i, total, data: slice.toString('base64') }, { id: msg.id, to: msg.sender?.deviceId })
          }
          this.send('share:download-end', { name, size: buffer.length }, { id: msg.id, to: msg.sender?.deviceId })
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
    this.onStatusChange(this.getStatus())
  }
}
