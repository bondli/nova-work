/**
 * E2E 公共工具：临时数据目录、Electron 启动、登录、截图与假模型服务。
 * 每个用例使用独立的 NOVA_HOME，与开发环境、已安装的正式包完全隔离。
 */
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { createRequire } from 'node:module'
import { createServer, type ServerResponse } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const ELECTRON_EXECUTABLE = require('electron') as string

const REPO_ROOT = resolve(process.cwd())
export const SCREENSHOT_DIR = resolve(REPO_ROOT, '../docs/screenshots/d6')
const PERF_FILE = resolve(REPO_ROOT, 'test-results/d6-perf.json')

export const ADMIN = { username: 'admin', password: 'admin' }

/** 真实环境的服务端配置，E2E 从中复制 POS 地址与内部令牌 */
const REAL_SERVER_CONFIG = join(homedir(), '.nova', 'server-config.json')

/**
 * 写入临时 home 的 server-config.json。
 * 桌面端主进程与 nova-pos-server 共用该文件，E2E 必须与服务端令牌一致，
 * 否则 /auth/token 换取 JWT 会返回 401。可用 NOVA_E2E_POS_BASE_URL / NOVA_E2E_POS_TOKEN 覆盖。
 */
function writeServerConfig(home: string): void {
  const baseUrl = process.env['NOVA_E2E_POS_BASE_URL'] ?? 'http://127.0.0.1:9577'
  let token = process.env['NOVA_E2E_POS_TOKEN'] ?? ''

  if (!token) {
    try {
      const real = JSON.parse(readFileSync(REAL_SERVER_CONFIG, 'utf8')) as {
        auth?: { internalToken?: string }
        token?: string
      }
      token = real.auth?.internalToken ?? real.token ?? ''
    } catch {
      token = ''
    }
  }

  if (!token) {
    throw new Error(
      `E2E 缺少 POS 内部令牌：请先启动 nova-pos-server（会生成 ${REAL_SERVER_CONFIG}），或设置 NOVA_E2E_POS_TOKEN`
    )
  }

  writeFileSync(
    join(home, 'server-config.json'),
    JSON.stringify(
      {
        baseUrl,
        auth: { internalToken: token },
        database: {
          host: '127.0.0.1',
          port: 3306,
          user: 'readonly',
          password: '',
          database: 'store_pos'
        },
        storage: { uploadDir: '~/.nova/storage/inventory-image', logDir: '~/.nova/logs' }
      },
      null,
      2
    )
  )
}

/** E2E 临时数据根目录；settings 里把任务时间放到 23:59，避免调度器误触发 */
export function createHome(prefix: string): { home: string; settingsPath: string } {
  const home = mkdtempSync(join(tmpdir(), `nova-e2e-${prefix}-`))
  const settingsPath = join(home, 'settings.json')

  writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        appearance: { theme: 'light', fontSize: 'medium' },
        launch: { autoLaunch: false },
        task: { daily: '23:59', weekly: '23:59', monthly: '23:59' },
        notification: { desktop: false, sound: 'silent' }
      },
      null,
      2
    )
  )

  writeServerConfig(home)

  return { home, settingsPath }
}

export function removeHome(home: string): void {
  rmSync(home, { recursive: true, force: true })
}

/** 写入 Agent 配置，模型指向本地假服务；数据库配置不会被实际连接 */
export function writeAgentConfig(home: string, modelUrl: string): void {
  writeFileSync(
    join(home, 'agent-config.json'),
    JSON.stringify(
      {
        model: { baseUrl: modelUrl, apiKey: 'e2e-key', model: 'deepseek-flash' },
        database: {
          host: '127.0.0.1',
          port: 3306,
          user: 'readonly',
          password: '',
          database: 'store_pos'
        }
      },
      null,
      2
    )
  )
}

/**
 * 删除 E2E 注册产生的账号，避免污染 POS 用户表。
 * 账号现在落在 POS 的 User 表，没有删除接口，测试收尾直接连库清理。
 */
export async function removeTestUser(username: string): Promise<void> {
  try {
    const real = JSON.parse(readFileSync(REAL_SERVER_CONFIG, 'utf8')) as {
      database?: Record<string, unknown>
    }
    if (!real.database) return

    const mysql = require(resolve(REPO_ROOT, '../nova-pos-server/node_modules/mysql2/promise')) as {
      createConnection: (config: Record<string, unknown>) => Promise<{
        query: (sql: string, params?: unknown[]) => Promise<unknown>
        end: () => Promise<void>
      }>
    }
    const connection = await mysql.createConnection(real.database)
    await connection.query('DELETE FROM `User` WHERE `name` = ?', [username])
    await connection.end()
  } catch {
    // 清理失败不影响用例结论
  }
}

