# AGENTS.md

> 本文件面向 AI Coding Agent，遵循 **C.A.R.S** 框架（Commands / Architecture / Restrictions / Standards），用于让后续改动更准确、更少返工。
>
> 适用仓库：`nova-work` —— **DaveBella（内部代号 Nova）门店经营工作台**，6 个独立子项目 + 原型/文档目录。**每个子项目独立安装依赖、独立执行命令**，根目录没有 workspace，也没有 `package.json`。

---

## 1. Commands（开发命令）

> 根目录不存在根级脚本。所有命令必须在对应子目录下执行；以下命令逐字取自各子项目 `package.json`，未配置的类别一律标注「未配置」。

### nova-desktop（桌面端主体，Electron）

```bash
cd nova-desktop
npm install
npm run dev          # electron-vite dev；渲染层默认 http://localhost:5173
npm run build        # electron-vite build（产出 out/main、out/preload、out/renderer）
npm run preview      # electron-vite preview
npm run typecheck    # = typecheck:node && typecheck:web
npm run typecheck:node   # 主进程 / preload / shared
npm run typecheck:web    # 渲染端
npm run lint         # eslint .
npm run test         # vitest run --passWithNoTests
npm run test:e2e     # npm run build && playwright test
npm run pack         # build + electron-builder（mac + win，--publish never）
npm run pack:mac / npm run pack:win
```

- 质量门禁：`npm run typecheck` 必跑；改动渲染层业务逻辑时优先补/跑 `npm run test`（vitest，用例在 `src/**/*.test.ts(x)`）。

### nova-pos-server（POS API 服务，门店端业务全部走这里）

```bash
cd nova-pos-server
npm install
npm run dev        # tsc 编译一次 + nodemon 监听 dist（改动 src 需重新触发编译）
npm run build      # tsc -p tsconfig.server.json
npm start          # node dist/index.js
npm run typecheck  # tsc -p tsconfig.server.json --noEmit
npm run lint       # eslint src --ext .ts
```

- Test / Format：**未配置**（有 prettier 依赖但无脚本），以 `typecheck` + `lint` 为门禁。
- 迁移 SQL（如 `migrations/20261030_add_indexes.sql`）需**人工执行**，服务启动不会自动跑。

### nova-mall-server（会员端 / 小程序 API 服务）

```bash
cd nova-mall-server
npm install
npm run dev        # concurrently：tsc -w + nodemon
npm run build
npm start
npm run typecheck
npm run lint
```

### nova-mobile（手机端，Expo / React Native）

```bash
cd nova-mobile
npm install        # 安装依赖；新增原生依赖必须用 npx expo install <pkg>
npm run dev        # expo start（同 npm start）
npm run android / npm run ios
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .
npm run test       # vitest run
npm run build      # typecheck + expo export --platform android
npm run pack       # expo prebuild --platform android + gradlew assembleRelease
```

- 该目录另有 [nova-mobile/AGENTS.md](nova-mobile/AGENTS.md)（Expo 专项规则：不要凭记忆写 Expo API、路由约定、CNG 等），**改手机端前必须先读它**，两者冲突时以 Expo 专项规则为准。

### nova-extension（Chrome MV3 商品图片采集插件）

```bash
cd nova-extension
npm install
npm run build      # node scripts/build.mjs → dist/（chrome://extensions 加载这个目录）
npm run dev        # node scripts/build.mjs --watch（esbuild + Tailwind 增量）
npm run typecheck  # tsc --noEmit
```

- Test / Lint / Format：**未配置**。

### nova-miniapp（会员小程序，Taro + React + NutUI）

```bash
cd nova-miniapp
npm install
npm run dev        # taro build --type weapp --watch（微信开发者工具加载 dist/）
npm run build      # taro build --type weapp → dist/
npm run typecheck  # tsc --noEmit
npm run lint       # eslint src --ext .ts,.tsx
npm run test       # vitest run
```

- 产物目录是 `dist/`，用微信开发者工具打开该目录预览；appid 复用 `wx9a6777fceb2b3505`。
- 接口地址在 `src/constants/index.ts` 里按构建模式切换：`API_BASE_URL_DEV`（本地 `http://127.0.0.1:9566`）/ `API_BASE_URL_PROD`（云域名），`taro build` 走生产值，`npm run dev` 走开发值；不再依赖 `.env`。
- 构建依赖 `ajv@8` 必须保留为直接依赖（webpack5 的 schema 校验需要），不要因「非业务依赖」删除。

