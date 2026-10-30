# Nova Desktop 桌面端

DaveBella（内部代号 Nova）门店经营工作台的桌面应用，基于 Electron + React。覆盖经营分析、买单、订单、库存、会员、营销、数据七个业务域，所有业务数据经主进程白名单转发到 nova-pos-server。

## 技术栈

- Electron 35（主进程 / preload）
- React 19 + electron-vite 2.3（Vite 5）
- Tailwind CSS 4 + shadcn/ui（new-york / neutral）+ Lucide 图标
- TanStack Query 5 + TanStack Table 8、react-router-dom 7、Zustand 5、Recharts 3
- sql.js（Agent 会话库）、mysql2（Agent 只读查询）

## 目录结构

```
nova-desktop/
├── src/
│   ├── main/                    # 主进程（唯一可做 IO / 网络 / DB 的层）
│   │   ├── index.ts             # 窗口、ipcMain.handle、生命周期
│   │   ├── window.ts / env.ts   # 窗口创建、构建期版本号
│   │   ├── api/                 # POS 请求转发
│   │   │   ├── endpoints.ts         # ★ 端点白名单（'METHOD /path' 精确匹配）
│   │   │   ├── pos-client.ts        # HTTP 客户端（超时 / 上传 / 导出）
│   │   │   ├── pos-token.ts         # 内部 token 获取与缓存
│   │   │   └── pos-errors.ts
│   │   ├── agent/               # 经营分析 Agent（runtime / provider / prompt / tools / memory）
│   │   ├── db/                  # mysql.ts + sql-guard.ts（只读 SQL）
│   │   ├── services/            # 配置、鉴权、通知、调度等
│   │   └── ipc/                 # IPC handler 注册
│   ├── preload/                 # contextBridge 暴露 window.nova（产物必须是 index.cjs）
│   ├── shared/                  # 主/渲染共享类型（order / buy / member / pos …）
│   └── renderer/src/
│       ├── router.tsx           # 路由与登录守卫
│       ├── pages/<domain>/      # analysis / buy / orders / inventory / members / marketing / data
│       ├── features/<domain>/   # api.ts（服务端字段 → 视图模型）、queries.ts、抽屉、列定义
│       ├── components/          # ui（shadcn）/ common（DataTable、EmptyState、FilterBar…）/ layout / ai-elements
│       ├── lib/                 # pos.ts（IPC 请求入口）、format.ts、pricing.ts
│       ├── stores/              # zustand
│       └── globals.css          # Tailwind v4 主题 token
├── e2e/                         # Playwright 用例
├── electron.vite.config.ts / electron-builder.yml
├── tsconfig.node.json / tsconfig.web.json
└── package.json
```

## 本地开发

```bash
npm install
npm run dev        # electron-vite dev，渲染层默认 http://localhost:5173
```

- **仅改 `src/renderer/**`**：HMR 自动生效。
- **改 `src/main/**` 或 `src/preload/**`**：必须退出进程后重新 `npm run dev`，热更新不生效。
- 业务页面依赖 nova-pos-server，先启动服务端（默认 `http://127.0.0.1:9577`）。

## 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发模式 |
| `npm run typecheck` | `typecheck:node` + `typecheck:web` 全量类型检查 |
| `npm run lint` | ESLint |
| `npm run test` | Vitest 单元测试 |
| `npm run test:e2e` | 构建后跑 Playwright（`e2e/`） |
| `npm run build` | 构建到 `out/` |
| `npm run pack` | 构建 + electron-builder 打 mac / win 安装包（`--publish never`） |

## 与 POS 服务端的接口约定

渲染层**不直接发 HTTP**，统一走 `window.nova.pos.request`（封装在 `features/*/api.ts` → `lib/pos.ts`），由主进程按白名单转发。

新增一个 POS 接口时要同步三处：

1. 服务端 `nova-pos-server/src/router/<域>-controller.ts` 注册路由；
2. `docs/api-contract.md` 补接口契约；
3. `src/main/api/endpoints.ts` 白名单登记 `'GET /order/queryList'` 这类「方法 + 路径」，否则渲染层会收到未授权错误。

## 本地数据与配置

均位于 `~/.nova/`（可用环境变量 `NOVA_HOME` 指向临时目录，E2E 即用此方式隔离）：

| 文件 / 目录 | 说明 |
|---|---|
| `server-config.json` | POS 服务地址与内部 token（与 nova-pos-server 共用） |
| `settings.json` | 桌面端偏好设置 |
| `session.json` | 登录会话 |
| `agent-config.json` | 经营分析 Agent：模型配置 + MySQL 只读连接 |
| `analysis/agent.db` | Agent 会话 / 消息 / 产物（sql.js） |
| `notifications.json` | 通知（最多 50 条） |
| `userData/` | Electron userData 目录 |

## 打包

配置见 `electron-builder.yml`：

- `appId: com.davebella.nova`、`productName: DaveBella`，产物输出 `release/`（已 gitignore）
- mac：arm64 + x64 dmg；win：x64 NSIS
- **`sql.js` 的 wasm 必须 `asarUnpack`**，否则生产环境加载失败

## 关键工程约束

- **preload 产物必须是 `.cjs`**（`"type": "module"` 下 ESM 无法被 preload 加载）。
- 生产环境 `contextIsolation: true`、`nodeIntegration: false`，渲染层**禁止**使用 `fs` / `path` / `child_process` / `mysql2`。
- 列表统一用 `DataTable`（sticky 表头 + 加载/空/错误三态），空态用 `EmptyState`，筛选用 `FilterBar`；图标统一 Lucide，禁止 emoji / 手写 SVG。
- 订单列表分页 20 条（服务端默认值），不要在页面写死其他值。
- 买单允许议价 / 抹零，实收可低于应收；库存不足不阻断，允许负库存销售。

## 排查

- 类型报错：`npm run typecheck`，先区分主进程（`tsconfig.node.json`）与渲染层（`tsconfig.web.json`）。
- 页面接口 401 / 未授权：先确认路径是否已在 `src/main/api/endpoints.ts` 白名单，再确认 `~/.nova/server-config.json` 的 `baseUrl` 与 `auth.internalToken`。
- POS 服务未启动：页面对应请求会超时或报连接失败，先确认 9577 端口在监听。
