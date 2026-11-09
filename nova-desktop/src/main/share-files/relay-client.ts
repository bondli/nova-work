/**
 * 文件共享中继客户端（桌面端）。
 *
 * - 启动时从 POS /auth/share-token 换取 groupToken + relayUrl，连入 nova-relay
 * - 自动重连（指数退避）+ ping 心跳
 * - 处理远程 RPC：share:list（列文件）、share:download-start（分片下发）
 * - 主动调用：listRemote / downloadRemote
 *
 * 大文件传输采用「窗口 + 逐片 ACK」流控：发送方每发 SEND_WINDOW_CHUNKS 片就等待
 * 接收方回执，避免一次性灌满中继与接收端内存导致断连/超时；接收方用空闲超时
 * （每收到一片重置）替代固定总时长，120MB 以上文件不会再被 2 分钟总超时中断。
 */
import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import { getServerConfig } from '../services/server-config'
import { getDeviceIdentity } from './device'
import { lanShareServer } from './lan-server'
import { listShareFiles, readShareFile, statShareFile, type ShareFileInfo } from './service'

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

/** 下载进度（接收方视角） */
export interface ShareProgress {
  name: string
  received: number
  total: number
}

interface RelayEnvelope {
  type: string
  id?: string
  timestamp?: number
  to?: string
  payload?: Record<string, unknown>
  sender?: { deviceId: string; name: string; role: string }
}

/** 分片大小：256KB。中继链路带宽有限，分片过大会让中继积压几十 MB、心跳超时误判断连 */
const CHUNK_SIZE = 256 * 1024
/** 首版单文件上限 300MB */
const MAX_FILE_SIZE = 300 * 1024 * 1024
const RECONNECT_DELAYS = [1_000, 2_000, 5_000, 10_000, 30_000]
const PING_INTERVAL_MS = 25_000
const RPC_TIMEOUT_MS = 30_000
/** 滑动窗口：在途最多 4 片（约 1.4MB）；链路慢时也不会把中继/心跳缓冲打满 */
const SEND_WINDOW_CHUNKS = 4
/** 等待 ACK 进展的超时；超时说明链路已不可用 */
const WINDOW_ACK_TIMEOUT_MS = 60_000
/** 首片 ACK 超时：超过就认为对端不支持 ACK（旧版本），降级为无流控直发 */
const FIRST_ACK_TIMEOUT_MS = 15_000
/** 接收方空闲超时：连续这么久没收到分片才判定失败 */
const DOWNLOAD_IDLE_TIMEOUT_MS = 60_000
/** 发送方读取/准备文件的超时：接收方收到 accept 后放宽到这个时长 */
const DOWNLOAD_PREPARE_TIMEOUT_MS = 180_000
/** 局域网直连：等待接收方探测直连地址的时间 */
const DIRECT_PROBE_TIMEOUT_MS = 3_000
/** 局域网直连：等待接收方完成直连下载的时间 */
const DIRECT_DONE_TIMEOUT_MS = 10 * 60_000

/** base64 长度换算为原始字节数（含 padding 误差） */
function base64Bytes(data: string): number {
  return Math.floor((data.length * 3) / 4)
}

