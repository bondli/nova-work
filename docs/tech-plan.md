# Nova 技术方案

> 版本：v1.1　评审稿  
> 日期：2026-10-23  
> 适用范围：`nova-work`（六个独立工程，非 monorepo）  
> 对外产品名 / 包名：**DaveBella**　内部代号：**Nova**

---

## 1. 架构总览

```
┌───────────────────────────────────────────────────────────────────┐
│                          DaveBella 桌面端                           │
│  Electron Main（Node）              Renderer（React 19 + shadcn）    │
│  ┌──────────────────────────┐      ┌───────────────────────────┐  │
│  │ Agent Runtime            │ IPC  │ 经营分析 / 买单 / 订单 / 库存 │  │
│  │  pi-agent-core + pi-ai   │◄────►│ 会员 / 营销 / 数据 / 设置   │  │
│  │  DeepSeek Provider       │      │ 产物抽屉 / 对话流            │  │
│  │  Retail Tools            │      └───────────────────────────┘  │
│  │  SQLite 会话库 + MySQL(只读) │                                      │
│  │  ~/.nova/workspaces/     │                                      │
│  └────────────┬─────────────┘                                      │
└───────────────┼────────────────────────────────────────────────────┘
                │ HTTPS (JWT, 单店)
                ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│  nova-pos-server (Express+Sequelize) │   │  nova-mall-server (Express+Sequelize) │
│  订单/库存/会员/营销/数据/上传      │   │  会员登录/订单/积分/余额/券/活动   │
└───────────────┬───────────────┘   └───────────────┬───────────────┘
                │                                   │
                └──────────────┬────────────────────┘
                               ▼
                        MySQL 8 (utf8mb4)
                               ▲
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   手机端 Expo           浏览器插件 MV3          微信小程序 Taro
   订单/库存/买单/会员    右键采图 + 款号核对        订单/积分/余额/券
   数据
```

设计要点：

1. **桌面端主进程是唯一可信执行层**：Agent、文件、SQLite、密钥、网络代理都在主进程；渲染进程只通过 preload 暴露的白名单 IPC 交互。
2. **业务与 Agent 数据访问**：桌面/插件/手机端的业务逻辑全部调用 nova-pos-server 接口；Agent 相关调用全部走桌面主进程 IPC，由主进程用**只读账号直连 MySQL** 执行业务查询（仅 `SELECT`，内置工具优先，工具不覆盖时生成只读 SQL），经营分析因此可直接基于真实订单/库存/会员数据完成。
3. **每会话独立工作目录**：`~/.nova/workspaces/<session-id>/`，Agent 的文件工具与 bash 都被限制在该目录。
4. **服务端平迁优先**：保留现有 Sequelize 模型与路由形态，逐步统一响应、鉴权、错误码；只删除 AI 分析能力。
5. **六个独立工程**：对齐 `nexa-work`，每个目录独立 `package.json`、独立依赖、独立构建，不使用 npm workspaces。

---

## 2. 技术选型

### 2.1 总体

| 层 | 选型 | 版本基线 | 说明 |
|---|---|---|---|
| 工程组织 | 六个独立 npm 工程（对齐 nexa-work） | npm ≥ 10，Node ≥ 20 | 不用 workspaces / pnpm，每个目录独立 lock 与构建 |
| 语言 | TypeScript | 5.7+ | 全目录 strict |
| 桌面壳 | Electron | 35.1.5 | 与旧仓库一致，成熟稳定 |
| 桌面构建 | electron-vite | 2.3.x | main / preload / renderer 三段构建 |
| 桌面 UI | React + shadcn/ui + Tailwind CSS v4 | React 19 | new-york / neutral；Lucide 图标 |
| 桌面状态 | Zustand + TanStack Query | 5.x / 5.x | 本地 UI 状态 / 服务端缓存 |
| 桌面路由 | React Router | 7.x | HashRouter（兼容 `file://`） |
| 本地存储 | sql.js (WASM) + electron-store | 1.14 / 8.x | 会话与产物索引 / 轻量偏好（不缓存业务数据） |
| DB 直连 | mysql2（只读账号） | 3.x | Agent 工具与只读 SQL 查询 MySQL |
| Agent | `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai` | 0.74.x | 与 nexa-work 同版本 |
| 模型 | DeepSeek | 官方 API | 唯一 provider |
| 手机端 | Expo + React Native + expo-router | Expo 57 / RN 0.86 / React 19 | 仅 Android 交付，保留 iOS/鸿蒙扩展性 |
| 手机 UI | 自建组件 + Tailwind（NativeWind）或 StyleSheet | - | 以设计规范为准，不引入重型 UI 库 |
| 手机状态 | Zustand + TanStack Query | - | 与服务端缓存 |
| 插件 | Chrome MV3 + React + Vite/esbuild | Chrome ≥ 110 | contextMenus + content overlay |
| 小程序 | Taro + React + NutUI | Taro 4.1.8 | 沿用旧实现 |
| 服务端 | Express + Sequelize + MySQL2 | Express 4.21 / Sequelize 6 | 平迁并优化 |
| 日志 | pino（服务端）/ electron-log（桌面） | - | 结构化 + traceId |
| 测试 | Vitest + Playwright + React Native Testing Library | - | 纯逻辑 / 渲染 / 组件 |
| 打包 | electron-builder / Gradle / zip | - | 产物统一 DaveBella |

### 2.2 明确不使用

- pnpm / yarn / turborepo。
- 多模型路由、OpenAI / Anthropic / 本地模型（首版仅 DeepSeek）。
- 手机端直连 MySQL、任何原生 MySQL 模块（只读直连仅限桌面主进程的 Agent）。
- 独立 Web 管理端（桌面端即唯一管理端）。
- Ant Design（桌面端统一 shadcn/ui；旧 Web 的 antd 页面按新规范重写）。

---

## 3. 工程结构（非 monorepo）

```
nova-work/
├─ docs/
├─ demo/
├─ nova-desktop/                  # Electron 桌面端
├─ nova-extension/                # Chrome MV3 插件
├─ nova-mobile/                   # Expo 手机端（Android）
├─ nova-miniapp/                  # Taro 微信小程序
├─ nova-pos-server/               # POS 服务端
└─ nova-mall-server/              # 小程序服务端（会员商城）
```

工程约定：

- 每个目录是**独立 npm 工程**：自己的 `package.json`、`package-lock.json`、`tsconfig.json`、`node_modules`，各自安装、各自构建。
- 根目录不放 `package.json`，不使用 `workspaces`、`turborepo`、`pnpm`，也不提供根级编排脚本；需要联调时分别启动各工程。
- 目录之间**不使用 `file:` 依赖、不跨目录 import**；避免形成事实上的 monorepo。
- 接口契约以 `nova-pos-server/src/contracts` 为唯一来源：服务端导出 OpenAPI JSON，客户端生成或手写各自 `src/types/api.ts`。
- 纯函数（金额、折扣、积分、订单号）允许在各端少量重复实现，优先保持工程独立。

