# DaveBella（Nova）

> DaveBella 门店经营工作台 —— 收银、订单、库存、会员、营销与经营分析的桌面优先一体化系统。

Nova 是 DaveBella 的内部代号。产品以 **Electron 桌面端为核心**（收银开单、订单中心、库存、会员、营销、数据看板、经营分析 Agent），并配套 **门店端 Android App**、**Chrome 商品图片采集插件** 与 **会员端服务**；门店业务数据统一由 **nova-pos-server** 读写，会员端（小程序/手机端会员场景）走 **nova-mall-server**。

## 目录结构

| 目录 | 说明 | 技术栈 |
|---|---|---|
| `nova-desktop/` | 桌面端主应用（产品主体）：主进程负责窗口、POS 请求白名单转发与经营分析 Agent；渲染进程为 React 界面 | Electron 35 · React 19 · shadcn/ui · TanStack Query/Table · sql.js · mysql2 |
| `nova-pos-server/` | 门店端 POS API：订单、买单、库存、会员、营销、数据、操作日志 | Node 18+ · Express 4 · Sequelize 6 · MySQL · zod |
| `nova-mall-server/` | 会员端 API（小程序/手机端会员场景）：会员、订单、积分、余额、券、活动 | 同上 |
| `nova-mobile/` | 门店端手机 App（Android）：订单 / 库存 / 买单 / 会员 / 数据 五 Tab | Expo 58 · React Native 0.88 · expo-router · zustand |
| `nova-extension/` | Chrome 浏览器插件（MV3）：从商品页采集款号、品名与主图并上传到 POS | React 18 · TypeScript · esbuild · Chrome MV3 |
| `demo/` | 高保真单文件 HTML 原型，桌面/手机/插件/小程序 UI 的对齐基准 | HTML / CSS / JS |
| `docs/` | 产品、技术、验收方案与接口契约（`api-contract.md`） | Markdown / HTML |

> 各子项目**独立安装依赖、独立执行命令**，根目录没有 workspace，也没有根级 `package.json`。

## 整体架构

```
nova-desktop（Electron）
  main 进程 ──HTTP──> nova-pos-server ──Sequelize──> MySQL
        │                  ▲
        │ IPC（白名单）      │ HTTP
  renderer（React）    nova-mobile / nova-extension

nova-mall-server ──Sequelize──> MySQL（会员端接口）
```

- **桌面端**：渲染层不碰网络与数据库，所有 POS 请求经 `window.nova.pos.request` → 主进程按 `src/main/api/endpoints.ts` 白名单转发；经营分析 Agent 在主进程内运行，只读账号直连 MySQL（`db/sql-guard.ts` 仅允许 SELECT）。
- **手机端**：`src/lib/api.ts` 直连 nova-pos-server（默认 `http://127.0.0.1:9577`，可在 App 设置页修改），业务数据层统一收在 `src/lib/pos.ts`。
- **浏览器插件**：右键采集 + 页面浮层核对款号，图片经 `/inventory/uploadImage` 上传（`x-upload-token` 校验）。
- **服务端配置**：`~/.nova/server-config.json`（POS，默认端口 9577）、`~/.nova/mall-config.json`（会员端，默认端口 9599），数据库连接与内部 token 均在这里。
- **原型优先**：所有 UI 变更先对照 `demo/` 原型，再落到 shadcn 组件。

## 快速开始

### 桌面端（主体）

```bash
cd nova-desktop
npm install
npm run dev        # electron-vite dev，渲染层默认 http://localhost:5173
npm run typecheck  # 主进程 + 渲染层类型检查
npm run pack       # 打包安装包（mac / win）
```

- 启动后先登录（管理员 / 导购员），随后进入经营分析、买单、订单、库存、会员、营销、数据中心。
- 未启动 POS 服务时，业务页面会提示请求失败；桌面端依赖 nova-pos-server 提供的接口。

### POS 服务端

```bash
cd nova-pos-server
npm install
npm run dev        # tsc 编译 + nodemon 监听 dist（默认端口 9577）
npm run typecheck
```

- 数据库与端口配置写在 `~/.nova/server-config.json`；结构变更需执行 `src/model/schema.sql` 与 `migrations/*.sql`（人工执行，服务不会自动迁移）。

### 会员端服务

```bash
cd nova-mall-server
npm install
npm run dev        # concurrently：tsc -w + nodemon（默认端口 9599）
npm run typecheck
```

### 手机端

```bash
cd nova-mobile
npm install
npm run dev        # expo start；新增原生依赖请用 npx expo install
npm run typecheck
```

### 浏览器插件

```bash
cd nova-extension
npm install
npm run build      # 产物输出到 dist/
npm run typecheck
```

Chrome → `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选择 **`nova-extension/dist/`** 目录。

## 设计约束（摘要）

- UI 严格使用 shadcn/ui（new-york / neutral），图标统一 Lucide，4px 间距基线，颜色只用语义 token；
- 列表统一用 `DataTable`（sticky 表头 + 加载/空/错误三态），空态统一用 `EmptyState`，筛选统一用 `FilterBar`；
- Electron 渲染进程 `contextIsolation: true`、无 `nodeIntegration`，preload 产物固定 `.cjs`；
- **禁止任何端直连 MySQL**（唯一例外：桌面端 Agent 只读查询）；新增 POS 接口需同步更新 `docs/api-contract.md` 与桌面端 `endpoints.ts` 白名单；
- 买单允许议价/抹零，库存不足不阻断（允许负库存销售并留待追踪）。

协作规范见 [AGENTS.md](AGENTS.md)，接口契约见 [docs/api-contract.md](docs/api-contract.md)，文档索引见 [docs/README.md](docs/README.md)，变更历史见 [CHANGELOG.md](CHANGELOG.md)。
