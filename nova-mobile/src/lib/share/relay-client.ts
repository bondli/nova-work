/**
 * 文件共享中继客户端（手机端）。
 *
 * - 启动时从 POS /auth/share-token/mobile 换取 groupToken + relayUrl，连入 nova-relay
 * - 自动重连（指数退避）+ ping 心跳
 * - 处理远程 RPC：share:list（列文件）、share:download-start（分片下发）
 * - 主动调用：listRemote / downloadRemote
 *
 * 与桌面端协议完全一致，差异仅在运行时（RN 全局 WebSocket / expo-file-system）。
 * 大文件同样使用「窗口 + 逐片 ACK」流控，接收方边收边写盘，避免整文件驻留内存。
 */
import { randomUUID } from 'expo-crypto'

import { apiPost } from '@/src/lib/api'
import { getDeviceId, getDeviceName } from './device'
import {
  appendShareChunk,
  createShareDownloadFile,
  listLocalShareFiles,
  readShareFileBase64,
  removeShareFile,
  startDirectDownload,
} from './files'

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

/** 手机端发送分片按 base64 字符切片，必须保证切片长度是 4 的倍数，否则每片解码都会损坏；
 *  取 255KB（261120 字节，能被 3 整除）→ base64 长度 348160；中继带宽有限，分片不宜过大 */
const SEND_CHUNK_BYTES = 255 * 1024
const CHUNK_SIZE_B64 = (SEND_CHUNK_BYTES / 3) * 4
const MAX_FILE_SIZE = 300 * 1024 * 1024
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]
const PING_INTERVAL_MS = 25000
const RPC_TIMEOUT_MS = 30000
/** 滑动窗口：在途最多 4 片（约 1.4MB）；链路慢时也不会把中继/心跳缓冲打满 */
const SEND_WINDOW_CHUNKS = 4
const WINDOW_ACK_TIMEOUT_MS = 60000
/** 首片 ACK 超时：超过就认为对端不支持 ACK（旧版本），降级为无流控直发 */
const FIRST_ACK_TIMEOUT_MS = 15000
/** 接收方空闲超时：连续这么久没收到分片才判定失败 */
const DOWNLOAD_IDLE_TIMEOUT_MS = 60000
/** 发送方读取/准备文件的超时：接收方收到 accept 后放宽到这个时长 */
const DOWNLOAD_PREPARE_TIMEOUT_MS = 180000
/** 局域网直连：单个地址的探测超时 */
const DIRECT_PROBE_TIMEOUT_MS = 2000

/** base64 长度换算为原始字节数（含 padding 误差） */
function base64Bytes(data: string): number {
  return Math.floor((data.length * 3) / 4)
}

type Listener = (status: RelayStatus) => void

/** 下载进度回调：received / total 均为字节 */
export type DownloadProgress = (received: number, total: number) => void