### 3.1 脚本规范

每个工程必须提供同名脚本，语义一致：

| 工程 | `dev` | `build` | `pack` |
|---|---|---|---|
| nova-desktop | `electron-vite dev` | `electron-vite build` | `electron-builder`（dmg + nsis） |
| nova-mobile | `expo start` | `expo export` + `tsc` 校验 | `expo prebuild` + `gradlew assembleRelease` + 复制 apk |
| nova-extension | `vite build --watch` | `vite build` | 打包 `dist` 为 zip |
| nova-miniapp | `taro build --type weapp --watch` | `taro build --type weapp` | 打包 `dist` 为 zip |
| nova-pos-server | `tsx watch src/index.ts` | `tsc` | -（PM2 / Docker 部署） |
| nova-mall-server | `tsx watch src/index.ts` | `tsc` | -（PM2 / Docker 部署） |

各工程内部目录遵循同一骨架：

```
nova-xxx/
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ src/
├─ release/            # 构建产物（git 忽略）
└─ README.md
```

产物统一放各自 `release/`，命名为：

- `DaveBella-Mac-arm64-<version>.dmg`
- `DaveBella-Windows-<version>-Setup.exe`
- `DaveBella-Android-<version>.apk`
- `DaveBella-Collector-<version>.zip`
- `DaveBella-Miniapp-<version>.zip`

---

## 4. 桌面端架构

### 4.1 进程与目录

```
nova-desktop/
├─ electron.vite.config.ts
├─ components.json                 # shadcn: new-york / neutral / lucide
├─ electron-builder.yml            # productName: DaveBella
├─ assets/icon.icns, icon.ico
└─ src/
   ├─ main/
   │  ├─ index.ts                  # 窗口、IPC 注册、生命周期
   │  ├─ preload.ts                # contextBridge: window.nova
   │  ├─ agent/
   │  │  ├─ runtime.ts             # Agent Loop 封装、事件转发
   │  │  ├─ settings.ts            # ~/.nova/settings.json + safeStorage
   │  │  ├─ prompt.ts              # 系统提示词
   │  │  ├─ tools/
   │  │  │  ├─ index.ts            # 工具注册
   │  │  │  ├─ data-tools.ts       # 经营查询工具
   │  │  │  ├─ fs-tools.ts         # read/write/edit/bash
   │  │  │  └─ artifact-tool.ts    # publish_artifact
   │  │  └─ workspace.ts           # 会话目录、路径沙箱、产物扫描
   │  ├─ db/
   │  │  ├─ database.ts            # sql.js 初始化 + DAO（会话/消息/产物）
   │  │  ├─ mysql.ts              # MySQL 只读连接池 + SELECT 校验
   │  │  └─ schema.ts              # 建表与迁移
   │  ├─ api/
   │  │  ├─ client.ts              # nova-pos-server HTTP 客户端
   │  │  └─ auth.ts                # 登录、token 持久化
   │  ├─ artifact-server.ts        # 本地预览静态服务
   │  ├─ logger.ts
   │  └─ ipc/
   │     ├─ analysis.ts
   │     ├─ settings.ts
   │     └─ system.ts
   ├─ preload/
   │  └─ index.ts                  # 输出 .cjs，暴露 window.nova.*
   └─ renderer/
      ├─ index.html
      └─ src/
         ├─ main.tsx
         ├─ app.tsx               # HashRouter + 布局
         ├─ components/
         │  ├─ ui/                # shadcn 组件
         │  ├─ layout/            # rail / header / page
         │  ├─ analysis/          # 任务列表、消息流、工具卡、产物抽屉
         │  └─ dialogs/           # 设置、日志、改密、退出
         ├─ pages/
         │  ├─ analysis/
         │  ├─ buy/
         │  ├─ orders/
         │  ├─ inventory/
         │  ├─ members/
         │  ├─ marketing/
         │  ├─ data/
         │  └─ settings/
         ├─ stores/               # zustand
         ├─ hooks/
         └─ lib/                  # cn、format、api
```

### 4.2 窗口与安全基线

```ts
new BrowserWindow({
  width: 1440, height: 900, minWidth: 1180, minHeight: 760,
  title: "DaveBella",
  titleBarStyle: "hiddenInset",
  trafficLightPosition: { x: 16, y: 18 },
  webPreferences: {
    preload: join(__dirname, "../preload/index.cjs"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,          // preload 需要 Node API
    webSecurity: true
  }
})
```

- 生产禁用 DevTools 快捷键与外部导航；`setWindowOpenHandler` 一律 `deny`。
- 渲染进程 CSP：`default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'`。
- 产物 HTML 在独立 `<webview>`/iframe 中预览，`sandbox="allow-scripts"`，不暴露 Node。
- 所有 IPC 入参用 zod 校验，禁止把任意路径传给文件接口。

### 4.3 路由与页面状态

```
/                  → redirect /analysis
/analysis          → 经营分析（默认）
/buy               → 买单
/orders            → 订单中心
/inventory         → 库存中心
/members           → 会员中心
/marketing         → 营销中心
/data              → 数据中心
```

- 布局：`AppShell` 固定 78px rail + 56px header + `<Outlet/>`；内容区统一 16px 内边距。rail 顶部为购物袋应用图标，底部为设置入口（齿轮，打开系统设置 Dialog）；header 左侧为固定文字 Logo（`Dave & Bella` + 版本号）与页面标题，右侧为刷新、通知、个人中心；**无门店切换、无同步状态、无全局搜索**。
- 服务端数据：TanStack Query，queryKey 统一 `[domain, ...params]`，默认 `staleTime: 30s`。
- 写操作后精准失效对应 query；买单成功同时失效订单、库存、会员。
- 本地 UI 状态：Zustand（侧栏折叠、产物抽屉、任务输入草稿）。
- 买单挂单：单笔挂单快照存 electron-store（key `buy.hold`，含清单、会员、导购员），仅本机不落库；取单时若当前清单非空需二次确认后覆盖，恢复后清除挂单。手机端同理，存 `expo-secure-store` / AsyncStorage。

### 4.4 数据访问

每个客户端工程各自维护一份轻量 fetch 封装（`src/lib/api-client.ts`），接口契约以 `nova-pos-server/src/contracts` 为准：

```ts
export interface ApiConfig {
  baseUrl: string          // 开发 http://127.0.0.1:9577，生产 https://davebella.top/pos
  token?: string
  clientVersion: string
  clientOS: string
}

async function request<T>(path: string, init: RequestInit & { query?: Record<string, unknown> }): Promise<T>
```

- 自动附加 `Authorization`、`X-Client-Version`、`X-Client-OS`、`X-Request-Id`。
- 401 → 清除 token 并跳转登录；409 → 业务冲突交由页面处理；5xx → Toast + 重试。
- 买单提交附加 `Idempotency-Key`（uuid v7），重试复用同一个 key。

