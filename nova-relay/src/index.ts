/**
 * Nova 中继服务（群组版）
 *
 * 职责：
 * 1. 群组鉴权：设备携带 POS 签发的 groupToken 连接，relay 校验后归入对应门店群组
 * 2. 设备发现：同组设备互相可见，上下线实时通知
 * 3. 消息路由：组内任意设备可向任意设备发消息（to 指定单播，否则广播）
 * 4. 文件分片透传：不解析业务内容、不落地，仅内存转发
 *
 * 消息信封（JSON）：
 *   { type, id?, timestamp, payload?, to?, sender?:{deviceId,name,role} }
 *
 * 环境变量：
 *   PORT   监听端口（默认 8722）
 */
import http from 'node:http'
import { createHmac } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import express, { Request, Response } from 'express'
import { WebSocketServer, WebSocket } from 'ws'

const PORT = Number(process.env.PORT ?? 8722)
const HEARTBEAT_MS = 30_000

type Role = 'desktop' | 'phone'

interface Connection {
  ws: WebSocket
  role: Role
  deviceId: string
  name: string
  group: string
  isAlive: boolean
}

/** 群组注册表：groupKey → Map<deviceId, Connection> */
const groups = new Map<string, Map<string, Connection>>()

// ===== groupSecret 读取（与 POS 共用 ~/.nova/server-config.json 的 relay.groupSecret）=====

function loadGroupSecret(): string {
  const configPath = join(homedir(), '.nova', 'server-config.json')
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '')
      const parsed = JSON.parse(raw) as {
        relay?: { groupSecret?: string }
      }
      return parsed.relay?.groupSecret ?? ''
    }
  } catch {
    /* 配置缺失或损坏，稍后连接时会拒绝 */
  }
  return ''
}

let groupSecret = loadGroupSecret()

/** groupToken 格式：storeKey:hmacSignature */
function verifyGroupToken(token: string): string | null {
  if (!groupSecret) return null
  const idx = token.lastIndexOf(':')
  if (idx <= 0) return null
  const storeKey = token.slice(0, idx)
  const signature = token.slice(idx + 1)
  const expected = createHmac('sha256', groupSecret).update(storeKey).digest('hex')
  if (signature !== expected) return null
  return storeKey
}

// ===== HTTP 服务 =====

const app = express()
app.use(express.json({ limit: '64kb' }))

app.get('/health', (_req: Request, res: Response) => {
  let total = 0
  let desktops = 0
  let phones = 0
  const groupCount = groups.size
  for (const group of groups.values()) {
    for (const conn of group.values()) {
      total++
      if (conn.role === 'desktop') desktops++
      else phones++
    }
  }
  res.json({ ok: true, ts: Math.floor(Date.now() / 1000), groups: groupCount, connections: { total, desktops, phones } })
})

const server = http.createServer(app)
// 文件分片单帧 ≤ 256KB，4MB 上限足够
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 * 1024 })

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

function send(ws: WebSocket, type: string, payload: Record<string, JsonValue> = {}, extra: Record<string, JsonValue> = {}): void {
  if (ws.readyState !== ws.OPEN) return
  ws.send(JSON.stringify({ type, timestamp: nowSec(), payload, ...extra }))
}

function sendError(ws: WebSocket, message: string, refId?: string | number): void {
  send(ws, 'relay:error', { message }, refId !== undefined ? { id: refId as unknown as JsonValue } : {})
}

// ===== WebSocket 接入 =====

wss.on('connection', (ws: WebSocket, req) => {
  let params: URLSearchParams
  try {
    params = new URL(req.url ?? '/', 'http://localhost').searchParams
  } catch {
    sendError(ws, 'URL 无效'); ws.close(4001); return
  }

  const role = params.get('role') as Role | null
  const deviceId = (params.get('deviceId') ?? '').trim()
  const deviceName = (params.get('name') ?? '').trim().slice(0, 64) || deviceId
  const groupToken = (params.get('groupToken') ?? '').trim()

  if (!['desktop', 'phone'].includes(role ?? '') || !deviceId || deviceId.length > 64) {
    sendError(ws, 'role 必须为 desktop/phone，且 deviceId 必填')
    ws.close(4002)
    return
  }

  // 群组鉴权
  const groupKey = verifyGroupToken(groupToken)
  if (!groupKey) {
    sendError(ws, 'groupToken 无效或 relay.groupSecret 未配置')
    ws.close(4003)
    return
  }

  // 同设备重复连接：踢掉旧连接
  let group = groups.get(groupKey)
  if (!group) {
    group = new Map()
    groups.set(groupKey, group)
  }
  const old = group.get(deviceId)
  if (old) {
    try { old.ws.close(4000, 'duplicate connection') } catch { /* ignore */ }
  }

  const conn: Connection = { ws, role: role!, deviceId, name: deviceName, group: groupKey, isAlive: true }
  group.set(deviceId, conn)

  ws.on('pong', () => { conn.isAlive = true })

  handleConnect(conn)

  ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      sendError(ws, '消息不是合法 JSON')
      return
    }
    if (typeof msg?.type !== 'string') {
      sendError(ws, '消息缺少 type')
      return
    }
    handleMessage(conn, msg)
  })

  ws.on('close', () => handleDisconnect(conn))
  ws.on('error', () => { /* close 会兜底 */ })
})

