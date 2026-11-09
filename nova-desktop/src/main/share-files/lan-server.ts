/**
 * 局域网文件直传服务（桌面端）。
 *
 * 当手机与桌面在同一局域网时，中继链路（公网服务器）往往是瓶颈。
 * 这里在桌面端临时起一个只读 HTTP 服务，把共享目录里的文件直接暴露给同网设备：
 * - 端口随机（listen 0），只在本次运行内有效，空闲 5 分钟自动关闭
 * - 路径带一次性随机 token，非本机共享目录 / 非 token 的请求一律 404
 * - 仅支持 GET / HEAD，不支持目录列举
 *
 * 手机端先做 HEAD 探测：能通才走直连，否则回落原有中继分片传输。
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { basename, join } from 'node:path'
import { SHARE_DIR } from './service'

/** 无请求 5 分钟后自动关停，避免长期占用端口 */
const IDLE_SHUTDOWN_MS = 5 * 60_000

class LanShareServer {
  private server: Server | null = null
  private port = 0
  private token = randomUUID()
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  /** 为一次下载准备直连地址；返回空数组表示当前无法提供直连 */
  async offer(name: string): Promise<string[]> {
    if (!(await this.ensureStarted())) return []
    this.touch()
    const safeName = basename(name)
    const addresses = this.lanAddresses()
    return addresses.map(
      (ip) => `http://${ip}:${this.port}/f/${this.token}/${encodeURIComponent(safeName)}`
    )
  }

  /** 服务就绪后重置空闲计时 */
  touch(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.stop(), IDLE_SHUTDOWN_MS)
    this.idleTimer.unref?.()
  }

  stop(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    // 每次关停后换新 token，避免旧地址长期可用
    this.token = randomUUID()
    this.server?.close()
    this.server = null
    this.port = 0
  }

  private async ensureStarted(): Promise<boolean> {
    if (this.server) return true
    return new Promise<boolean>((resolve) => {
      const server = createServer((req, res) => void this.handle(req, res))
      server.on('error', () => resolve(false))
      server.listen(0, '0.0.0.0', () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          server.close()
          resolve(false)
          return
        }
        this.server = server
        this.port = address.port
        resolve(true)
      })
    })
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.touch()
    const url = new URL(req.url ?? '/', 'http://localhost')
    // 期望路径：/f/<token>/<filename>
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 3 || parts[0] !== 'f' || parts[1] !== this.token) {
      res.writeHead(404)
      res.end()
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    const fileName = basename(decodeURIComponent(parts[2] ?? ''))
    if (!fileName) {
      res.writeHead(404)
      res.end()
      return
    }
    const filePath = join(SHARE_DIR, fileName)
    try {
      const info = await stat(filePath)
      if (!info.isFile()) throw new Error('not a file')
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': info.size,
        // 直连下载不做缓存，避免同名文件更新后拿到旧内容
        'Cache-Control': 'no-store'
      })
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      createReadStream(filePath)
        .on('error', () => {
          try { res.destroy() } catch { /* ignore */ }
        })
        .pipe(res)
    } catch {
      res.writeHead(404)
      res.end()
    }
  }

  /** 本机所有非回环 IPv4 地址（可能包含多个网卡，手机端会逐个探测） */
  private lanAddresses(): string[] {
    const list: string[] = []
    for (const infos of Object.values(networkInterfaces())) {
      for (const info of infos ?? []) {
        if (info.family === 'IPv4' && !info.internal) list.push(info.address)
      }
    }
    return list
  }
}

export const lanShareServer = new LanShareServer()