---

## 2. Architecture（架构与目录）

### 2.1 技术栈（按此对齐，勿降级/替换）

| 子项目 | 技术栈 |
|---|---|
| `nova-desktop` | Electron **35** · electron-vite **2.3** · Vite **5.4** · React **19** · TypeScript **5.7** · Tailwind CSS **v4**（`@tailwindcss/vite`） · shadcn/ui **new-york / neutral** · Radix UI · TanStack Query **5** + TanStack Table **8** · react-router-dom **7** · zustand **5** · recharts **3** · sonner · zod **3** · sql.js · mysql2 · lucide-react |
| `nova-pos-server` | Node **≥18** · TypeScript **5.8** · Express **4** · Sequelize **6** · MySQL（mysql2） · zod **3** · dayjs · decimal.js · exceljs / xlsx · multer · jsonwebtoken |
| `nova-mall-server` | 同上（Express 4 + Sequelize 6 + MySQL + multer），额外 `dotenv`，含微信配置 |
| `nova-mobile` | Expo **58** · React Native **0.88** · expo-router **58**（typed routes） · React **19.3** · TypeScript **6.0** · zustand **5** · TanStack Query **5** · expo-sqlite / camera / secure-store · lucide-react-native |
| `nova-extension` | Chrome **MV3**（`minimum_chrome_version: 110`） · React **18** · TypeScript **5.6** · esbuild **0.24** + Tailwind CLI **3.4**（构建脚本 `scripts/build.mjs`） |
| `nova-miniapp` | 微信小程序 · Taro **4.1.8**（webpack5，designWidth 375） · React **18.3** · TypeScript **5.6** · SCSS · NutUI React Taro **3.0**（`@nutui/nutui-react-taro` + `@nutui/icons-react-taro`） · zustand **5** |

### 2.2 系统数据流

```
nova-desktop（Electron）
  main 进程：api/pos-client → HTTP → nova-pos-server；Agent 只读 MySQL（sql-guard 仅 SELECT）
  renderer：window.nova.pos.request（IPC，contextIsolation）→ main 白名单转发
nova-mobile（Expo）：src/lib/api.ts → HTTP 直连 nova-pos-server（默认 http://127.0.0.1:9577，可在设置页改）
nova-extension（MV3）：采集商品图 → POST nova-pos-server /inventory/uploadImage（x-upload-token）
nova-mall-server：会员端（小程序/手机端会员）独立 API，数据同库不同路由
nova-miniapp（Taro）：src/services/request.ts → HTTP 直连 nova-mall-server /mini/*（默认 http://127.0.0.1:9566）
```

- **小程序素材图片地址由桌面端生成**：图片由桌面端经 POS 上传后落在 `~/.nova/storage/mini-image`，POS 只返回文件名；桌面端用 `~/.nova/api-config.json` 的 `baseUrl` 拼成 `{baseUrl}/mini-image/{filename}` 写进 `~/.nova/mini-content.json`，mall-server 的 `/mini/*` 接口原样返回该地址，不做改写。反向代理带路径前缀（如 `/pos2`）时地址依然正确，改动上传链路时不要改回用请求 Host 拼地址。

- **业务数据统一经 nova-pos-server 读写，禁止任何端直连 MySQL**（唯一例外：桌面端 Agent 的只读查询，走 `src/main/db/sql-guard.ts`，仅允许 SELECT）。
- 桌面端渲染层是浏览器环境，所有网络请求必须经主进程白名单（见 3.3）。

### 2.3 目录结构（带注释）