### 4.5 本地 SQLite

使用 `sql.js`（WASM），数据库文件 `~/.nova/nova.db`，启动加载、写后节流 200ms 落盘。只存会话、消息、任务、产物索引与消息通知，不存业务数据（经营数据由 Agent 直连 MySQL 查询）。

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  group_key TEXT NOT NULL,         -- analysis | free | archive
  type TEXT NOT NULL,              -- daily | weekly | monthly | inventory | member | campaign | custom
  status TEXT NOT NULL,            -- idle | running | done | failed | stopped
  schedule_cron TEXT,              -- 定时任务才有的 cron 表达式
  model TEXT NOT NULL,             -- deepseek/<modelId>
  workspace_path TEXT NOT NULL,
  data_range_start TEXT,
  data_range_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,              -- user | assistant | tool | system
  content TEXT NOT NULL,
  thinking TEXT,
  tool_name TEXT,
  tool_call_id TEXT,
  run_id TEXT,
  status TEXT NOT NULL DEFAULT 'done',
  token_usage TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_messages_session ON messages(session_id, created_at);

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_id TEXT,
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT,
  status TEXT NOT NULL,            -- running | success | error
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,              -- 相对 workspace
  title TEXT NOT NULL,
  kind TEXT NOT NULL,              -- html | md | csv | xlsx | image | pdf
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, path)
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,        -- 点击后跳转的任务
  title TEXT NOT NULL,
  body TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX idx_notifications_unread ON notifications(read_at, created_at);
```

- 本地 SQLite 只存会话、消息、任务、产物索引与设置，**不缓存业务数据**：订单、库存、会员等经营数据由 Agent 通过只读 SQL 直连 MySQL 实时查询（见 4.7.5）。

### 4.6 会话工作目录

创建会话时同步创建：

```
~/.nova/workspaces/<session-id>/
```

规则：

- 目录名使用 session id（UUID），不拼接用户输入，避免路径注入。
- 所有文件工具（read/write/edit/bash）cwd 固定为该目录；`assertInWorkspace` 校验真实路径（`realpath`）仍在目录内，符号链接越界一律拒绝。
- `bash` 默认超时 120s，`AbortSignal` 取消时 `kill` 进程组；禁止 `sudo`、交互式命令；环境变量白名单。
- 会话删除时目录移入 `~/.nova/workspaces/.trash/<session-id>-<timestamp>/`，30 天后清理。
- 磁盘占用：单会话超过 500MB 提示清理；全局超过 5GB 阻止新任务并引导清理。
- 设置页可「在 Finder 中显示工作目录」。

### 4.7 Agent Runtime

#### 4.7.1 生命周期

```
renderer: createSession(type, dataRange)
  → main: insert sessions + mkdir workspace
  → renderer: sendMessage(sessionId, text)
  → main: buildContext() → runAgentLoop(model, systemPrompt, messages, tools)
  → main: AgentEvent 流式推送 → renderer
  → main: 持久化消息/工具调用/产物
  → main: run.end
```

- 每会话内存态：`messages: AgentMessage[]`、`AbortController`、`status`。
- 重启后从 SQLite 重建上下文（仅 user/assistant 文本 + 工具结果摘要）。
- 同一会话同一时刻只允许一个 run；运行中发送消息返回 409，前端提供「停止并发送」。
- `stop` 调用 `abortController.abort()`，标记当前 assistant 消息 `stopped`。

#### 4.7.2 模型解析

```ts
// 仅 DeepSeek
const modelStr = settings.defaultModel // "deepseek/deepseek-v4-flash"
const model = resolveModel(modelStr)
const apiKey = getApiKey("deepseek")
```

- 模型列表通过 pi-ai 的 DeepSeek provider 动态读取，设置页不硬编码 model id。
- 自定义 Base URL 通过 `{ ...model, baseUrl }` 覆盖。
- 未配置 Key：任务创建后立即提示，引导打开系统设置；不进入运行态。

#### 4.7.3 事件协议

主进程 → 渲染进程统一事件 `analysis:event`：

```ts
type AnalysisEvent =
  | { type: "run.start"; sessionId: string; runId: string }
  | { type: "message.start"; sessionId: string; messageId: string; role: "assistant" }
  | { type: "message.delta"; sessionId: string; messageId: string; delta: string }
  | { type: "thinking.delta"; sessionId: string; messageId: string; delta: string }
  | { type: "tool.start"; sessionId: string; toolCallId: string; name: string; input: unknown }
  | { type: "tool.end"; sessionId: string; toolCallId: string; status: "success" | "error"; summary: string; durationMs: number }
  | { type: "message.done"; sessionId: string; messageId: string; content: string; usage?: TokenUsage }
  | { type: "artifact.created"; sessionId: string; artifact: ArtifactMeta }
  | { type: "run.end"; sessionId: string; status: "done" | "failed" | "stopped"; error?: string }
```

- delta 合并节流 30ms，避免 IPC 风暴。
- 前端按 `messageId` 增量更新，不整树重渲染。
- 所有事件同时写日志（不含完整提示词与密钥）。

#### 4.7.4 系统提示词要点

```
你是 Nova，DaveBella 门店的经营伙伴。你的职责是用真实数据帮店长看清经营、定位问题、给出可执行建议。

规则：
1. 只使用工具返回的数据，不编造数字；没有数据就说没有。
2. 每次回答先写清统计口径（时间范围、门店、对比基准）。
3. 默认时间范围：今天；用户说“最近”默认 7 天；“这个月”为自然月。
4. 结论先行：最多 3 条结论，再给证据与建议。
5. 单条回复不超过 600 字；长内容写入报告文件并发布产物。
6. 金额用人民币，百分比保留 1 位小数；同比/环比必须写基准。
7. 涉及写操作必须先说明影响并获得确认。
8. 文件只能写入当前工作目录，路径使用相对路径。
9. 下面提供本店 MySQL 的业务表结构（表名、字段、类型、注释、枚举、关联）；优先用内置工具查询，工具不覆盖时再基于表结构生成只读 SQL。
```

#### 4.7.5 数据库结构上下文

Agent 的数据访问**直连 MySQL（只读账号）**：内置工具与 `query_database` 都由主进程 `db/mysql.ts` 的连接池执行，仅允许 `SELECT`。本地 SQLite 只存会话与产物，不参与经营数据查询。

```
main: startSession()
  → 读取 ~/.nova/schema-cache.json（24h 内有效）
  → 过期则用只读连接查 information_schema（表、字段、注释、索引）
  → buildSchemaPrompt(snapshot, taskDomain) 生成 Markdown
  → 与系统提示词拼接，写入 system message