interface DownloadState {
  name: string
  file: ReturnType<typeof createShareDownloadFile>
  /** 发送方设备 ID，取消时用于通知对方停止发送 */
  senderId?: string
  chunks: number
  size: number
  received: number
  total: number | null
  /** 串行写盘链，保证分片按序落盘 */
  writeChain: Promise<void>
  writeError: Error | null
  onProgress?: DownloadProgress
  /** 局域网直连下载任务（可取消） */
  directTask: { cancel: () => void } | null
  /** 重置空闲超时；可指定本次超时时长 */
  resetTimer: (timeoutMs?: number) => void
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
  private listeners = new Set<Listener>()

  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private downloads = new Map<string, DownloadState>()
  /** 发送窗口 ACK 状态（本机作为发送方） */
  private ackState = new Map<string, { received: number; canceled: boolean; flowControl: boolean; notify: (() => void) | null }>()
  /** 尚未开始发送就已取消的下载 ID（发送方读取大文件期间可能收到取消） */
  private cancelledDownloads = new Set<string>()

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
    this.ackState.clear()
    this.cancelledDownloads.clear()
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error('中继已断开'))
    }
    this.pending.clear()
  }

  listRemote(deviceId: string): Promise<ShareFileInfo[]> {
    return this.call<ShareFileInfo[]>('share:list', {}, deviceId)
  }

  async downloadRemote(
    deviceId: string,
    name: string,
    onProgress?: DownloadProgress
  ): Promise<string> {
    const id = randomUUID()
    const file = createShareDownloadFile(name)
    return new Promise<string>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>
      const pend = {
        resolve: (v: unknown) => {
          clearTimeout(timer)
          this.pending.delete(id)
          this.downloads.delete(id)
          resolve(v as string)
        },
        reject: (e: Error) => {
          clearTimeout(timer)
          this.pending.delete(id)
          this.downloads.delete(id)
          removeShareFile(file)
          reject(e)
        },
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
      }
      // 空闲超时：每收到一片都会重置，大文件不会因固定总时长被中断
      const resetTimer = (timeoutMs: number = DOWNLOAD_IDLE_TIMEOUT_MS): void => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          this.downloads.delete(id)
          this.pending.delete(id)
          removeShareFile(file)
          reject(new Error('下载超时（长时间无数据）'))
        }, timeoutMs)
        pend.timer = timer
      }
      resetTimer()
      this.pending.set(id, pend)
      this.downloads.set(id, {
        name,
        file,
        senderId: deviceId,
        chunks: 0,
        size: 0,
        received: 0,
        total: null,
        writeChain: Promise.resolve(),
        writeError: null,
        onProgress,
        directTask: null,
        resetTimer,
      })
      this.send('share:download-start', { name }, { id, to: deviceId })
    })
  }

  /** 取消进行中的下载：删除半成品文件并通知发送方停止推送 */
  cancelDownload(name: string): boolean {
    for (const [id, dl] of this.downloads) {
      if (dl.name !== name) continue
      // 直连任务与分片传输都取消
      dl.directTask?.cancel()
      // 先通知发送方，避免它继续推完剩余分片
      this.send('share:download-cancel', {}, { id, to: dl.senderId })
      const pend = this.pending.get(id)
      if (pend) {
        pend.reject(new Error('已取消下载'))
      } else {
        this.downloads.delete(id)
        removeShareFile(dl.file)
      }
      return true
    }
    return false
  }

  /**
   * 局域网直连下载：逐个探测发送方给出的局域网地址，
   * 能通就用原生下载任务直接拉取；全部不可达或失败时通知发送方回退中继分片。
   */
  private async tryDirectDownload(id: string, dl: DownloadState, urls: string[]): Promise<void> {
    for (const url of urls) {
      if (this.downloads.get(id) !== dl) return
      if (!(await this.probeDirect(url))) continue
      if (this.downloads.get(id) !== dl) return
      try {
        // 先告知发送方走直连，发送方会暂停/跳过中继分片
        this.send('share:download-direct-result', { ok: true }, { id, to: dl.senderId })
        const { task, done } = startDirectDownload(url, dl.file, (received, total) => {
          dl.received = received
          dl.resetTimer(DOWNLOAD_PREPARE_TIMEOUT_MS)
          dl.onProgress?.(received, total > 0 ? total : dl.size)
        })
        dl.directTask = task
        const uri = await done
        dl.directTask = null
        this.send('share:download-direct-done', { ok: true }, { id, to: dl.senderId })
        this.pending.get(id)?.resolve(uri)
        return
      } catch {
        dl.directTask = null
        // 直连中途失败：告知发送方回退，并重置接收状态等待中继分片
        this.send('share:download-direct-done', { ok: false }, { id, to: dl.senderId })
        this.resetDownloadForRelay(dl)
        return
      }
    }
    // 所有局域网地址都不可达：明确回绝，发送方回退中继
    this.send('share:download-direct-result', { ok: false }, { id, to: dl.senderId })
  }

  /** HEAD 探测局域网直连地址是否可达（超时 2s） */
  private async probeDirect(url: string): Promise<boolean> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DIRECT_PROBE_TIMEOUT_MS)
    try {
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal })
      return res.ok
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  /** 直连失败后重置接收状态，改走中继分片 */
  private resetDownloadForRelay(dl: DownloadState): void {
    dl.file = createShareDownloadFile(dl.name)
    dl.chunks = 0
    dl.received = 0
    dl.writeChain = Promise.resolve()
    dl.writeError = null
    dl.resetTimer(DOWNLOAD_PREPARE_TIMEOUT_MS)
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
          const dl = this.downloads.get(id)
          if (dl) removeShareFile(dl.file)
          clearTimeout(pend.timer)
          this.pending.delete(id)
          this.downloads.delete(id)
          pend.reject(new Error(String(msg.payload?.message ?? '中继错误')))
        } else if (!id) {
          // 无 id 的错误才是全局状态；带 id 的多为旧版本对端对未知消息的拒绝，忽略以免污染状态栏
          this.lastError = String(msg.payload?.message ?? '中继错误')
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
        // 尚未进入发送阶段（正在读取大文件），先记下来
        this.cancelledDownloads.add(msg.id)
      }
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

    // 发送方提供局域网直连地址：探测可达后直接 HTTP 下载，失败回落中继分片
    if (msg.type === 'share:download-direct' && msg.id) {
      const dl = this.downloads.get(msg.id)
      if (dl) {
        if (msg.payload?.size != null) dl.size = Number(msg.payload.size)
        dl.resetTimer(DOWNLOAD_PREPARE_TIMEOUT_MS)
        const urls = Array.isArray(msg.payload?.urls) ? msg.payload.urls.map(String) : []
        void this.tryDirectDownload(msg.id, dl, urls)
      }
      return
    }

    // 下载分片（本机作为接收方）：边收边写盘，写完后回执 ACK
    if (msg.type === 'share:chunk' && msg.id) {
      const id = msg.id
      const dl = this.downloads.get(id)
      if (dl) {
        const index = Number(msg.payload?.index)
        const data = String(msg.payload?.data ?? '')
        if (msg.payload?.total != null) dl.total = Number(msg.payload.total)
        if (msg.payload?.size != null) dl.size = Number(msg.payload.size)
        dl.resetTimer()
        const senderId = msg.sender?.deviceId
        // 链式写盘：消息处理是并发进入的，用 Promise 链保证分片顺序
        dl.writeChain = dl.writeChain.then(async () => {
          if (this.downloads.get(id) !== dl || dl.writeError) return
          try {
            await appendShareChunk(dl.file, data, dl.chunks === 0)
            dl.chunks += 1
            dl.received += base64Bytes(data)
            this.send('share:chunk-ack', { index, received: dl.chunks }, { id, to: senderId })
            dl.onProgress?.(dl.received, dl.size || dl.received)
          } catch (e) {
            dl.writeError = e instanceof Error ? e : new Error('写入文件失败')
            const pend = this.pending.get(id)
            if (pend) pend.reject(dl.writeError)
          }
        })
        return
      }
    }
    if (msg.type === 'share:download-end' && msg.id) {
      const id = msg.id
      const dl = this.downloads.get(id)
      const pend = this.pending.get(id)
      if (dl && pend) {
        // 等待写盘链完成，避免最后几片还没落盘就返回
        await dl.writeChain
        if (this.downloads.get(id) !== dl) return
        if (dl.writeError) {
          pend.reject(dl.writeError)
          return
        }
        const total = dl.total ?? dl.chunks
        if (dl.chunks < total) {
          pend.reject(new Error(`缺失分片（${dl.chunks}/${total}）`))
          return
        }
        dl.onProgress?.(dl.size || dl.received, dl.size || dl.received)
        pend.resolve(dl.file.uri)
      }
      return
    }

    // RPC 响应（带 id 且是我们发起的）。
    // 排除所有下载控制帧，避免把控制帧 payload 误当文件内容 resolve 出去。
    const isDownloadControl =
      msg.type === 'share:chunk' ||
      msg.type === 'share:chunk-ack' ||
      msg.type.startsWith('share:download-')
    if (msg.id && this.pending.has(msg.id) && !isDownloadControl) {
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
          const downloadId = msg.id
          const target = msg.sender?.deviceId
          // 先告诉对方「已收到、正在准备」，避免手机读取大文件期间被误判超时
          this.send('share:download-accept', { name }, { id: downloadId, to: target })
          const { base64, size } = await readShareFileBase64(name)
          if (downloadId && this.cancelledDownloads.delete(downloadId)) {
            throw new Error('对方已取消下载')
          }
          if (size > MAX_FILE_SIZE) throw new Error(`文件超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 上限`)
          const total = Math.ceil(size / SEND_CHUNK_BYTES) || 1
          if (downloadId) this.ackState.set(downloadId, { received: 0, canceled: false, flowControl: true, notify: null })
          try {
            const state = downloadId ? this.ackState.get(downloadId) : undefined
            let sent = 0
            const sendChunk = (index: number): void => {
              const slice = base64.slice(index * CHUNK_SIZE_B64, (index + 1) * CHUNK_SIZE_B64)
              this.send('share:chunk', { name, index, total, size, data: slice }, { id: downloadId, to: target })
            }
            // 滑动窗口：在途片数低于窗口就继续发，收到 ACK 即补发
            while (sent < total) {
              if (state?.canceled) throw new Error('对方已取消下载')
              if (state && !state.flowControl) {
                // 对端不支持 ACK（旧版本）：退化为连续直发
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
                if (state && state.received === 0) {
                  state.flowControl = false
                  continue
                }
                throw e
              }
            }
            if (downloadId && state && state.flowControl) {
              while (state.received < total) {
                if (state.canceled) throw new Error('对方已取消下载')
                await this.waitForProgress(downloadId)
              }
            }
            this.send('share:download-end', { name, size }, { id: downloadId, to: target })
          } finally {
            if (downloadId) {
              this.ackState.delete(downloadId)
              this.cancelledDownloads.delete(downloadId)
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