```
nova-work/
├── AGENTS.md                  # 本文件
├── docs/                      # 产品/技术/验收方案（api-contract.md 为 POS 接口契约）
├── demo/                      # 高保真单文件 HTML 原型（桌面/手机/插件/小程序 UI 对齐基准）
│
├── nova-desktop/              # ★ 桌面端主体
│   ├── electron.vite.config.ts    # main / preload / renderer 三段式构建 + 路径别名 + 版本号注入
│   ├── components.json            # shadcn 配置（new-york / neutral / lucide）
│   ├── eslint.config.js / vitest.config.ts / playwright.config.ts
│   ├── e2e/                       # Playwright 用例
│   └── src/
│       ├── main/                  # 主进程（唯一可做 IO / 网络 / DB 的层）
│       │   ├── index.ts           # 入口：窗口、ipcMain.handle、生命周期
│       │   ├── window.ts / env.ts / app-version.d.ts
│       │   ├── api/               # pos 请求转发层
│       │   │   ├── endpoints.ts        # ★ 端点白名单（方法 + 路径精确匹配）
│       │   │   ├── pos-client.ts       # HTTP 客户端（超时、上传、导出）
│       │   │   ├── pos-token.ts        # 服务端内部 token 获取/缓存
│       │   │   └── pos-errors.ts
│       │   ├── agent/             # Agent 运行时（runtime / provider / prompt / tools / skills / memory）
│       │   ├── db/                # mysql.ts + sql-guard.ts（只读 SQL 校验）
│       │   ├── services/          # 主进程业务服务
│       │   └── ipc/               # IPC handler 注册
│       ├── preload/               # contextBridge 暴露 window.nova（产物必须 index.cjs）
│       ├── shared/                # 主/渲染共享类型（order.ts / buy.ts / member.ts / pos.ts …）
│       └── renderer/src/
│           ├── router.tsx         # 路由与登录守卫：analysis / buy / orders / inventory / members / marketing / data
│           ├── pages/<domain>/    # 页面（一个域一个目录，页面只做编排）
│           ├── features/<domain>/ # 业务域：api.ts（视图模型转换）+ queries.ts + 弹框/抽屉/列定义
│           │                      # analysis / auth / buy / data / inventory / marketing / members / oplog / orders / settings
│           ├── components/
│           │   ├── ui/            # shadcn 组件（勿手改样式约定）
│           │   ├── common/        # DataTable / DetailTable / EmptyState / FilterBar / SheetDrawer / StatCard …
│           │   ├── layout/        # AppShell 等骨架
│           │   └── ai-elements/   # 本地化 ai-elements
│           ├── lib/               # pos.ts（IPC 请求入口）/ format.ts / pricing.ts / ipc.ts …
│           ├── stores/            # zustand：auth 等
│           ├── hooks/ / test/
│           └── globals.css        # Tailwind v4 主题 token
│
├── nova-pos-server/           # POS API（门店端）
│   └── src/
│       ├── index.ts               # Express 装配、middleware、路由挂载
│       ├── config.ts              # ~/.nova/server-config.json；默认端口 9577
│       ├── logger.ts              # 滚动日志
│       ├── model/                 # Sequelize 模型 + schema.sql（表结构唯一来源）
│       ├── router/                # *-controller.ts 即路由：order / buy / inventory / member / marketing / data / common / auth / store-chart / user
│       ├── middleware/            # context.ts / internal-auth.ts（内部白名单）/ rate-limit.ts
│       ├── auth/                  # jwt.ts / password.ts
│       ├── service/               # order-number.ts（订单号生成 + 唯一冲突重试）
│       ├── utils/                 # db.ts（withTransaction）/ query.ts（分页、排序、IN 分批、zod 解析）
│       └── scripts/               # 运维脚本（如 checkOrderPricing）
│
├── nova-mall-server/          # 会员端 API（小程序 / 手机端会员场景）
│   └── src/
│       ├── config.ts              # ~/.nova/mall-config.json；默认端口 9566
│       ├── model/                 # 与 POS 同库模型（order / member / inventory / marketing …）
│       └── router/                # activity / balance / coupon / member / order / score / common
│
├── nova-mobile/               # 门店端手机 App（Expo）
│   ├── app/                       # expo-router 文件式路由：_layout / index / login / (tabs) / buy / inventory / member / order / logs / settings
│   └── src/
│       ├── lib/                   # api.ts（HTTP + token）/ pos.ts（业务数据层）/ pricing.ts / money.ts / storage.ts / types.ts
│       ├── components/ / stores/ / theme/
│       └── AGENTS.md              # Expo 专项规则
│
├── nova-miniapp/              # 会员小程序（微信，Taro + React + NutUI）
│   ├── config/index.ts            # designWidth 375、alias `@→src`、assets 拷贝、接口 baseURL
│   ├── project.config.json        # 微信开发者工具配置（加载 dist/）
│   └── src/
│       ├── app.tsx / app.config.ts / app.scss   # 启动静默登录、15 个页面、原生 tabBar、NutUI 样式
│       ├── pages/<domain>/        # index / discover / mine / orders / order-detail / activity-detail / points / draws
│       │                          # coupons / balance / redeem / redeem-records / draw / product / profile-edit
│       ├── components/            # 业务组件（BannerRail / CategoryGrid / BrandStoryCard / Wheel / RedeemPanel …）
│       ├── services/              # request.ts（统一请求 + token）/ auth / home / profile / order / records / engage / redeem
│       ├── stores/user.ts         # zustand：静默登录、手机号登录、资料刷新、登出
│       ├── hooks/usePagedList.ts  # 分页列表（reachBottom 加载更多）
│       ├── utils/                 # format.ts（金额/积分/时间）/ wheel.ts（转盘角度）
│       ├── types/                 # api.ts（与 /mini/* 契约对齐）
│       └── constants/             # token key、接口地址、兜底门店、签到积分
│
└── nova-extension/            # Chrome MV3 商品图片采集插件
    ├── manifest.json              # MV3；background ESM、content script、popup
    ├── scripts/build.mjs          # esbuild（background/content/popup）+ Tailwind CLI + 静态资源拷贝
    └── src/
        ├── background.ts / content/ / popup/ / options/
        ├── lib/                   # 采集、款号核对、上传
        ├── panel/ / components/ / shared/ / styles/ / types/
```