```

- 快照内容：业务表名 + 中文注释 + 字段、类型、可空、默认值、主键/索引；枚举字典（订单状态、支付方式、库存状态、会员等级等）；常用关联（如 `Order.orderSn ↔ OrderItems.orderSn`）。
- 组织方式：`schema.ts` 生成 Markdown，按域分组（order / inventory / member / marketing / finance），每组一个二级标题。
- 体积控制：默认注入全量精简版（≤ 6k tokens）；超出时按任务类型只注入相关域，其余域只给「表名 + 注释 + 字段清单文件路径」。
- 缓存文件：`~/.nova/schema-cache.json`，含 `generatedAt`、`tableCount`、`hash`；系统设置「数据」页可手动刷新。
- 只读查询：`query_database` 直连 MySQL 执行，仅允许 `SELECT`，自动追加 `LIMIT 200`、10s 超时；结果超 50 行截断并告知总量。禁止 `INSERT/UPDATE/DELETE/DDL/ATTACH`、多语句与写文件函数。
- 权限：数据源使用 MySQL 只读账号；成本与进货价字段按当前登录角色过滤（导购员会话在结果集中剔除）；会员手机号完整返回；所有查询写本机审计表 `agent_query_log`（只读账号不能写业务库）。
- 依赖：桌面端新增 `mysql2`（主进程使用），连接串与账号由系统设置 → 数据维护，密码走 `safeStorage` 加密保存。

#### 4.7.6 上下文与 token 控制

- 工具返回默认最多 50 行；超出返回 `truncated: true` 与 `total`，提示 Agent 收窄条件。
- 历史消息保留最近 20 轮；更早内容用 `generateSummary` 压缩为一条 system 摘要。
- 单次工具结果超过 8k 字符时，落盘到 workspace 并在上下文里给文件路径 + 前 50 行。
- 系统提示词固定部分 < 2k tokens。

#### 4.7.7 定时任务与消息通知

预设三个周期性任务，固定在「经营分析」分组，不可删除，可暂停：

| 任务 | cron | 执行时间 | 数据区间 | 产物 |
|---|---|---|---|---|
| 店铺经营日报 | `20 21 * * *` | 每天 21:20 | 当日，对比昨日与上周同日 | 日报 HTML + 指标 CSV |
| 店铺经营周报 | `10 10 * * 1` | 每周一 10:10 | 上周一 ~ 上周日 | 周报 HTML + 指标 CSV |
| 店铺经营月报 | `20 10 1 * *` | 每月 1 号 10:20 | 上月 1 号 ~ 上月最后一天 | 月报 HTML + 指标 CSV |

- 调度器在主进程用 `node-cron` 注册，启动时从 `sessions.schedule_cron` 恢复；系统休眠错过的任务，唤醒后补跑一次并标注「补跑」。
- 执行时间默认如上，**管理员可在系统设置 → 通用 → 定时任务中修改**；保存时校验格式、重建 cron 任务并写回 `app_settings` 与 `sessions.schedule_cron`，导购员不可见该配置入口。
- 触发流程：创建会话（`group_key=analysis`, `type=daily|weekly|monthly`）→ 按区间生成提示词 → 运行 Agent → 产物落盘。
- 任务结束（成功/失败）写入 `notifications`：标题如「店铺经营日报已生成」，`session_id` 指向该会话。
- 渲染进程：header 铃铛显示红点（存在 `read_at IS NULL` 记录）；下拉列出消息（未读加红点），点击 → 将该条 `read_at` 置为当前时间 → 路由到 `analysis` 并选中对应任务 → 红点按未读数实时刷新。
- IPC：`notif:list`（未读优先、倒序）、`notif:read`（单条/全部）、事件 `notif:created` 推送红点更新。
- 失败时通知文案带原因与「重新生成」入口；同一任务连续失败 2 次暂停调度并提示检查 DeepSeek 配置。

### 4.8 产物管线

1. Agent 通过 `write` 写文件，或 `publish_artifact` 显式发布。
2. 主进程监听 run 内的写入动作，扫描 workspace 生成 `artifacts` 记录并推送 `artifact.created`。
3. 预览：本地 HTTP 服务 `http://127.0.0.1:<port>/artifact/<sessionId>/<relPath>`，只读、路径校验、MIME 白名单。
4. 渲染端：
   - HTML：iframe sandbox 预览，可全屏。
   - Markdown：react-markdown + GFM。
   - CSV：虚拟表格，前 500 行。
   - XLSX：SheetJS 解析为表格。
   - 图片 / PDF：原生 `<img>` / `<embed>`。
5. 文件树：主进程递归读取（忽略 `.git`、`node_modules`、隐藏文件），按修改时间排序，目录优先。
6. 产物卡点击 → 打开抽屉并选中文件；抽屉支持最大化、复制路径、Finder 显示。

### 4.9 个人中心 Dialog

| Dialog | IPC | 说明 |
|---|---|---|
| 操作日志 | `api.get('/common/opLogs')` | 分页、日期区间与类型筛选；不提供导出 |
| 系统设置 | `settings:get` / `settings:set` | 通用、任务、模型、数据四段 Tabs，修改即保存 |
| 修改密码 | `api.post('/user/update')` | 前端校验 + 服务端校验 |
| 退出登录 | `auth:logout` | 清 token，保留本地会话与草稿 |

设置文件 `~/.nova/settings.json`：

```json
{
  "version": 1,
  "general": { "theme": "system", "fontSize": 16, "autoLaunch": false },
  "task": {
    "schedule": { "daily": "21:20", "weekly": "mon 10:10", "monthly": "1 10:20" },
    "notify": { "desktop": true, "sound": "default" }
  },
  "model": {
    "provider": "deepseek",
    "defaultModel": "deepseek/<modelId>",
    "baseUrl": "",
    "temperature": 0.3,
    "maxOutputTokens": 4096,
    "apiKeyEnc": "<safeStorage base64>"
  },
  "data": { "apiBaseUrl": "https://davebella.top/pos", "workspaceRoot": "~/.nova/workspaces" }
}
```

- 系统设置分四个 Tab：通用（外观三卡 / 字号三卡 / 开机自启）、任务（定时任务执行时间 / 通知）、模型、数据；不含门店名、语言、采集授权、自动同步；无底部取消/保存按钮，修改即写入 `settings.json`。
- API Key 使用 `safeStorage.encryptString` 加密，文件权限 `0600`。
- 旧明文 Key 首次启动自动迁移为密文。

### 4.10 打包

`electron-builder.yml`：

```yaml
appId: com.davebella.nova
productName: DaveBella
directories: { output: release, buildResources: assets }
files: ["out/**/*", "package.json"]
asar: true
mac:
  target: [{ target: dmg, arch: [arm64, x64] }]
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: assets/entitlements.mac.plist
win:
  target: [{ target: nsis, arch: [x64] }]
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  shortcutName: DaveBella
```

- 签名：macOS 开发阶段免签（`identity: null`），上架前接入证书。
- 升级：electron-updater + 静态 `latest-mac.yml` / `latest.yml`（P1）。
- 安装包内不得出现 `~/.nova` 数据；卸载保留用户数据。

---

## 5. 手机端架构

### 5.1 目录