/** 预置一条未读通知，用于红点与跳转已读用例 */
export function seedNotification(home: string, taskId = 'daily'): void {
  writeFileSync(
    join(home, 'notifications.json'),
    JSON.stringify(
      [
        {
          id: 'e2e-notification-1',
          title: '店铺经营日报已生成',
          description: '10 月 26 日经营日报已生成，点击查看',
          taskId,
          createdAt: new Date().toISOString(),
          unread: true
        }
      ],
      null,
      2
    )
  )
}

/** 启动生产构建的 Electron 应用（依赖 npm run build 产物） */
export async function launchApp(home: string): Promise<ElectronApplication> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (key === 'ELECTRON_RENDERER_URL' || key === 'ELECTRON_RUN_AS_NODE') continue
    env[key] = value
  }
  env['NOVA_HOME'] = home
  env['NOVA_E2E'] = '1'

  return electron.launch({
    executablePath: ELECTRON_EXECUTABLE,
    args: [REPO_ROOT],
    cwd: REPO_ROOT,
    env
  })
}

export async function openWindow(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return page
}

export async function login(page: Page): Promise<void> {
  await page.getByPlaceholder('请输入用户名').fill(ADMIN.username)
  await page.getByPlaceholder('请输入密码').fill(ADMIN.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '经营分析' })).toBeVisible()
}

/** 调整窗口内容尺寸，用于双尺寸视觉回归 */
export async function resizeWindow(
  app: ElectronApplication,
  width: number,
  height: number
): Promise<void> {
  await app.evaluate(({ BrowserWindow }, size) => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window) window.setContentSize(size.width, size.height)
  }, { width, height })
}

export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${name}.png`),
    animations: 'disabled'
  })
}

/** 性能数据汇总到 test-results，验收报告引用 */
export function writePerf(data: Record<string, number>): void {
  mkdirSync(join(REPO_ROOT, 'test-results'), { recursive: true })
  writeFileSync(PERF_FILE, JSON.stringify(data, null, 2))
}

interface FakeModel {
  url: string
  close: () => Promise<void>
}

/**
 * 本地假 DeepSeek 服务：
 * 第 1 轮调用 write_file 生成 report.md，第 2 轮 publish_artifact 发布，
 * 第 3 轮输出最终文本。覆盖流式增量、工具循环与产物事件。
 */
export async function startFakeModel(): Promise<FakeModel> {
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
      response.writeHead(404).end()
      return
    }

    let raw = ''
    request.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8')
    })
    request.on('end', () => {
      const toolRounds = countToolRounds(raw)

      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      })

      if (toolRounds === 0) {
        writeContent(response, '正在生成报告。')
        writeToolCall(response, 'write', {
          path: 'report.md',
          content: '# E2E 报告\n\n这是自动化测试生成的内容。'
        })
      } else if (toolRounds === 1) {
        writeToolCall(response, 'publish_artifact', {
          path: 'report.md',
          title: 'E2E 报告',
          kind: 'md'
        })
      } else {
        writeContent(response, '报告已生成，可在右侧产物面板查看。')
      }

      response.write(
        `data: ${JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } })}\n\n`
      )
      response.write('data: [DONE]\n\n')
      response.end()
    })
  })

  await new Promise<void>((resolveListen) => {
    server.listen(0, '127.0.0.1', resolveListen)
  })

  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('假模型服务启动失败')

  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose()))
  }
}

/** 统计上下文里已完成几轮工具调用 */
function countToolRounds(raw: string): number {
  try {
    const body = JSON.parse(raw) as {
      messages?: Array<{ role?: string; tool_calls?: unknown[] }>
    }
    return (body.messages ?? []).filter(
      (message) =>
        message.role === 'assistant' &&
        Array.isArray(message.tool_calls) &&
        message.tool_calls.length > 0
    ).length
  } catch {
    return 0
  }
}

function writeContent(response: ServerResponse, content: string): void {
  response.write(
    `data: ${JSON.stringify({
      choices: [{ delta: { content }, finish_reason: null }]
    })}\n\n`
  )
  response.write(
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`
  )
}

function writeToolCall(response: ServerResponse, name: string, args: unknown): void {
  response.write(
    `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: `call_${name}`,
                type: 'function',
                function: { name, arguments: JSON.stringify(args) }
              }
            ]
          },
          finish_reason: null
        }
      ]
    })}\n\n`
  )
  response.write(
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })}\n\n`
  )
}