### 2.4 路径别名（写 import 必须遵守）

`nova-desktop`（`electron.vite.config.ts` + `tsconfig.web.json` / `tsconfig.node.json`）：

| 别名 | 指向 |
|---|---|
| `@main/*` | `nova-desktop/src/main/*` |
| `@preload/*` | `nova-desktop/src/preload/*` |
| `@shared/*` | `nova-desktop/src/shared/*` |
| `@renderer/*` | `nova-desktop/src/renderer/src/*` |

`nova-miniapp`（`config/index.ts` 的 `alias` + `tsconfig.json` 的 `paths`）：

| 别名 | 指向 |
|---|---|
| `@/*` | `nova-miniapp/src/*` |

### 2.5 领域约定（跨端必须一致）

- **订单类型**：`orderType` 取值 `sale` / `normal` / `income`（会员充值单为 `income`）。订单列表默认过滤 `normal`，但桌面列表需同时展示 `income` 并把「应付金额」列显示为「会员充值」；桌面端视图模型用 `isRecharge` 标记。
- **订单号**：服务端统一用 `service/order-number.ts` 的 `createOrderWithGeneratedSn`（唯一索引 + 冲突重试），**不要在控制器里手写订单号**。
- **金额**：服务端 DECIMAL 走字符串返回，桌面端在 `features/<domain>/api.ts` 统一转 number；不要在各页面就地 `Number(x)` 散落转换。
- **买单（收银台）**：允许议价 / 抹零——实收可低于应收；订单 `actualAmount = min(实收, 应收)`，空值按应收。
- **库存不足不阻断**：门店实体可能有货、库存数据可能不准，买单允许负库存销售，服务端只记日志；收银台仅提示警告，商品仍加入清单。
- **提交防重**：桌面 `BuyPage` 与手机 `buy` 页都用 `submitLockRef`（同步锁）+ loading 双重防抖，改动时不要移除。
- **列表分页**：服务端 `DEFAULT_PAGE_SIZE = 20`；桌面页面不要把 `pageSize` 写死成 10，统一 20。
- **小程序接口**：会员端统一走 `nova-mall-server` 的 `/mini/*`，成功 `{ success: true, data }`、失败 `{ success: false, code, message }`，列表额外带 `count`；不要复用面向小程序的旧 `/member/*` 裸返回结构。
- **积分兑换**：v1 兑换成功后订单固定为 `pending_pickup`（到店自提），核销由 POS 二期接入；扣积分与写兑换单必须在同一事务，`requestId` 保证重试幂等。
- **抽奖**：每次抽奖扣固定积分并受每日次数限制，`requestId` 唯一索引保证重试不重复扣分；奖品列表接口必须返回 `id`，客户端据此定位转盘扇区。
- **入会赠送**：小程序首次登录自动注册会员、POS 新增会员均赠送 10 积分并写 `MemberScore`（reason=`入会赠送`）；新会员（无 `orderType='normal'` 购物记录）首次抽奖直接发「满 100 减 5 元券」，不走加权抽取。