```
nova-mobile/
├─ app.json                 # name: DaveBella, android.package: com.davebella.nova
├─ eas.json
├─ app/
│  ├─ _layout.tsx
│  ├─ login.tsx
│  ├─ (tabs)/
│  │  ├─ _layout.tsx        # 5 Tab
│  │  ├─ orders.tsx
│  │  ├─ inventory.tsx
│  │  ├─ buy.tsx            # 中间主 Tab
│  │  ├─ members.tsx
│  │  └─ data.tsx
│  ├─ order/[sn].tsx
│  ├─ member/[id].tsx
│  ├─ buy/payment.tsx
│  ├─ buy/success.tsx
│  └─ profile.tsx
├─ src/
│  ├─ components/           # 含 BrandLogo（购物袋 + 标题）
│  ├─ features/{orders,inventory,buy,members,data}/
│  ├─ lib/{api,format,money,storage}.ts
│  ├─ stores/
│  └─ theme/
└─ assets/
```

### 5.2 关键实现

- **网络层**：各端自带的 `src/lib/api.ts`（fetch + AbortController），token 存 `expo-secure-store`。
- **扫码**：`expo-camera` 的 barcode scanner；扫码结果去抖 300ms，命中即加入清单。
- **金额**：所有金额用整数分或 `decimal.js`，禁止浮点直接运算；展示统一 `formatMoney`。
- **幂等**：买单提交生成 `Idempotency-Key` 并持久化，失败重试复用；成功或明确业务失败后清除。
- **图片**：`expo-image` + 磁盘缓存；列表图 200px 缩略。
- **适配**：`react-native-safe-area-context`、`useWindowDimensions`；断点 `< 375` / `375–413` / `> 413` 三档。
- **构建**：`expo prebuild --platform android` → `./gradlew assembleRelease`；包名 `com.davebella.nova`，应用名 `DaveBella`。
- **不包含**：营销 Tab / 营销页面、MySQL 原生模块、任何直连数据库依赖。

### 5.3 买单状态机

```
idle → scanning → cart → member(optional) → discount(optional) → payment → submitting → success
                                                                         ↘ failed(可重试/返回)
```

- `cart` 与 `payment` 共享同一份 zustand store，离开页面保留草稿。
- 提交成功后清空草稿；失败保留并展示错误。
- 库存冲突（409）时回到 cart 并高亮冲突行。

---

## 6. 浏览器插件架构

```
nova-extension/
├─ manifest.json
├─ src/
│  ├─ background/index.ts    # contextMenus、消息路由、上传、token
│  ├─ content/index.tsx      # 浮层 UI（Shadow DOM）
│  ├─ content/extract.ts     # 款号识别
│  ├─ options/App.tsx        # 配对、域名规则
│  ├─ popup/App.tsx          # 状态与快捷入口
│  └─ shared/{api,storage,types}.ts
└─ vite.config.ts
```

### 6.1 manifest

```json
{
  "manifest_version": 3,
  "name": "DaveBella 商品采集",
  "version": "1.0.0",
  "permissions": ["contextMenus", "storage", "activeTab", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle" }],
  "options_page": "options.html",
  "action": { "default_popup": "popup.html", "default_title": "DaveBella 商品采集" }
}
```

### 6.2 右键采集链路

```
background: chrome.contextMenus.create({ id: "nova-collect-image", title: "采集图片到 Nova", contexts: ["image"] })
  → onClicked(info, tab)
  → chrome.tabs.sendMessage(tab.id, { type: "COLLECT_IMAGE", srcUrl: info.srcUrl })
content: 打开右上角浮层（Shadow DOM，避免宿主样式污染）
  → extractStyleNo(document) 预填
  → 用户确认
  → chrome.runtime.sendMessage({ type: "UPLOAD_IMAGE", payload })
background: fetch multipart 到 nova-pos-server /inventory/uploadImage
  → 服务端落盘 ~/inventory-image/<sn>.jpg，并 UPDATE Inventory SET image 按 sn 覆盖全部 SKU
  → 返回结果 → content 显示成功/失败
```

- 采集直接生效：不进入待确认队列，插件成功即写入数据库图片字段，桌面与手机刷新即可见。
- 图片字段存 `/inventory-image/<sn>.jpg` 相对路径，客户端按服务端 `baseUrl` 拼接；同款重复采集直接覆盖。
- 图片压缩：`canvas` 转 JPEG，最长边 2000px，质量 0.85，目标 ≤ 2MB。
- 跨域图片受 canvas 污染时，回退到 background 用 `fetch` 拉取 blob 后压缩（需 host_permissions）。
- Token：Options 用门店账号调用 `/collector/login` 换取长期 token，存 `chrome.storage.local`；桌面端可撤销。
- 浮层使用 React + Lucide 图标；样式内联，避免依赖页面 CSS。

### 6.3 款号识别

```ts
const PATTERNS = [
  /(?:款号|货号|商品编码|SKU)\s*[:：]\s*([A-Za-z0-9_-]{4,20})/i,
  /"sku"\s*:\s*"([A-Za-z0-9_-]{4,20})"/i,
  /"productID"\s*:\s*"([A-Za-z0-9_-]{4,20})"/i
]
```

- 依次尝试：meta/JSON-LD → 常见文本 → 面包屑/标题 → 域名自定义选择器。
- 命中后归一化（去空格、转大写）；未命中返回空串。
- 识别结果必须由用户确认，不静默上传。

---

## 7. 小程序架构

- Taro 4.1.8 + React 18 + NutUI。
- 目录沿用旧实现：`src/pages/{index,order,score,balance,activity,profile}`。
- 登录：`Taro.login()` → `/member/login` → token 存 `Taro.setStorageSync`。
- 请求：统一 `request` 封装，401 跳登录；金额格式化；下拉刷新 + 触底加载。
- 分包：首页主包，订单/积分/余额/活动分包（P1）。
- 构建产物 zip 命名 `DaveBella-Miniapp-<version>.zip`，上传微信后台。

---

## 8. 服务端架构

### 8.1 平迁原则

- 目录、Sequelize 模型、业务 SQL 原样保留，先保证行为一致。
- 统一 TypeScript 严格模式与构建输出 `dist/`。
- 配置统一读取 `~/.nova/server-config.json` / `~/.nova/mall-config.json`，不依赖环境变量。
- 逐步优化：统一响应、JWT、错误码、日志、分页、索引；不做大规模重写。

### 8.2 nova-pos-server

**入口**：`src/index.ts`（Express 4）  
**端口**：9577（默认）  
**路由分组**：