function handleConnect(conn: Connection): void {
  const group = groups.get(conn.group)
  if (!group) return

  // 同组在线设备列表（排除自己）
  const peers: JsonValue[] = []
  for (const other of group.values()) {
    if (other.deviceId === conn.deviceId) continue
    peers.push({ deviceId: other.deviceId, name: other.name, role: other.role })
  }
  send(conn.ws, 'relay:hello', {
    role: conn.role,
    deviceId: conn.deviceId,
    name: conn.name,
    group: conn.group,
    peers,
  })

  // 通知同组其他设备：有新设备上线
  for (const other of group.values()) {
    if (other.deviceId === conn.deviceId) continue
    send(other.ws, 'relay:peer-online', {
      deviceId: conn.deviceId,
      name: conn.name,
      role: conn.role,
    })
  }
}

function handleDisconnect(conn: Connection): void {
  const group = groups.get(conn.group)
  if (!group) return
  if (group.get(conn.deviceId)?.ws !== conn.ws) return
  group.delete(conn.deviceId)
  if (group.size === 0) groups.delete(conn.group)

  // 通知同组其他设备：该设备离线
  for (const other of group.values()) {
    send(other.ws, 'relay:peer-offline', {
      deviceId: conn.deviceId,
      role: conn.role,
    })
  }
}

interface IncomingMsg {
  type: string
  id?: string | number
  timestamp?: number
  to?: string
  payload?: unknown
  [k: string]: unknown
}

function handleMessage(conn: Connection, rawMsg: Record<string, unknown>): void {
  const msg = rawMsg as IncomingMsg
  const type = msg.type

  // 系统消息
  if (type === 'relay:ping') {
    send(conn.ws, 'relay:pong', {}, msg.id !== undefined ? { id: msg.id as unknown as JsonValue } : {})
    return
  }
  if (type.startsWith('relay:')) {
    sendError(conn.ws, `未知系统消息: ${type}`, msg.id)
    return
  }

  // 业务消息：路由到同组目标设备
  const group = groups.get(conn.group)
  if (!group) {
    sendError(conn.ws, '群组不存在', msg.id)
    return
  }

  const envelope = (): Record<string, unknown> => ({
    ...msg,
    sender: { deviceId: conn.deviceId, name: conn.name, role: conn.role },
    timestamp: msg.timestamp ?? nowSec(),
  })

  const targetId = String(msg.to ?? '')
  if (targetId) {
    // 单播
    const target = group.get(targetId)
    if (!target) {
      if (msg.id !== undefined) sendError(conn.ws, '目标设备离线', msg.id)
      return
    }
    target.ws.send(JSON.stringify(envelope()))
  } else {
    // 广播给同组其他设备
    let delivered = 0
    for (const other of group.values()) {
      if (other.deviceId === conn.deviceId) continue
      other.ws.send(JSON.stringify(envelope()))
      delivered++
    }
    if (delivered === 0 && msg.id !== undefined) {
      sendError(conn.ws, '组内没有其他在线设备', msg.id)
    }
  }
}

// ===== 心跳：30s ping，两次无 pong 判定断线 =====

const heartbeatTimer = setInterval(() => {
  for (const group of groups.values()) {
    for (const conn of group.values()) {
      if (!conn.isAlive) {
        try { conn.ws.terminate() } catch { /* ignore */ }
        continue
      }
      conn.isAlive = false
      try { conn.ws.ping() } catch { /* ignore */ }
    }
  }
}, HEARTBEAT_MS)
heartbeatTimer.unref?.()

server.listen(PORT, () => {
  console.log(`[nova-relay] listening on http://0.0.0.0:${PORT} (WS path: /ws)`)
  console.log(`[nova-relay] groupSecret configured: ${groupSecret ? 'yes' : 'NO (will reject all connections)'}`)
})

// 优雅退出：PM2 默认发 SIGTERM，先关 HTTP 再断所有 WS 连接，避免端口残留
function shutdown(): void {
  console.log('[nova-relay] shutting down...')
  wss.close()
  for (const group of groups.values()) {
    for (const conn of group.values()) {
      try { conn.ws.close() } catch { /* ignore */ }
    }
  }
  server.close(() => process.exit(0))
  // 兜底：8 秒后强制退出
  setTimeout(() => process.exit(0), 8000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