---

## 3. Restrictions（约束与禁忌）

### 3.1 语言与代码风格

- **一律 TypeScript，禁止新增 `.js` / `.jsx`**。例外：`nova-extension/scripts/build.mjs`、`electron.vite.config.ts`、`vitest.config.ts`、`playwright.config.ts`、`eslint.config.js` 等工具配置。
- **关键实现必须写中文注释**（业务规则、边界条件、跨端约定、非直觉写法）。纯样板代码不必注释。
- 缩进 2 空格；引号与分号**跟随所在子项目现有风格**：
  - `nova-desktop`：单引号、**不加分号**；
  - `nova-pos-server` / `nova-mall-server`：单引号、**带分号**（Prettier 默认）；
  - `nova-mobile`：单引号、带分号；
  - `nova-extension`：双引号、不加分号；
  - `nova-miniapp`：单引号、**不加分号**。
- 禁止引入新的状态管理 / UI / HTTP / 表格库。已有选型：zustand、shadcn/ui + Radix、TanStack Query + TanStack Table、Express + Sequelize、expo-router。

### 3.2 UI 硬约束（桌面 / 手机）

- 桌面 UI **必须用 shadcn/ui（new-york，neutral 基色）**，新组件放 `src/renderer/src/components/ui/`；业务通用件放 `components/common/`，页面不要自造表格/空态/筛选条。
- 图标**统一 Lucide**（桌面 `lucide-react`，手机 `lucide-react-native`）；**禁止 emoji 图标、禁止手写内联 SVG 图标**。
- 颜色用语义 token（`text-muted-foreground`、`bg-card`、`border-border`…），不要硬编码色值；间距遵循 4px 基线。
- 列表统一用 `DataTable`（表头 sticky、内置加载/空/错误三态）；空态用 `EmptyState`（icon + title + description），**不要用一行文本充当空态**；筛选区用 `FilterBar`。
- 页面根容器保持 `flex h-full flex-col gap-3 overflow-auto p-4` 的骨架，表格区域靠 `flex-1 min-h-0` 约束高度，让滚动只发生在表格内部。

小程序（`nova-miniapp`）另有约束：

- **能落 NutUI 组件的场景必须用 NutUI**（`Button / Cell / CellGroup / Grid / Segmented / Input / DatePicker / Popup / Tag / Empty / Skeleton / Progress …`），不要用 `View` + 手写样式复刻已有组件。
- 图标统一 `@nutui/icons-react-taro`；禁止 emoji 图标、禁止手写内联 SVG 图标（转盘等自绘图形除外）。
- 视觉以 [demo/miniapp.html](demo/miniapp.html) 为唯一基准：品牌红 `#ff0f23`（深色 `#c7001a`、浅底 `#fff1f2`），页面底色 `#f4f4f5`。
- 单个页面只做编排，重复流程抽到 `src/components/<Feature>/`（如 `RedeemPanel`）；跨页复用逻辑放 `src/services` / `src/hooks`。

### 3.3 Electron 进程边界（极易踩坑）

- **渲染进程是浏览器环境**：`contextIsolation: true`、无 `nodeIntegration`。**禁止**在 `src/renderer/**` 使用 `fs` / `path` / `child_process` / `require` / `mysql2` 等 Node 能力。
- 渲染端访问 POS 服务**只能**通过 `window.nova.pos.request`（`features/*/api.ts` 调用 `lib/pos.ts`）。
- **新增 POS 接口的三步**（缺一不可）：
  1. 服务端 `src/router/<域>-controller.ts` 加路由；
  2. `docs/api-contract.md` 同步契约；
  3. 桌面端 `src/main/api/endpoints.ts` 白名单按 `'METHOD /path'` 精确登记（**否则渲染层会直接报未授权**）。
- **preload 产物必须是 `.cjs`**（`electron.vite.config.ts` 已固定 `format: cjs`），不要改成 ESM。
- **改动 `src/main/**` 或 `src/preload/**` → 必须完全重启桌面端**（退出进程后重新 `npm run dev`）。**仅改 `src/renderer/**` → HMR 即可**。改完自行判断是否需要提醒用户重启。
- 桌面常驻 dev 进程可能残留 `node dist/index.js` / electron 子进程，端口冲突时先清理再重启。