| 分组 | 前缀 | 数量 | 说明 |
|---|---|---|---|
| 买单 | `/buy/*` | 3 | 提交、门店券、历史兼容 |
| 订单 | `/order/*` | 17 | 列表、明细、详情、退换、导出、打印、毛利率 |
| 库存 | `/inventory/*` | 18 | 列表、SKU、入库退库、模板、断码、热销、流水、图片 |
| 会员 | `/member/*` | 16 | 列表详情、增改删、积分、余额、券、抽奖 |
| 用户 | `/user/*` | 4 | 登录、注册、更新、列表 |
| 数据 | `/data/*` | 8 | 核心指标、趋势、归档；**删除 `/data/analysis`；不返回导购业绩聚合** |
| 营销 | `/marketing/*` | 7 | 增删改查、券、下线 |
| 通用 | `/common/*` | 2 | 上传、操作日志 |
| 采集 | `/collector/*` | 3 | 配对、撤销、状态（新增） |
| Agent | `/agent/*` | 6 | 只读聚合（新增，见 9.3） |

**优化项**：

1. 统一响应中间件：成功 `{ code: 0, message: "ok", data, traceId }`；错误 `{ code, message, traceId, details? }`。
2. JWT 鉴权中间件替换 `X-User-Id`；保留兼容开关 `AUTH_LEGACY=true` 一个版本；单店场景不在 token 中放 `storeId`。
3. 请求上下文：`traceId`、操作人、客户端版本；pino 结构化日志。
4. 写操作审计：统一 `opLog` 服务，记录前后值。
5. 参数校验：zod schema 集中在 `src/validators`。
6. 分页统一 `{ page, pageSize, total, list }`，pageSize 上限 200。
7. 上传安全：MIME 白名单、大小限制、随机文件名、静态目录不可执行。
8. 数据库连接池 10；关键索引补充；慢查询日志阈值 200ms。

**影响兼容**：现有桌面/手机客户端将全部重写，因此可以直接采用新响应结构；不维护旧客户端兼容。

### 8.3 nova-mall-server

- 端口 9566，路径前缀 `/mall`。
- 路由：登录、会员信息、订单、活动、余额、积分、券、上传。
- 独立数据库账号，仅授予会员侧表读写权限。
- 响应统一结构；字段白名单，绝不返回成本/毛利/导购/内部备注。
- 微信接口：`jscode2session`；session_key 不落库，仅存 openid 与 unionid。

### 8.4 部署

- PM2：`ecosystem.config.cjs` 管理两个进程。
- 发布：`npm run build` → `pm2 startOrReload`。
- 环境：配置全部落在 `~/.nova/*.json`，进程不读取环境变量。
- 健康检查：`GET /health` 返回版本、数据库连接、uptime。
- 备份：MySQL 每日全量 + binlog；上传目录每日增量。

---

## 9. 接口契约

### 9.1 通用约定

- 时间：`YYYY-MM-DD HH:mm:ss`（Asia/Shanghai）；查询参数日期 `YYYY-MM-DD`。
- 金额：字符串或数字（保留 2 位），前端统一 `Decimal` 处理。
- 分页：`page` 从 1 开始，`pageSize` 默认 20，最大 200。
- 错误码：

| code | 含义 |
|---|---|
| 0 | 成功 |
| 40001 | 参数错误 |
| 40101 | 未登录 / token 失效 |
| 40301 | 无权限 |
| 40401 | 资源不存在 |
| 40901 | 业务冲突（库存不足、重复提交） |
| 50001 | 服务内部错误 |