interface DownloadState {
  name: string
  chunks: Map<number, string>
  total: number | null
  size: number
  received: number
  /** 重置空闲超时定时器；可指定本次超时时长 */
  resetTimer: (timeoutMs?: number) => void
  onProgress?: (progress: ShareProgress) => void
}

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

  /** 待响应的 RPC：id → { resolve, reject, timer, to } */
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; to?: string }>()
  /** 进行中的下载（本机作为接收方）：id → 状态 */
  private downloads = new Map<string, DownloadState>()
  /** 发送窗口 ACK 状态（本机作为发送方）：downloadId → 已确认片数 + 进展通知 */
  private ackState = new Map<string, { received: number; canceled: boolean; flowControl: boolean; notify: (() => void) | null }>()
  /** 局域网直连协商：等待接收方回应是否使用直连 */
  private directResults = new Map<string, { resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> }>()
  /** 局域网直连协商：等待接收方报告直连下载结果 */
  private directDones = new Map<string, { resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> }>()
  /** 接收方已取消的下载 ID（协商阶段还没进入分片发送时也要能中止） */
  private canceledDownloads = new Set<string>()

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
    this.ackState.clear()
    for (const item of this.directResults.values()) {
      clearTimeout(item.timer)
      item.resolve(false)
    }
    this.directResults.clear()
    for (const item of this.directDones.values()) {
      clearTimeout(item.timer)
      item.resolve(false)
    }
    this.directDones.clear()
    this.canceledDownloads.clear()
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

  /** 下载远程设备文件，返回 Buffer；onProgress 用于渲染层展示进度 */
  async downloadRemote(
    deviceId: string,
    name: string,
    onProgress?: (progress: ShareProgress) => void
  ): Promise<Buffer> {
    const id = randomUUID()
    return new Promise<Buffer>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>
      const pend = {
        resolve: (v: unknown) => {
          clearTimeout(timer)
          this.pending.delete(id)
          this.downloads.delete(id)
          resolve(v as Buffer)
        },
        reject: (e: Error) => {
          clearTimeout(timer)
          this.pending.delete(id)
          this.downloads.delete(id)
          reject(e)
        },
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
        to: deviceId,
      }
      // 空闲超时：每收到一片都会重置，避免大文件被固定总时长打断
      const resetTimer = (timeoutMs: number = DOWNLOAD_IDLE_TIMEOUT_MS): void => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          this.downloads.delete(id)
          this.pending.delete(id)
          reject(new Error('下载超时（长时间无数据）'))
        }, timeoutMs)
        pend.timer = timer
      }
      resetTimer()
      this.pending.set(id, pend)
      this.downloads.set(id, {
        name,
        chunks: new Map(),
        total: null,
        size: 0,
        received: 0,
        resetTimer,
        onProgress,
      })
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
        // 传输期间链路可能因带宽满而延迟 pong，放宽到 60s，避免误判断线
        try { this.ws?.terminate() } catch { /* ignore */ }
      }, 60_000)
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
        const message = String(msg.payload?.message ?? '中继错误')
        if (id && this.pending.has(id)) {
          const pend = this.pending.get(id)!
          clearTimeout(pend.timer)
          // 目标设备离线：同步把该 peer 标记为离线，避免继续对它发请求
          if (message === '目标设备离线' && pend.to) {
            const peer = this.peers.get(pend.to)
            if (peer) peer.online = false
          }
          this.pending.delete(id)
          this.downloads.delete(id)
          pend.reject(new Error(message))
        } else if (!id) {
          // 无 id 的错误才是全局状态；带 id 的多为旧版本对端对未知消息的拒绝，忽略以免污染状态栏
          this.lastError = message
          this.emit()
        }
        return
      }
      default:
        break
    }

    // 分片 ACK（本机作为发送方收到）：推进滑动窗口
    if (msg.type === 'share:chunk-ack' && msg.id) {
      const state = this.ackState.get(msg.id)
      if (state) {
        const received = Number(msg.payload?.received ?? state.received)
        if (received > state.received) state.received = received
        state.notify?.()
      }
      return
    }

    // 接收方取消下载：停止发送并释放窗口状态
    if (msg.type === 'share:download-cancel' && msg.id) {
      const state = this.ackState.get(msg.id)
      if (state) {
        state.canceled = true
        state.notify?.()
        state.notify = null
      } else {
        this.canceledDownloads.add(msg.id)
      }
      this.directResults.get(msg.id)?.resolve(false)
      this.directDones.get(msg.id)?.resolve(false)
      return
    }

    // 局域网直连协商：接收方回应是否可以直连
    if (msg.type === 'share:download-direct-result' && msg.id) {
      this.directResults.get(msg.id)?.resolve(Boolean(msg.payload?.ok))
      return
    }
    // 局域网直连协商：接收方报告直连下载成功 / 失败
    if (msg.type === 'share:download-direct-done' && msg.id) {
      this.directDones.get(msg.id)?.resolve(Boolean(msg.payload?.ok))
      return
    }

    // 发送方开始准备文件（大文件读取可能较久）：先放宽空闲超时
    if (msg.type === 'share:download-accept' && msg.id) {
      const dl = this.downloads.get(msg.id)
      if (dl) {
        if (msg.payload?.size != null) dl.size = Number(msg.payload.size)
        dl.resetTimer(DOWNLOAD_PREPARE_TIMEOUT_MS)
      }
      return
    }

    // 下载分片（本机作为接收方）
    if (msg.type === 'share:chunk' && msg.id) {
      const dl = this.downloads.get(msg.id)
      if (dl) {
        const index = Number(msg.payload?.index)
        const data = String(msg.payload?.data ?? '')
        dl.chunks.set(index, data)
        if (msg.payload?.total != null) dl.total = Number(msg.payload.total)
        if (msg.payload?.size != null) dl.size = Number(msg.payload.size)
        dl.received += base64Bytes(data)
        dl.resetTimer()
        // 回执：发送方据此推进下一个窗口
        const senderId = msg.sender?.deviceId
        if (senderId) {
          this.send('share:chunk-ack', { index, received: dl.chunks.size }, { id: msg.id, to: senderId })
        }
        dl.onProgress?.({
          name: dl.name,
          received: dl.received,
          total: dl.size || dl.received,
        })
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
          dl.onProgress?.({ name: dl.name, received: buffer.length, total: buffer.length })
          pend.resolve(buffer)
        } catch (e) {
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
          const downloadId = msg.id
          const target = msg.sender?.deviceId
          const { size } = await statShareFile(name)
          if (size > MAX_FILE_SIZE) {
            throw new Error(`文件超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 上限`)
          }
          // 先告诉对方「已收到、正在准备」，避免大文件读取期间被误判超时
          this.send('share:download-accept', { name, size }, { id: downloadId, to: target })

          // 1) 优先尝试局域网直连：把本机局域网地址发给接收方探测。
          //    探测/下载失败会自动回落到下面的中继分片传输。
          if (downloadId) {
            const urls = await lanShareServer.offer(name)
            if (urls.length > 0) {
              this.send('share:download-direct', { name, size, urls }, { id: downloadId, to: target })
              const accepted = await this.waitDirectResult(downloadId, DIRECT_PROBE_TIMEOUT_MS)
              if (accepted) {
                const completed = await this.waitDirectDone(downloadId, DIRECT_DONE_TIMEOUT_MS)
                if (completed) {
                  this.canceledDownloads.delete(downloadId)
                  lanShareServer.touch()
                  return
                }
              }
            }
            // 直连协商期间被取消：直接结束，不再回退分片
            if (this.canceledDownloads.delete(downloadId)) return
          }

          // 2) 回退：走中继分片传输
          const buffer = await readShareFile(name)
          const total = Math.ceil(buffer.length / CHUNK_SIZE) || 1
          if (downloadId) this.ackState.set(downloadId, { received: 0, canceled: false, flowControl: true, notify: null })
          try {
            const state = downloadId ? this.ackState.get(downloadId) : undefined
            let sent = 0
            const sendChunk = (index: number): void => {
              const slice = buffer.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
              this.send(
                'share:chunk',
                { name, index, total, size: buffer.length, data: slice.toString('base64') },
                { id: downloadId, to: target }
              )
            }
            // 滑动窗口：在途片数低于窗口就继续发，收到 ACK 即补发
            while (sent < total) {
              if (state?.canceled) throw new Error('对方已取消下载')
              if (state && !state.flowControl) {
                // 对端不支持 ACK（旧版本）：退化为连续直发，避免长时间卡住
                while (sent < total) sendChunk(sent++)
                break
              }
              while (sent < total && sent - (state?.received ?? 0) < SEND_WINDOW_CHUNKS) {
                sendChunk(sent++)
              }
              if (sent >= total && (state?.received ?? 0) >= sent) break
              try {
                await this.waitForProgress(
                  downloadId!,
                  (state?.received ?? 0) === 0 ? FIRST_ACK_TIMEOUT_MS : WINDOW_ACK_TIMEOUT_MS
                )
              } catch (e) {
                // 首片就等不到 ACK：判定为旧版本对端，降级后继续发送
                if (state && state.received === 0) {
                  state.flowControl = false
                  continue
                }
                throw e
              }
            }
            // 流控模式下等全部确认后发结束帧，保证落盘顺序
            if (downloadId && state && state.flowControl) {
              while (state.received < total) {
                if (state.canceled) throw new Error('对方已取消下载')
                await this.waitForProgress(downloadId)
              }
            }
            this.send('share:download-end', { name, size: buffer.length }, { id: downloadId, to: target })
          } finally {
            if (downloadId) {
              this.ackState.delete(downloadId)
              this.canceledDownloads.delete(downloadId)
            }
          }
          return
        }
        default:
          await replyError(`不支持的消息类型: ${msg.type}`)
          return
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // 接收方主动取消时不回错误帧，避免对方状态栏出现异常提示
      if (!message.includes('取消')) await replyError(message)
    }
  }

  /** 等待接收方 ACK 推进（任意一片）；长时间无进展视为链路失败 */
  private waitForProgress(downloadId: string, timeoutMs: number = WINDOW_ACK_TIMEOUT_MS): Promise<void> {
    const state = this.ackState.get(downloadId)
    if (!state) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        state.notify = null
        reject(new Error('传输超时，请稍后重试'))
      }, timeoutMs)
      state.notify = () => {
        clearTimeout(timer)
        state.notify = null
        resolve()
      }
    })
  }

  /** 局域网直连：等待接收方回应是否可直连 */
  private waitDirectResult(downloadId: string, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.directResults.delete(downloadId)
        resolve(false)
      }, timeoutMs)
      this.directResults.set(downloadId, {
        timer,
        resolve: (ok) => {
          clearTimeout(timer)
          this.directResults.delete(downloadId)
          resolve(ok)
        }
      })
    })
  }

  /** 局域网直连：等待接收方报告直连下载结果 */
  private waitDirectDone(downloadId: string, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.directDones.delete(downloadId)
        resolve(false)
      }, timeoutMs)
      this.directDones.set(downloadId, {
        timer,
        resolve: (ok) => {
          clearTimeout(timer)
          this.directDones.delete(downloadId)
          resolve(ok)
        }
      })
    })
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
        to,
      })
      this.send(type, payload, { id, to })
    })
  }

  private emit(): void {
    this.onStatusChange(this.getStatus())
  }
}