### 3.4 服务端约束

- 请求体校验统一 **zod**（`utils/query.ts` 的 `parseBody`），不要手写散乱 if 校验。
- 分页 / 排序统一走 `resolvePagination`、`resolveOrderBy`（字段白名单），**禁止再出现 `Sequelize.literal` 拼接**。
- 多表写入必须包在 `withTransaction`（`utils/db.ts`）里；订单号生成靠唯一索引 + 重试兜底。
- 大 IN 查询用 `findAllByInChunks`，避免一次性 IN 上千条；修 N+1。
- 内部接口鉴权在 `middleware/internal-auth.ts` 白名单；写接口默认拒绝，新增必须显式登记。
- 上传接口需带 `x-upload-token` 头并校验文件头（JPEG），不要放开成任意文件。
- 表结构以 `src/model/schema.sql` 为唯一来源；结构变更同时补 `migrations/*.sql`（人工执行，注意历史数据去重，如订单号唯一索引）。

### 3.5 数据与跨端一致性

- 用户运行数据落在 `~/.nova/`（`server-config.json`、`api-config.json`、`mall-config.json`、上传目录、日志等），**禁止提交**。
- 桌面端与 POS 服务端的类型对不上时，以服务端返回字段为准，在 `features/*/api.ts` 做映射；字段名不一致曾导致过 `undefined` 显示 bug。
- 改 `nova-desktop/src/shared/**` 类型时，同时检查引用它的渲染层与主进程（`typecheck:node` + `typecheck:web` 都要过）。

### 3.6 构建与依赖

- 各子项目独立 `node_modules`，**不要建立 workspace / 根级 package.json**；也不要跨子项目相对路径引用源码。
- 不要提交构建产物：`dist/`、`out/`、`release/`、`android/`、`ios/`、`*.tsbuildinfo`、`test-results/`（根 `.gitignore` 已覆盖）。
- 手机端新增依赖必须 `npx expo install`；插件端构建产物是 `dist/`（Chrome 加载目录）。
- 小程序新增依赖走 `npm install`；**不要引入 NutUI 之外的 UI / 状态管理 / HTTP 库**，产物 `dist/` 用微信开发者工具加载。
- **禁止捏造文件**：写完文件立刻用 `ls` / `git status` 核实真实存在。

### 3.7 提交前自检

- 改动涉及哪个子项目就跑哪个的 `typecheck`（桌面端另可跑 `lint` / `test`）；**不得跳过**。
- 所有子项目开启 `strict`；桌面端额外开 `noUnusedLocals` + `noUnusedParameters` + `noUncheckedIndexedAccess`（未使用变量/导入直接报错）。
- 桌面端改渲染层交互后建议真机（Electron 窗口）点一遍：表格滚动、抽屉、分页、登录态。

---

## 4. Standards（流程规范）

- **提交信息用 Conventional Commits**，描述中文，例：`feat: 订单详情商品空态`、`fix: 买单允许超库存销售`、`refactor: 服务端分页封装`。
- **改动完成固定动作**：`typecheck`（涉及的全部子项目）→ 本地真实环境验证（桌面看 Electron 窗口 / 手机看 Expo / 插件在 `chrome://extensions` 重载 `dist/` / 服务端看日志）。
- **本地端口（务必用真实端口，本项目没有 3000）**：
  - POS 服务：`http://127.0.0.1:9577`（`~/.nova/server-config.json` 的 `server.port` 可覆盖）
  - 会员端服务：`http://127.0.0.1:9566`（`~/.nova/mall-config.json`）
  - 桌面端渲染层 dev：`http://localhost:5173`（electron-vite 默认）；调试体验直接用 Electron 窗口
  - 手机端：Expo 启动后按提示选择模拟器/真机；默认连 `http://127.0.0.1:9577`，可在 App 设置页改
  - 会员小程序：`nova-miniapp` 构建产物 `dist/` 用微信开发者工具打开；接口默认 `http://127.0.0.1:9566`
  - MySQL：默认 `3306`
- **脚本命名统一**：`dev` / `build` / `start` / `typecheck` / `lint` / `test` / `pack`；新增脚本在本文档同步登记。
- **文档同步**：目录结构、端口、命令、接口契约（`docs/api-contract.md`）发生结构性变更时，同一提交内更新本 `AGENTS.md` 与相关文档。