### 9.2 关键接口（沿用旧路径）

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/user/login` | 用户名 + 密码登录，返回 JWT |
| POST | `/user/register` | 注册：用户名、姓名、密码、确认密码（服务端二次校验一致性） |
| GET | `/user/profile` | 当前用户信息与角色 |
| POST | `/buy/submit` | 提交订单（Idempotency-Key） |
| GET | `/buy/getStoreCoupon` | 门店可用券 |
| GET | `/order/queryList` | 订单列表 |
| GET | `/order/queryDetail` | 订单详情 |
| GET | `/order/queryItemList` | 商品明细（按 SKU 统计） |
| GET | `/order/queryOrderGoods` | 订单商品（按日期区间返回订单 + 明细，供组合表格与导出） |
| POST | `/order/refundItem` | 退货 |
| POST | `/order/changeItem` | 换货 |
| GET | `/inventory/queryList` | 库存列表 |
| GET | `/inventory/queryDetailBySku` | SKU 详情 |
| GET | `/inventory/skuRecord` | 商品流水 |
| GET | `/inventory/getNoStockList` | 断码 |
| GET | `/inventory/getHotSalesList` | 热销 |
| POST | `/inventory/uploadImage` | 商品图片上传：落盘 `<sn>.jpg` 并更新 `Inventory.image`（按 sn 覆盖同款全部 SKU） |
| GET | `/member/list` | 会员列表 |
| GET | `/member/detail` | 会员详情 |
| POST | `/member/incomeBalance` | 会员充值 |
| GET | `/marketing/list` | 活动列表 |
| POST | `/data/getCoreData` | 核心指标 |
| GET | `/data/getStoreCharts` | 营业趋势 |
| GET | `/common/opLogs` | 操作日志 |

### 9.3 新增接口

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| POST | `/collector/login` | 门店账号登录换取采集 token | 插件 |
| DELETE | `/collector/token` | 撤销插件 token | 插件 |
| GET | `/collector/status` | 插件 token 有效性 | 插件 |
| GET | `/agent/overview` | 经营概览聚合（含同比环比） | Agent |
| GET | `/agent/anomalies` | 规则化异常 | Agent |
| GET | `/agent/slow-moving` | 滞销与周转 | Agent |
| GET | `/agent/top-products` | 畅销榜 | Agent |
| GET | `/agent/member-cohort` | 会员分层/复购 | Agent |
| GET | `/agent/campaign-performance` | 活动效果 | Agent |
| GET | `/agent/schema` | 表/字段/枚举的中文描述（可选缓存，主进程亦可直接用只读连接读取 information_schema） | 桌面主进程 |

> 新增接口全部只读、返回精简字段；单店场景不做门店过滤。不复用 UI 大对象，降低 token 消耗。

---

## 10. 数据模型

| 表 | 关键字段 | 说明 |
|---|---|---|
| `User` | id, name, password(bcrypt), role, status, extra | role: admin（管理员）/ staff（导购员），注册默认 staff |
| `Order` | orderSn, orderStatus, originalAmount, orderActualAmount, payType, usePoint, useBalance, useCoupon, salerId, source, showStatus, createdAt | 订单主表 |
| `OrderItems` | sn, sku, name, color, size, originalPrice, discount, actualPrice, counts, orderSn, status | 订单明细 |
| `Inventory` | sn, sku, name, brand, color, size, counts, saleCounts, price, cost, image, status | SKU 库存 |
| `InventoryRecord` | sku, type(purchase/sale/return/adjust), counts, before, after, orderSn, operator | 库存流水 |
| `Member` | name, phone(unique), level, point, balance, actual, birthday, lastVisit | 会员 |
| `MemberScore` | memberId, score, type, source, remark | 积分流水 |
| `MemberBalance` | memberId, amount, type, source, remark | 余额流水 |
| `MemberCoupon` | memberId, couponId, status, usedAt, orderSn | 会员券 |
| `Marketing` | title, type, rule, startAt, endAt, status | 活动 |
| `StoreCoupon` | marketingId, name, amount, threshold, total, used | 券模板 |
| `OpLog` | userId, type, info, appVersion, userOS | 操作日志 |
| `StoreMonthlySummary` | year, month, amount, orderCount | 月度归档 |

新增（服务端）：

| 表 | 字段 | 说明 |
|---|---|---|
| `CollectorToken` | id, tokenHash, userId, name, status, lastUsedAt, createdAt | 插件配对授权 |
| `AgentQueryLog` | id, userId, tool, params, rowCount, durationMs, createdAt | Agent 查询审计；改为本机 SQLite 表 `agent_query_log`（只读账号不能写业务库） |

索引建议：

```sql
CREATE INDEX idx_order_created ON `Order`(createdAt, showStatus, orderType);
CREATE INDEX idx_order_sn ON `Order`(orderSn);
CREATE INDEX idx_items_order ON `OrderItems`(orderSn);
CREATE INDEX idx_items_sku ON `OrderItems`(sku, createdAt);
CREATE INDEX idx_inventory_sku ON `Inventory`(sku, sn);
CREATE INDEX idx_inventory_record ON `InventoryRecord`(sku, createdAt);
CREATE INDEX idx_member_phone ON `Member`(phone);
CREATE INDEX idx_member_score ON `MemberScore`(memberId, createdAt);
CREATE INDEX idx_member_balance ON `MemberBalance`(memberId, createdAt);
```

---

## 11. Agent 工具规格

工具定义使用 `@earendil-works/pi-ai` 的 `Type.Object`，实现 `AgentTool`。所有工具失败一律 `throw`（pi-agent-core 以异常判定 `isError`）。

### 11.1 数据工具

#### `get_business_overview`

```ts
Type.Object({
  startDate: Type.String({ description: "YYYY-MM-DD" }),
  endDate: Type.String({ description: "YYYY-MM-DD" }),
  compare: Type.Optional(Type.Union([Type.Literal("yesterday"), Type.Literal("lastWeek"), Type.Literal("lastMonth"), Type.Literal("none")]))
})
```

返回：

```json
{
  "range": { "start": "2026-10-23", "end": "2026-10-23" },
  "metrics": {
    "revenue": 12860.5, "orders": 42, "avgTicket": 306.2,
    "itemsPerOrder": 1.8, "grossMarginRate": 0.52,
    "memberOrderRate": 0.61, "refundRate": 0.02, "memberBalanceConsumed": 860
  },
  "compare": { "revenue": 0.12, "orders": 0.08, "avgTicket": 0.03 },
  "dataUpdatedAt": "2026-10-23 21:35:00"
}
```

数据源：`/agent/overview`。

#### `query_sales_trend`

参数：`startDate, endDate, granularity(day|week|month), metric(revenue|orders|items)`。上限 90 个点，超出按周聚合。

#### `query_orders`

参数：`startDate, endDate, status, payType, salerId, keyword, minAmount, maxAmount, page, pageSize(默认 20，最大 50)`。返回精简字段：`orderSn, time, items, amount, payType, saler, status`。

#### `get_order_detail`

参数：`orderSn`。返回订单头 + 商品行 + 优惠 + 支付 + 会员摘要。

#### `query_inventory`

参数：`keyword, styleNo, sku, stockStatus(all|low|out|broken), category, page, pageSize`。返回 `styleNo, sku, name, color, size, stock, price, lastSoldAt`。

#### `query_stock_flow`

参数：`sku | styleNo, startDate, endDate, type`。返回流水行（最多 50）。

#### `query_slow_moving`

参数：`days(默认 30), category, minStock(默认 1), limit(默认 20)`。返回零动销/低周转 SKU 与库存金额。

#### `query_top_products`

参数：`startDate, endDate, metric(items|revenue|grossProfit), limit(默认 10)`。

#### `query_members`

参数：`keyword(手机号/姓名), level, lastVisitDays, minBalance, page, pageSize`。列表手机号完整展示。

#### `get_member_profile`

参数：`phone | memberId`。返回等级、积分、余额、累计消费、最近 5 笔订单、可用券数、最近到店。

#### `query_marketing`

参数：`startDate, endDate, status, campaignId`。返回活动名、周期、领取、核销、带动销售额、ROI（若成本可算）。

#### `query_staff_performance`

参数：`startDate, endDate, limit`。返回导购、单量、销售额、客单价、退款额。

#### `detect_business_anomalies`

参数：`date`。规则：

- 营业额低于近 14 天均值 30%。
- 单量同比/环比下降 40%。
- 退款率 > 5%。
- 毛利率低于阈值（默认 35%）。
- 断码款数较昨日增加 20%。
- 会员余额消费突增 2 倍。

返回按严重度排序的异常列表，附证据值与阈值。

#### `query_database`

```ts
Type.Object({
  sql: Type.String({ description: "单条只读 SELECT，必须包含时间范围或聚合" }),
  reason: Type.String({ description: "为什么内置工具无法满足" })
})
```

- 校验与执行：仅 `SELECT`；拒绝分号多语句、DDL/DML/ATTACH；自动追加 `LIMIT 200`；在 MySQL 只读连接上执行（`db/mysql.ts`）；成本与利润字段按角色过滤。
- 10s 超时；结果最多 50 行进入上下文，其余落盘为 CSV 并告知路径。
- 所有调用写本机审计表 `agent_query_log`（SQLite），可在操作日志中查看。

### 11.2 文件工具

与 nexa-work 对齐：`read / write / edit / bash`，全部限制在会话 workspace；`bash` 超时 120s，执行前记录审计。

### 11.3 产物工具

#### `publish_artifact`

```ts
Type.Object({
  path: Type.String({ description: "相对工作目录的文件路径" }),
  title: Type.String(),
  kind: Type.Union([Type.Literal("html"), Type.Literal("md"), Type.Literal("csv"), Type.Literal("xlsx"), Type.Literal("image"), Type.Literal("pdf")])
})
```

- 校验文件存在、大小 ≤ 20MB、路径在 workspace。
- 写入 `artifacts` 表并推送 `artifact.created`。

### 11.4 记忆工具

与 nexa-work 对齐的三层长期记忆（profile / state / preference），存本机 SQLite `memories` 表；每 3 轮对话自动抽取一次，并在 system prompt 中注入。

#### `memory_read`

参数：`layer(profile|state|preference) 可选`。返回记忆条目 `id, layer, category, content, confidence`。

#### `memory_write`

参数：`layer, category, content, confidence(默认 0.9)`。同 `layer + category` 覆盖旧内容；用户明确要求「记住」时调用。

### 11.5 工具返回裁剪

- 行数上限 50；超出附 `total`、`truncated: true`。
- 字段名使用中文语义英文 key；删除 UI 专用字段（颜色 token、图标、按钮配置）。
- 金额保留 2 位小数；比例返回 0–1 小数，展示层转百分比。
- 返回结构固定，Agent 不需要猜测字段。

---

## 12. 错误处理与可观测性

### 12.1 桌面端

- 全局错误边界：渲染异常显示「重新加载」；不白屏。
- IPC 错误统一 `{ code, message, cause? }`，前端 Toast + 日志。
- Agent 失败分类：

| 类型 | 处理 |
|---|---|
| 未配置 Key | 打开系统设置，任务标记失败 |
| 网络错误 | 自动重试 1 次，仍失败展示重试按钮 |
| 模型限流 | 指数退避（1s/2s/4s），最多 3 次 |
| 工具错误 | 将错误文本回传模型，由模型决定换参数或告知用户 |
| 用户停止 | 标记 stopped，不报错 |

- 日志：`~/Library/Logs/DaveBella/main.log`（Windows `%APPDATA%\DaveBella\logs`），按天轮转，保留 14 天。
- 敏感信息脱敏：API Key、密码；会员手机号按要求完整展示，不做脱敏。

### 12.2 服务端

- `traceId` 全链路；请求日志含方法、路径、状态、耗时、用户、门店。
- 错误分级：业务错误 info、系统错误 error + 堆栈。
- 慢查询 > 200ms 记录 SQL 摘要。
- 指标：QPS、P95、错误率、订单提交成功率；PM2 + 日志采集。

---

## 13. 测试策略

| 层 | 工具 | 范围 |
|---|---|---|
| 纯函数 | Vitest | 金额、折扣、积分、订单号、日期范围、工具返回裁剪 |
| API | Vitest + supertest | 鉴权、幂等、库存扣减事务、退款、会员余额 |
| 桌面渲染 | Playwright（Vite dev server） | 导航、买单、设置 Dialog、经营分析交互 |
| 桌面壳 | Playwright Electron | 启动、workspace 创建、产物抽屉 |
| Agent | 单元 + 录制回放 | 工具选择、无数据回复、停止、重试、上下文压缩 |
| 手机 | RNTL + Maestro | 买单主流程、5 Tab、三机型截图 |
| 插件 | Vitest + 手工 | 款号识别、上传、浮层 |
| 小程序 | 微信开发者工具 | 登录、订单/积分/余额 |

质量门禁：

1. `npm run typecheck` 全绿。
2. 核心包测试覆盖率 ≥ 70%。
3. 买单 E2E 通过。
4. 打包产物可在目标机器安装启动。

---

## 14. 实施阶段

| 阶段 | 内容 | 交付 |
|---|---|---|
| P0 | 六个独立工程脚手架、npm 脚本、规范、CI | 六个可启动的空壳工程 |
| P1 | 平迁 nova-pos-server / nova-mall-server 并优化（鉴权/幂等/审计/删除 AI/角色字段过滤） | API 契约冻结 |
| P2 | 桌面端框架 + 登录/注册 + 6 大业务模块 | 管理能力可用 |
| P3 | 经营分析（三组任务、对话、工具、产物、抽屉、定时任务、消息通知） | 核心差异化可用 |
| P4 | 浏览器插件 | 采集可用 |
| P5 | 手机端 5 Tab + 买单 | Android 内测包 |
| P6 | 小程序（最后）、打包、机型适配、验收、上线 | DaveBella 全量产物 |

每阶段结束必须：typecheck、关键 E2E、构建产物、评审记录。

---

## 15. 旧实现迁移映射

| 旧位置 | 新位置 | 处理 |
|---|---|---|
| `nova/apps/web/src/pages/*` | `nova-work/nova-desktop/src/renderer/src/pages/*` | antd 页面按 shadcn 重写，交互对齐 |
| `nova/apps/desktop`（Electron 壳） | `nova-work/nova-desktop/src/main` | 重写，保留窗口与 store 经验 |
| `nova/apps/mobile` | `nova-work/nova-mobile` | 改为 Expo；删除 `MySQLManager`/`DatabaseService`；service 改 API；去掉营销 Tab |
| `nova/apps/browser-extension` | `nova-work/nova-extension` | 增加 contextMenus 与浮层，移除点击图片即弹窗 |
| `nova/apps/miniapp` | `nova-work/nova-miniapp` | 基本平移，统一请求与登录态 |
| `nova/services/storepos-api` | `nova-work/nova-pos-server` | 平迁 + 优化；删除 `/data/analysis` 与导购业绩聚合 |
| `nova/services/miniapp-api` | `nova-work/nova-mall-server` | 平迁 + 统一响应 |
| `nova/apps/web/src/components/Copilot` | 删除 | 能力迁移到经营分析 |
| `nova/apps/web/src/pages/Data/StoreChart.tsx` AI 抽屉 | 删除 | 数据中心不再有 AI |

---

## 16. 风险与对策

| 风险 | 技术对策 |
|---|---|
| `pi-agent-core` API 变动 | 锁定 0.74.x；agent 层封装适配器，单点升级 |
| 工具返回过大导致上下文爆炸 | 强制裁剪 + 落盘 + 摘要 |
| Agent 写坏文件或执行危险命令 | 路径沙箱、命令白名单、超时、审计、确认卡 |
| sql.js 大数据性能 | 仅存会话/消息；每 200ms 落盘；定期 VACUUM |
| Electron 打包体积 | asar + 按需依赖；首版可接受 ~150MB |
| Android 三机型适配 | 真机回归 + 截图基线；禁用硬编码尺寸 |
| 插件跨域图片 | background fetch + host_permissions + 压缩回退 |
| 服务端平迁引入回归 | 先冻结契约，再用旧库数据做对照测试 |

---

## 17. 评审结论与待确认项

已确认：

1. 实施顺序：六工程骨架与 npm 脚本 → 平迁并优化两个服务端 → 桌面端 → 插件 → 手机端 → 小程序。
2. 数据访问：桌面/插件/手机业务走 nova-pos-server；Agent 走主进程 IPC，用只读账号直连 MySQL 做查询（仅 SELECT），经营分析直接读取真实业务数据。
3. 周期任务时间可配置，默认 21:20 / 周一 10:10 / 每月 1 号 10:20；仅管理员可改。
4. 登录为用户名 + 密码；注册字段为用户名、姓名、密码、确认密码，注册默认导购员。
5. 仅管理员 / 导购员两种角色；导购员不可见进货价、成本、毛利额、毛利率；导购员可直接退货/退款。
6. 买单支持挂单 / 取单，沿用旧实现：单笔挂单存本机（electron-store / 手机本地存储），不提交服务端；取单时清单非空需二次确认。
7. 插件采集图片直接生效：复用 `/inventory/uploadImage`，落盘 `<sn>.jpg` 并按 sn 写入 `Inventory.image`，同款直接覆盖，不进入待确认队列。
8. 会员手机号在桌面端、手机端、小程序与导出结果中全部完整展示，不做脱敏；仅密码与 API Key 不落明文。

仍待确认：

（无）
