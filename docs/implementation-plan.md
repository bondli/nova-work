# Nova 实施计划与组件方案（评审稿）

> 版本：v0.1　待评审  
> 日期：2026-10-26  
> 依据：[产品方案](./product-plan.md)、[技术方案](./tech-plan.md)、`demo/desktop.html`（已评审视觉基线）  
> 范围：六个独立工程；本文件重点展开桌面端（P2/P3），其余端给出组件与复用策略  
> 状态：**方案评审，不进入编码**

---

## 0. 本文件回答什么

1. demo 里 review 好的效果，如何一比一落到 shadcn/ui + AI Elements 上；
2. 桌面端每个页面由哪些组件构成、组件之间谁依赖谁、状态与数据放在哪一层；
3. Agent / 经营分析子系统照搬 nexa 的**边界**（哪些搬、哪些删、哪些新增）；
4. 质量如何被"卡住"，而不是靠事后 review；
5. 阶段怎么切、每个阶段你 review 什么。

不回答：需求变更。产品口径以 `product-plan.md` 为准；如实施中发现冲突，先改文档再改代码。

---

## 1. 不可协商项（实施红线）

| # | 红线 | 落地方式 |
|---|---|---|
| 1 | **demo 是唯一视觉基线** | 每个页面以 demo 截图做像素对照；组件尺寸、间距、圆角、字号、颜色不在实现时"顺手优化" |
| 2 | **shadcn 已有的交互必须用 shadcn** | Dialog / Sheet / Popover / Calendar / Select / Switch / Tabs / Table / Badge / DropdownMenu / ToggleGroup / Collapsible 全部用 `components/ui`，禁止手写同类弹层与下拉 |
| 3 | **禁止 div/span 堆 UI** | 页面层只做组合；任何重复两次以上的视觉块必须提升为组件；见 §10 规则 R1–R10 |
| 4 | **Agent 前端必须用 AI Elements** | 消息流、输入框、工具卡、推理、计划、产物卡全部来自 `components/ai-elements`，业务绑定由我们自己的 store 注入（不引入 Vercel AI SDK 的 `useChat`） |
| 5 | **进程边界** | Agent、MySQL、SQLite、文件、密钥、定时器只在主进程；渲染进程仅经 preload 白名单 IPC |
| 6 | **Agent 只读** | 只读账号 + 工具白名单 + SELECT 校验 + 单结果 ≤ 200 行 + 10s 超时，四层同时生效 |
| 7 | **TypeScript strict** | 全工程 `strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`；禁止 `any`（确需时 `unknown` + 类型守卫） |
| 8 | **包名与脚本** | 产物 `DaveBella`；所有工程统一 `npm run dev / build / pack` |
| 9 | **单店、两角色** | 不写多门店分支；仅管理员 / 导购员；导购员不可见进货价、成本、毛利额、毛利率 |
| 10 | **不改需求** | 交互歧义先登记到 §12 待确认项，评审后再实现 |

---

## 2. 设计系统落地（demo → Tailwind v4 / shadcn token）

### 2.1 初始化参数

```
shadcn init
  style: new-york
  baseColor: neutral
  cssVariables: true
  iconLibrary: lucide
  typescript: true
  rsc: false
```

- Tailwind v4（CSS-first），`@theme inline` 映射 shadcn 变量，不写 `tailwind.config.js`。
- 字体：`Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`。
- 图标：仅 `lucide-react`。品牌 logo 使用正式 SVG 资产（demo 中的购物袋路径），不放进 `icon` 通用库。

### 2.2 Token 对照表（light）

demo 的 CSS 变量与 shadcn 变量不是一一对应，按下表覆盖 `globals.css`：

| shadcn 变量 | 值 | 来源（demo.css） |
|---|---|---|
| `--background` | `#f4f4f5` | `--bg` |
| `--foreground` | `#18181b` | `--fg` |
| `--card` / `--popover` | `#ffffff` | `--card` |
| `--card-foreground` | `#18181b` | `--fg` |
| `--primary` | `#4f46e5` | `--brand` |
| `--primary-foreground` | `#ffffff` | — |
| `--secondary` / `--muted` | `#f4f4f5` | `--bg` |
| `--muted-foreground` | `#71717a` | `--muted` |
| `--accent` | `#eef2ff` | `--brand-soft` |
| `--accent-foreground` | `#4338ca` | brand hover |
| `--destructive` | `#dc2626` | `--danger` |
| `--border` / `--input` | `#e4e4e7` | `--border` |
| `--ring` | `#4f46e5` | `--brand` |
| `--radius` | `0.5rem` | 控件 8px / 卡片 12px（`rounded-lg` / `rounded-xl`） |

自定义语义 token（新增，shadcn 没有）：

```css
@theme inline {
  --color-success: #16a34a;
  --color-success-soft: #ecfdf5;
  --color-warning: #d97706;
  --color-warning-soft: #fffbeb;
  --color-danger-soft: #fef2f2;
  --color-chart-primary: #4f46e5;
  --color-chart-secondary: #c7d2fe;
}
```

### 2.3 字号与密度

demo 正文是 13px，而设置里的「小 / 中 / 大」按产品口径标注为 12 / 14 / 16px（指的是界面基准字号，不是整页像素）。两者不是同一层概念，实施按以下方式统一：

1. **类型尺度按 demo 像素定义**，在 Tailwind v4 `@theme` 注册语义字号，页面禁止写 `text-[13px]`；每个字号 token 同时乘以根节点变量 `--font-scale`：

```css
@theme {
  --text-caption: calc(10px * var(--font-scale));   /* 时间、辅助说明 */
  --text-meta: calc(11px * var(--font-scale));      /* 副标题、表头辅助信息 */
  --text-ui: calc(12px * var(--font-scale));        /* 次级控件、表格正文 */
  --text-body: calc(13px * var(--font-scale));      /* 页面正文（demo 基准） */
  --text-title: calc(15px * var(--font-scale));     /* 页面标题、卡片主标题 */
  --text-metric: calc(22px * var(--font-scale));    /* 指标数值 */
}
```

2. **字号设置只缩放文字**：小 = 12/14 ≈ 0.857、中 = 1.0（默认）、大 = 16/14 ≈ 1.143，由渲染层写入 `<html>` 的 `--font-scale`。间距、图标与控件尺寸始终取 demo 像素，不再使用 `webContents.setZoomFactor()` 做整页缩放。
3. 数值统一使用 `tabular-nums`（demo 的 `.tnum`），封装为 `<Money>` / `<Count>`，不逐处写 `font-variant-numeric`。

> 说明：登录页品牌名等少量非 token 字号也在 `@theme` 中补了 `--text-brand`，保证字号设置对全站文字一致生效。

### 2.4 shadcn 组件清单（安装基线）

按 demo 实际用到的交互，安装以下原语（`npx shadcn@latest add ...` 一次装齐，之后只升级不改业务）：

| 分组 | 组件 |
|---|---|
| 基础 | `button` `input` `textarea` `label` `badge` `separator` `card` `skeleton` `avatar` `tooltip` |
| 浮层 | `dialog` `alert-dialog` `sheet` `popover` `dropdown-menu` |
| 表单 | `select` `checkbox` `radio-group` `switch` `calendar` `form` `toggle-group` |
| 布局 | `tabs` `collapsible` `scroll-area` |
| 数据 | `table` `chart` `progress` |
| 反馈 | `sonner` `alert` |

依赖：`react-hook-form`、`zod`、`@hookform/resolvers`、`recharts`、`date-fns`、`react-day-picker`（由 calendar 引入）、`@tanstack/react-table`。

暂不安装：`drawer`（vaul 底部抽屉，桌面端用 `sheet`）、`sidebar`（shadcn 侧栏体系与本应用 78px rail 不一致）、`command`、`menubar`、`navigation-menu`、`carousel`、`resizable`。若后续确有需要再单独评审，避免装而不用。

### 2.5 明确不做

- 不做品牌色自定义面板（主题只有 跟随系统 / 亮色 / 暗黑 三选）；
- 不做 demo 之外的"视觉优化"（阴影、渐变、动画）；
- 不引入 Ant Design、MUI、Chakra 等第二套组件体系；
- 不引入 CSS-in-JS。

> **待确认 D1**：demo 未定义暗黑模式的具体色值。建议沿用 shadcn neutral dark（`--background #09090b`、`--card #18181b`、`--border #27272a`）+ `--primary #6366f1`，仅做变量层，不单独设计页面。

---

## 3. demo 元素 → 组件映射（评审重点）

| demo 视觉元素 | 现实现 | 实施组件 | 说明 |
|---|---|---|---|
| 左侧 78px 导航 | `.rail-btn` 手写 | `AppRail` + `Button variant=ghost` + `Tooltip` | 顶部购物袋品牌图标（点击回经营分析），底部齿轮打开设置；无用户头像 |
| 顶部 56px 栏 | 手写 header | `AppHeader` | 左侧两行文字 Logo（Dave & Bella / v1.0.0）+ 分隔线 + 页面标题；右侧刷新 / 通知 / 个人中心；无门店切换、无同步、无全局搜索 |
| 页面标题 + 副标题 | `#page-title` | `PageHeader` | title / description / actions 三槽 |
| 白色圆角卡片 | `.card` | `Card` + `CardHeader/Content/Footer` | 12px 圆角来自 `--radius` 的 `xl` |
| 指标卡 | 手写 4/6 宫格 | `StatCard`（内部 `Card`） | label / value / icon / delta |
| 筛选条 | 手写 flex | `FilterBar`（`Card` + 子组件） | 查询 / 重置 / 右侧主操作 |
| 日期区间按钮 | `toggleRangePopup` | `DateRangePicker`（`Popover` + `Calendar mode="range"` + `Button`） | 双月、周一为首日、中文 |
| 表格 | `<table class="table">` | `DataTable`（`Table` + TanStack Table + `Badge` + `DropdownMenu`） | 操作列表头必须为「操作」 |
| 分页 | 手写按钮 | `PaginationBar`（`Pagination` 组合） | 总数 + 页码 + 每页条数 |
| 状态徽标 | `.badge-*` | `Badge` + `StatusBadge` | success / warning / danger / brand / neutral 五态 |
| 右侧抽屉（订单/会员/产物） | `#app-shell` 内手写 | `Sheet side="right"`，`fullHeight` 变体 | 从应用顶部拉出，覆盖整高；不是页面局部 |
| 通用弹窗（设置/日志/改密/退出） | `.dialog` | `Dialog` / `AlertDialog` | 设置 880×640；退出用 AlertDialog |
| 分段筛选（今天/7/30/自定义） | `.seg` | `ToggleGroup type="single"` | 同一时间只选一个 |
| 任务分组折叠 | `toggleGroup` | `Collapsible` + `Button` | 标题整行可点 |
| 开关 | 手写 span | `Switch` | 开机自启、通知、积分/余额抵扣 |
| 下拉选择 | `<select>` | `Select` | 支付方式、导购员、活动类型、提示音 |
| 行内下拉菜单 | `#user-menu` | `DropdownMenu` | 头像菜单、表格「更多」 |
| 通知浮层 | `#notif-menu` | `Popover` + `ScrollArea` + `Badge` | 未读红点用 `Badge` 圆点变体 |
| 表单（登录/注册） | `renderAuth` | `Form` + `react-hook-form` + `zod` + `Input` + `Label` + `Button` + `Alert` | 校验文案内联 |
| 轻提示 | `showToast` | `sonner` | 统一 `toast.success / error / info` |
| 加载 | 手写 spinner | `Skeleton` / `Loader`（AI Elements） | 表格骨架、流式加载 |
| 空态 | 手写居中 | `EmptyState` | icon + title + description + action |
| 图表（数据中心） | 手写柱图 | `ChartContainer`（shadcn chart / Recharts）+ 自定义柱与标签 | 视觉必须贴 demo：无 Y 轴、无网格、柱顶标签 |
| 对话流 | 手写气泡 | AI Elements `Conversation` / `Message` / `Response` | 见 §7 |
| 输入区 | 手写 textarea | AI Elements `PromptInput` | 附件、技能、默认范围提示、发送 |
| 工具调用卡 | `<details>` | AI Elements `Tool` | 折叠、状态、耗时、结果 |
| 产物卡 | 手写按钮 | `ArtifactCard`（`Card` + `Button`） | 图标按类型、版本号 |
| 会员/商品缩略图 | `.swatch` | `Avatar` + `AvatarFallback` | 首字回退 |

### 3.1 被替换的"伪组件"

demo 里以下块必须拆成独立组件，不允许在页面里内联重复：

- 表格操作列 → `TableActions`（统一 `DropdownMenu` 或文字按钮组，按 demo 用文字按钮）；
- 金额/数量 → `Money` / `Count`；
- 指标卡 → `StatCard`；
- 抽屉外壳 → `SheetDrawer`；
- 筛选行 → `FilterBar`；
- 状态徽标映射 → `StatusBadge`（集中维护文案与色板）；
- 键值行（应收/积分抵扣…）→ `FieldRow`。

---

## 4. 工程与目录

### 4.1 六工程与阶段映射

| 工程 | 阶段（对齐 tech-plan §14） | 本计划细化 |
|---|---|---|
| nova-pos-server / nova-mall-server | P1 | 先平迁、冻结接口契约 |
| nova-desktop | P2 / P3 | D0–D5（见 §11） |
| nova-extension | P4 | 复用 API client 与款号规则 |
| nova-mobile | P5 | 复用契约，不复用 UI |
| nova-miniapp | P6 | 沿用 Taro 实现 |

### 4.2 nova-desktop 目录（feature-first）

```
nova-desktop/
├─ package.json                    # scripts: dev / build / pack / typecheck / lint / test / test:e2e
├─ electron.vite.config.ts         # 三段构建 + 别名 @main @preload @shared @renderer
├─ components.json                 # new-york / neutral / lucide
├─ electron-builder.yml            # productName: DaveBella
├─ src/
│  ├─ main/
│  │  ├─ index.ts                  # 窗口、生命周期、IPC 注册
│  │  ├─ window.ts
│  │  ├─ ipc/                     # 一个域一个文件，只做 zod 校验 + 调 service
│  │  │  ├─ agent.ts  auth.ts  settings.ts  workspace.ts  job.ts  notify.ts  system.ts
│  │  ├─ agent/
│  │  │  ├─ runtime.ts            # pi-agent-core 封装（照搬 nexa，裁剪）
│  │  │  ├─ events.ts             # AgentEvent → webContents.send
│  │  │  ├─ prompt.ts             # 系统提示词 + 表结构快照注入
│  │  │  ├─ tools/                # 业务查询工具（见 tech-plan §11）
│  │  │  └─ workspace.ts          # ~/.nova/workspaces/<sessionId>/ 沙箱
│  │  ├─ db/
│  │  │  ├─ sqlite.ts / schema.ts # 会话、消息、runs、产物索引、通知、Agent 审计
│  │  │  ├─ mysql.ts              # 只读连接池
│  │  │  └─ sql-guard.ts          # SELECT-only / 限流 / 超时（单测覆盖）
│  │  ├─ services/
│  │  │  ├─ settings.ts           # ~/.nova/settings.json + safeStorage
│  │  │  ├─ scheduler.ts          # node-cron，读 settings.task.schedule
│  │  │  ├─ notifier.ts           # 系统通知 + 渲染进程红点事件
│  │  │  ├─ artifact-server.ts    # 本地静态预览（127.0.0.1 随机端口）
│  │  │  └─ auth.ts               # 登录态与 token（只存主进程）
│  │  └─ api/client.ts            # nova-pos-server fetch 封装
│  ├─ preload/index.ts             # contextBridge: window.nova
│  ├─ shared/
│  │  ├─ ipc-channels.ts           # 通道常量 + 参数/事件类型
│  │  └─ types/                    # User / Role / AgentEvent / Settings ...
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx  app.tsx  router.tsx  globals.css
│        ├─ components/
│        │  ├─ ui/                 # shadcn 原生，只在升级时改
│        │  ├─ ai-elements/        # AI Elements（展示层，不含请求）
│        │  ├─ common/             # DataTable / DateRangePicker / StatCard / EmptyState ...
│        │  └─ layout/             # AppShell / AppRail / AppHeader / PageHeader
│        ├─ features/
│        │  ├─ analysis/  buy/  orders/  inventory/  members/  marketing/  data/
│        │  ├─ settings/  oplog/  notifications/  auth/
│        ├─ pages/                 # 薄路由：只 render 对应 feature 页面
│        ├─ stores/                # Zustand（仅 UI + 流式状态）
│        ├─ hooks/                 # useAuth / usePermission / useFontSize ...
│        ├─ lib/                   # api-client / query-client / format / permissions / utils
│        └─ types/
```

feature 内部固定结构：

```
features/orders/
├─ OrdersPage.tsx
├─ api.ts                  # 该域请求函数（唯一 fetch 入口）
├─ types.ts
├─ columns.tsx             # TanStack 列定义
├─ hooks/
│  ├─ useOrdersQuery.ts
│  └─ useRefundMutation.ts
└─ components/
   ├─ OrderFilterBar.tsx
   ├─ OrderTable.tsx
   ├─ OrderDetailSheet.tsx
   ├─ ReconcileSheet.tsx
   └─ OrderGoodsSheet.tsx
```

规则：

- **pages 只做路由装配**，不写业务；页面组件放 feature 内；
- 跨域复用 2 次以上才提升到 `components/common`；
- 不用 barrel `index.ts` 汇总导出（避免循环依赖），直接按路径引入；
- `api.ts` 是组件唯一允许发起业务请求的地方；组件内禁止 `fetch`。

### 4.3 命名

- 组件 `PascalCase.tsx`，一个文件一个主组件；子组件同文件仅限"只在该组件出现且 < 30 行"。
- hook `useXxx.ts`；store `xxx-store.ts`；类型 `PascalCase`。
- 事件 props `onXxx`；布尔 props 用 `isXxx / hasXxx / showXxx`。

---

## 5. 组件分层与契约

### 5.1 分层

```
L0  components/ui          shadcn 原生（button/card/dialog/sheet/table/calendar…）
L1  components/ai-elements 对话展示原语（conversation/message/prompt-input/tool/…）
L2  components/common      业务通用（DataTable/DateRangePicker/StatCard/SheetDrawer…）
L3  components/layout      应用外壳（AppShell/AppRail/AppHeader/PageHeader）
L4  features/*/components  页面内组合（OrderTable/ReconcileSheet/StoreChart…）
L5  pages/*
```

依赖方向只允许向下（L5 → L4 → L3 → L2 → L1 → L0），同级 feature 之间不互相 import；共享需求提升到 L2。

### 5.2 共享组件契约

| 组件 | Props（核心） | 行为约束 |
|---|---|---|
| `DataTable<T>` | `columns, data, isLoading, empty, toolbar?, footer?, rowKey, onRowClick?, stickyHeader?` | 基于 TanStack Table；不内置请求；操作列由 `columns` 提供 |
| `DateRangePicker` | `value: {start,end}`, `onChange`, `presets?`, `numberOfMonths=2`, `align`, `disabled?` | `Popover` + `Calendar mode="range"`；点确定才提交；同一组件复用于订单/会员/营销/数据/日志 |
| `SheetDrawer` | `open, onOpenChange, title, description?, footer?, width='md'|'lg'|'xl', fullHeight=true, children` | `Sheet side="right"`；`fullHeight` 时 `top-0 h-screen`，从应用顶部拉出 |
| `StatCard` | `label, value, icon?, delta?, tone?, hint?` | 数值 `tabular-nums`；不写业务 |
| `StatusBadge` | `status: 'success'|'warning'|'danger'|'brand'|'neutral', children` | 统一色板与文案，禁止页面自定义颜色 |
| `Money` | `value, currency='CNY', sign?, bold?, className?` | 千分位 + 两位小数；负数红色 |
| `FieldRow` | `label, value, hint?, action?` | 用于应收/抵扣/配置摘要等键值行 |
| `FilterBar` | `children, actions?, onSubmit?, onReset?, loading?` | 回车提交；重置复位到默认值 |
| `FilterField` | `label?, children, className?` | 统一 label 与间距 |
| `EmptyState` | `icon, title, description?, action?` | 居中，最小高度 160px |
| `PaginationBar` | `total, page, pageSize, onPageChange, onPageSizeChange?` | 显示 `共 N 条`；页码折叠 |
| `PageHeader` | `title, description?, actions?` | 高度 56px，与 header 对齐 |
| `ConfirmDialog` | `open, title, description, confirmText, onConfirm, onOpenChange, destructive?` | 二次确认统一入口 |
| `ArtifactCard` | `name, kind: 'html'|'csv'|'image', size, version?, onOpen` | 图标按 kind 映射 |
| `SectionCard` | `title, description?, extra?, children` | 设置/详情页分节 |
| `CopyButton` | `value, label?` | 复制后 1.5s 回显 |

契约硬规则：

- 所有 props 用 `interface XxxProps` 显式声明，禁止 `React.FC` 与隐式 children；
- `className` 一律通过 `cn()` 合并，允许外部覆盖间距但不允许覆盖语义色；
- 组件不读 store（容器组件除外），展示组件只吃 props；
- 每个组件必须能独立在 Storybook/测试中渲染（不依赖全局初始化）。

---

## 6. 页面组件树

> 图：`docs/diagrams/02-desktop-components.html` 给出跨页面依赖总览；本节给出每个页面的完整树（权威版本）。

### 6.1 应用外壳

```
App
├─ AuthGate                     # 未登录 → AuthPage
├─ AppShell
│  ├─ AppRail (78px)
│  │  ├─ BrandIconButton        # 购物袋 SVG，点击回经营分析
│  │  ├─ NavItem ×7             # Button + Tooltip（经营分析/买单/订单/库存/会员/营销/数据）
│  │  └─ RailSettingsButton     # 底部齿轮 → SettingsDialog
│  ├─ AppHeader
│  │  ├─ TextLogo               # 两行：Dave & Bella / v1.0.0
│  │  ├─ Separator
│  │  ├─ PageTitleSync          # 与路由 meta 同步（标题/副标题）
│  │  ├─ RefreshButton
│  │  ├─ NotificationMenu       # Popover + NotificationList + Badge
│  │  └─ UserMenu               # DropdownMenu → 设置/操作日志/系统设置/改密/退出
│  ├─ Outlet (HashRouter)
│  └─ GlobalDialogs             # SettingsDialog / OpLogDialog / ChangePasswordDialog / LogoutAlert
└─ Toaster (sonner)
```

- 页面容器统一 `p-4 gap-3`，内容区 `overflow-hidden`，页面内滚动由卡片/表格承担（与 demo 一致）。
- 路由：`/analysis /buy /orders /inventory /members /marketing /data`，`/` 重定向 `/analysis`。

### 6.2 登录 / 注册

```
AuthPage
├─ AuthBrandPanel               # 左侧品牌区（渐变块 + 卖点 + 版本）
└─ AuthFormCard
   ├─ Tabs (登录 / 注册) 或 模式切换
   ├─ LoginForm / RegisterForm  # Form + zod
   └─ SubmitButton
```

- 登录字段：用户名、密码；注册：用户名、姓名、密码、确认密码（一致性 + 长度校验）。
- 成功后主进程保存 token；渲染进程只拿 `user{ id, name, role }`。
- 错误统一 `Alert` 展示，不用 toast 代替表单错误。

### 6.3 经营分析（核心，详见 §7）

```
AnalysisPage
├─ TaskListPanel (w-[280px])
│  ├─ PanelHeader               # 任务 + 数量 Badge
│  ├─ ScrollArea
│  │  └─ TaskGroup ×3           # Collapsible：经营分析 / 自由对话 / 归档任务
│  │     ├─ GroupHeader         # 标题 + note + 仅自由对话有 Button(+)
│  │     └─ TaskItem[]          # Button + icon + title + 状态点 + 时间
└─ ChatPanel
   ├─ ChatHeader                # 标题 / 状态 Badge / 数据范围 / 重新生成 / 产物按钮 / 更多
   ├─ ConversationView          # AI Elements Conversation + Message
   │  ├─ RunGroup
   │  │  ├─ UserMessage         # Message role=user
   │  │  ├─ AssistantMessage    # Message role=assistant → Response（markdown）
   │  │  ├─ ToolCallCard[]      # Tool（折叠、状态、耗时、结果）
   │  │  ├─ ReasoningCard       # Reasoning（可折叠）
   │  │  └─ ArtifactCards       # ArtifactCard[]
   │  └─ StreamingMessage       # StreamingPreview + Shimmer
   ├─ PromptInput               # AI Elements PromptInput
   │  ├─ PromptInputTextarea
   │  ├─ PromptInputToolbar     # 附件 / 技能 / 默认范围提示
   │  └─ PromptInputSubmit
   └─ InputHint                 # "可能会出错…写操作会先确认"
└─ ArtifactsPanel               # SheetDrawer（右侧整高）
   ├─ ArtifactTree / ArtifactList
   └─ ArtifactPreview           # iframe（HTML）/ Table（CSV）/ img
```

状态归属：

| 状态 | 归属 | 说明 |
|---|---|---|
| 任务分组、折叠、当前任务、抽屉开合 | `analysis-store` | UI 状态 |
| 会话、消息、run、流式增量 | `analysis-store`（照搬 nexa conversation-store 裁剪） | 来自 IPC 事件 |
| 产物列表 | `artifact-store` | `workspace.list` 派生 |
| 服务端业务数据 | TanStack Query | 经营分析页面不直接查业务接口，由 Agent 工具查询 |
| 未读通知 | `notification-store` | `notify:list` + 事件 |

### 6.4 买单

```
BuyPage
├─ BuyLeft
│  ├─ SkuScanBar                # Input + 扫码图标（回车加入）
│  ├─ CartCard
│  │  ├─ CardHeader             # 待售清单 / 数量 Badge / 清空 / 挂单 / 恢复挂单
│  │  ├─ CartTable              # DataTable（商品/单价/数量/折扣/小计/操作）
│  │  └─ CartSummary            # 件数 / 原价 / 优惠 / 应收
└─ BuyRight (w-[360px])
   ├─ MemberCard                # Avatar + 等级 Badge + 积分/余额/券 + 更换
   ├─ DiscountCard              # Switch 积分抵扣 / 余额抵扣；优惠券、整单折扣入口
   ├─ ClerkNoteCard             # 导购员 Select + 备注 Input
   └─ PaymentCard               # 支付方式 Select + 实收 Input + 确认收款
```

- 挂单：单笔快照存 electron-store（清单、会员、导购员）；恢复时若清单非空二次确认。
- 折扣列为可编辑 Input（默认 `6.0`），数量用 `QuantityStepper`（`Button` + 数字）。
- 实收标签 `whitespace-nowrap`，输入框 `min-w-0 flex-1`（demo 修复项）。
- 支付成功 → `AlertDialog`（不用页面跳转）。

### 6.5 订单

```
OrdersPage
├─ StatCard ×5                  # 订单数 / 商品数 / 订单金额 / 余额消耗 / 充值金额
├─ OrderFilterBar               # 订单号/手机号 + DateRangePicker + 导购 Select + 支付方式 Select + 查询/重置
│  └─ actions                   # 对账 / 订单商品（右侧）
├─ OrderTable                   # DataTable：订单号/时间/件数/实收/支付方式/导购/状态/打印/操作
├─ PaginationBar
├─ OrderDetailSheet             # 整高抽屉：订单摘要 + 商品表 + 金额汇总；footer 退货/换货/打印小票
├─ ReconcileSheet               # 对账：应收/实收/差异，确认收款
├─ OrderGoodsSheet              # 仅日期区间 + 组合表格 + 导出
├─ RefundSheet / ExchangeSheet  # 退货单 / 换货单
└─ PrintReceiptDialog           # 小票预览 + 系统打印
```

- 导出**只在**订单商品抽屉内出现（demo 与产品方案一致）。
- 表格操作列仅「明细」；退货/换货/打印在明细抽屉底部。
- 退货/退款对导购员开放，不做角色限制。
- 组合表格的列定义放 `order-goods-columns.tsx`，导出复用同一列定义（避免两套字段映射）。

### 6.6 库存

```
InventoryPage
├─ StatCard ×4                  # 款式总数 / 库存总量 / 已售总数 / 断码款数
├─ InventoryToolbar (Card)
│  ├─ ToggleGroup               # 全部库存 / 断码(n) / 热销（作为筛选，不是路由）
│  ├─ SearchInput               # 款号 / SKU / 品名
│  └─ actions                   # 商品流水 / 批量操作 DropdownMenu（批量入库/批量退库/单个入库）
├─ InventoryTable               # DataTable：商品/SKU/颜色/尺码/库存/零售价/成本/最近销售/操作
├─ PaginationBar
├─ SkuRecordSheet               # 单款流水（行「流水」）
├─ BatchStockDialog             # 批量入库 / 批量退库 / 单个入库
├─ SkuEditorDialog              # 编辑商品/价格；内含 ProductImageManager（九宫格、上传/替换/删除）
├─ ProductImagePreview          # Dialog 大图
└─ ProductImageManager          # 插件采集图片直接生效，同款覆盖
```

- 导购员：进货价、成本相关列在 `columns.tsx` 层按 `usePermission()` 过滤，同时服务端也已裁剪（双保险）。
- 库存为 0 显示危险色、低于 10 显示警告色（由 `StatusBadge`/`StockCell` 统一处理）。

### 6.7 会员

```
MembersPage
├─ StatCard ×3                  # 会员总数 / 超级会员总数 / 会员余额
├─ MemberFilterBar              # 姓名/手机号 + 等级 Select + DateRangePicker(创建时间)；右侧 新增会员
├─ MemberTable                  # DataTable：会员/手机号/等级/积分/余额/累计消费/最近到店/操作
│  └─ 操作列                    # 详情（抽屉）/ 编辑 / 充值
├─ PaginationBar
├─ MemberDetailSheet            # 整高抽屉：头像+等级 → 积分/余额/累计消费/订单数 → Tabs(订单/积分/余额/优惠券)；footer 编辑/充值
├─ MemberEditorDialog
└─ IncomeBalanceDialog          # 充值
```

- 无右侧常驻详情（demo 已改为抽屉）。
- 手机号完整展示，不脱敏。

### 6.8 营销

```
MarketingPage
├─ MarketingStats               # 4 个 StatCard
├─ MarketingFilterBar           # 活动名称 Input + DateRangePicker + 活动类型 Select
├─ MarketingTable               # DataTable；操作：详情 / 编辑 / 下线 / 删除
├─ PaginationBar
├─ MarketingDetailSheet
├─ MarketingEditorDialog        # 新建/编辑共用，步骤内不含"优惠券"独立步骤
└─ OfflineConfirmDialog / RemoveConfirmDialog
```

- 无状态 Tab、无优惠券按钮、无复盘按钮（复盘通过自由对话触发）。

### 6.9 数据

```
DataPage
├─ DataRangeBar                 # ToggleGroup(今天/近7天/近30天/自定义) + DateRangePicker + 截止时间
├─ MetricGrid → StatCard ×6     # 订单金额/余额消耗/订单数量/售出商品/商品库存/会员余额
└─ StoreRevenueCard (Card)
   ├─ CardHeader                # 标题 + 返回按月（按天模式）
   ├─ MonthlyChart              # ChartContainer：销售额/成本双柱 + 利润率标签，点击月份下钻
   └─ DailyChart                # 按天柱图
```

- 无 AI 分析、无导购业绩。
- 图表数据由 `useStoreRevenueQuery(range)` 提供；下钻状态 `dataView` 放页面局部 state（不进 store）。

### 6.10 个人中心 Dialog 组

```
SettingsDialog (880×640)
├─ DialogHeader (标题 + 关闭)
├─ 左侧 SettingsNav             # 通用 / 任务 / 模型 / 数据
└─ 右侧 SettingsBody (ScrollArea)
   ├─ GeneralSettingsTab        # 外观三卡 / 字号三卡 / 开机自启 Switch
   ├─ TaskSettingsTab           # 三个时间 Input[type=time] + 通知 Switch + 提示音 Select
   ├─ ModelSettingsTab          # DeepSeek 卡：API Key / Base URL / 默认模型 / 测试连接
   └─ DataSettingsTab           # POS 地址/状态 + 只读库配置 + 表结构快照 + 工作目录
```

- 全部自动保存（debounce 400ms），无取消/保存按钮；底部仅提示保存状态。
- 定时任务时间仅管理员可编辑（`usePermission('admin')`），导购员只读。
- API Key 只在主进程解密后用于请求，渲染进程回显为掩码。

```
OpLogDialog
├─ DialogHeader
├─ OpLogFilterBar               # DateRangePicker + 类型 Select + 查询/重置
├─ OpLogTable                   # DataTable + PaginationBar
└─ DialogFooter                 # 仅「关闭」

ChangePasswordDialog            # Form：原密码/新密码/确认
LogoutAlert                     # AlertDialog
```

### 6.11 通知

```
NotificationMenu (Popover)
├─ NotificationHeader           # 未读数量 + 全部已读
├─ ScrollArea → NotificationItem[]
│  ├─ 未读圆点 / 标题 / 摘要 / 时间
│  └─ onClick → 跳转 /analysis?task=<id> 并标记已读
└─ NotificationFooter           # 查看全部（可选）
```

- 红点：`unreadCount > 0`；事件 `notify:event` 到达即 `queryClient.invalidateQueries(['notifications'])`。

---

## 7. Agent / 经营分析子系统

### 7.1 从 nexa 搬什么、删什么

| nexa 模块 | 处理 | 原因 |
|---|---|---|
| `main/agent/runtime.ts`、`llm-helper.ts`、`settings.ts` | **照搬**，改 provider 为 DeepSeek-only | Agent 循环与流式事件已稳定 |
| `shared/ipc-channels.ts` 的 session/workspace/settings 部分 | **照搬裁剪** | 通道命名一致，便于对照 |
| `renderer/stores/conversation-store.ts` | **照搬裁剪** 为 `analysis-store` | 消息/run/流式状态机成熟 |
| `components/ai-elements/*` | **照搬** | 展示层与业务解耦 |
| `features/chat/chat-shell.tsx` | **参考重写** | nexa 是多模式（free/project）与开发工具导向，nova 只有经营任务 |
| `features/chat/artifact-cards.tsx` | 改造为 `ArtifactCard` | 产物类型不同（HTML/CSV） |
| note / kb / memory / skill / connector / expert / relay / scheduled-page | **删除** | 首版不需要 |
| `job:*` 定时体系 | **改造**为固定三个任务 | 不允许用户自定义任务 |
| `main/agent/tools/*`（nexa 通用工具） | 删除，替换为零售工具 | 见 tech-plan §11 |

### 7.2 IPC 通道（nova 版）

```ts
// 渲染 → 主（invoke）
agent:session.create | send | pause | resume | delete | rename | archive
agent:list | agent:session.messages | agent:session.runs
agent:workspace.list | read | docs.list | preview-base
agent:attachment.read
settings:get | set          theme:get | set
job:list | job:runNow | job:runs        // 执行时间在 settings.task.schedule
notify:list | notify:read | notify:readAll
auth:login | register | logout | session | change-password
fs:open-folder | fs:open-path
```

```ts
// 主 → 渲染（event）
analysis:event   // AnalysisEvent（与 tech-plan §4.7.3 对齐）
notify:event     // NoticeEvent
auth:event       // 登录态失效
```

```ts
type AnalysisEvent =
  | { type: 'session.created'; sessionId; title; mode: 'schedule' | 'free' }
  | { type: 'session.title'; sessionId; title }
  | { type: 'session.status'; sessionId; status: 'running'|'paused'|'completed'|'failed' }
  | { type: 'run.start'; sessionId; runId }
  | { type: 'run.end'; sessionId; status: 'done'|'failed'|'stopped'; error? }
  | { type: 'message.start'; sessionId; messageId; role: 'assistant' }
  | { type: 'message.delta'; sessionId; messageId; delta }
  | { type: 'thinking.delta'; sessionId; messageId; delta }
  | { type: 'message.done'; sessionId; messageId; content; usage? }
  | { type: 'tool.start'; sessionId; toolCallId; name; input: unknown }
  | { type: 'tool.end'; sessionId; toolCallId; status: 'success'|'error'; summary; durationMs }
  | { type: 'plan.updated'; sessionId; steps }
  | { type: 'artifact.created'; sessionId; artifact: ArtifactMeta }
  | { type: 'workspace.files.changed'; sessionId }
  | { type: 'error'; sessionId?; message }
```

- 事件名与 tech-plan §4.7.3 完全一致，只新增 `session.* / plan.updated / workspace.files.changed / error`；不要另造第二套协议。
- 所有 invoke 入参在主进程用 zod 校验；返回值统一 `{ ok: true, data } | { ok: false, error: { code, message } }`。
- preload 只暴露 `window.nova.agent/settings/job/notify/auth/fs` 命名空间，不暴露 `ipcRenderer` 本体。

### 7.3 主进程职责

| 模块 | 职责 | 关键点 |
|---|---|---|
| `runtime.ts` | 创建/运行/暂停 session，转发事件 | 单 session 单 run，队列串行 |
| `agent/tools` | 零售查询工具 + 文件 + 产物 | 工具 JSON schema 与 tech-plan §11 对齐 |
| `db/mysql.ts` + `sql-guard.ts` | 只读查询 | 只允许单条 SELECT；禁止注释、`;` 多语句、INTO OUTFILE；`LIMIT ≤ 200`；10s |
| `services/scheduler.ts` | 三个 cron | 读 settings；应用启动时补跑当日错过任务（**D5**） |
| `services/notifier.ts` | 系统通知 + 红点事件 | 报告完成后触发；提示音可配 |
| `services/workspace.ts` | 会话目录与沙箱 | 路径规范化后必须仍在 `~/.nova/workspaces/<sessionId>` 内 |
| `artifact-server.ts` | HTML 预览 | 只读、随机端口、仅本机 |

**工具注册表**（与 tech-plan §11 一致，新增工具先改文档）：

| 工具 | 用途 |
|---|---|
| `get_business_overview` | 区间总览与对比 |
| `query_sales_trend` | 日/周/月趋势，≤ 90 点 |
| `query_orders` / `get_order_detail` | 订单查询与单笔明细 |
| `query_inventory` / `query_stock_flow` | 库存与流水 |
| `query_slow_moving` / `query_top_products` | 滞销与热销 |
| `query_members` / `get_member_profile` | 会员列表与画像 |
| `query_marketing` | 活动效果与核销 |
| `query_staff_performance` | 导购业绩（仅 Agent 内部使用，数据页不展示） |
| `detect_business_anomalies` | 异常检测（6 条规则） |
| `query_database` | 兜底只读 SQL（需 `reason`） |
| `read / write / edit / bash` | workspace 文件工具 |
| `publish_artifact` | 发布 HTML/CSV 产物 |

- 所有工具返回先裁剪再进上下文：列表 ≤ 50 行，超出落盘并返回路径；
- 成本/利润字段按会话角色剔除，工具层与 SQL 层同时生效。

### 7.4 AI Elements 清单

**已有（来自 nexa，直接复制）**

`conversation.tsx`（Conversation、ConversationContent）、`message.tsx`（Message、MessageAvatar、MessageHeader、MessageContent、MessageActions、Response、StreamingPreview）、`reasoning.tsx`、`tool.tsx`、`plan.tsx`、`task.tsx`、`shimmer.tsx`。

**需补齐（来自 Vercel AI Elements 官方，复制源码并去掉 `useChat`/AI SDK 依赖）**

| 组件 | 用途 | 改造点 |
|---|---|---|
| `prompt-input.tsx` | 输入区（textarea + toolbar + submit + attachments） | `onSubmit(value, files)` 由我们传入；不依赖 `status` 的 AI SDK 类型，改为本地 `isRunning` |
| `loader.tsx` | 流式加载 / 工具执行中 | 纯展示 |
| `suggestion.tsx` | 空态建议问题（自由对话新建时） | 点击回填 PromptInput |
| `code-block.tsx` | 工具结果中的 SQL / JSON | 只读高亮；不引入预览执行 |
| `sources.tsx` | 可选：报告引用条目 | 首版可不启用，先放目录不接线 |

**统一改造原则**

1. 删除 `ai` / `@ai-sdk/react` import，所有组件只接受受控 props；
2. 数据由 `analysis-store` 注入，组件内部不发请求；
3. 保留 shadcn 语义 token，不引入第二套颜色；
4. 每个组件补 `Props` 类型与最小单测（渲染 + 折叠交互）。

### 7.5 对话状态机

```
idle → running → (paused ⇄ running) → completed | failed
```

- `message.delta` 按 30–50ms 批量 flush，避免每 token 一次 React 更新；
- 流式期间 `Conversation` 自动滚底，用户上滚后暂停自动滚动，出现"回到底部"按钮；
- 工具卡与推理块默认折叠，失败自动展开；
- `artifact.created` 只更新产物区，不插入消息流（产物卡跟随当前 assistant 消息渲染）。

### 7.6 经营分析的特殊规则（来自产品方案）

- 三个定时任务固定存在，不可删除；仅可改执行时间；
- 任务分组顺序固定：经营分析 / 自由对话 / 归档任务；仅自由对话可新建（+）；
- 左栏无搜索、无顶部新建；
- 报告生成 → 通知红点 → 点击直达任务并标已读；
- 产物抽屉从应用顶部拉出，覆盖整高；
- 每个会话独立 `~/.nova/workspaces/<sessionId>/`。

---

## 8. 数据层

### 8.1 Query Key 规范

| 域 | key | 失效触发 |
|---|---|---|
| 订单 | `['orders', filters]` / `['order', no]` | 买单成功、退货/退款/换货、对账确认 |
| 订单商品 | `['order-goods', range]` | 导出前手动 refetch |
| 库存 | `['inventory', filters]` / `['inventory-sku', sn]` / `['inventory-records', sn]` / `['inventory-hot']` / `['inventory-nostock']` | 买单成功、入库/调拨、编辑商品 |
| 会员 | `['members', filters]` / `['member', id]` / `['member-orders'|'member-points'|'member-balance'|'member-coupons', id]` | 充值、编辑、买单绑定会员 |
| 营销 | `['marketing', filters]` / `['marketing-activity', id]` | 新建/编辑/下线/删除 |
| 数据 | `['data-overview', range]` / `['data-store-month', range]` / `['data-store-day', month]` | 买单成功、退款 |
| 操作日志 | `['oplogs', range, type, page]` | 打开弹窗、翻页 |
| 通知 | `['notifications']` | `notify:event` |
| 分析任务 | `['analysis-tasks']` | `session.created` / `session.title` / `session.status` |

- 默认 `staleTime: 30s`、`retry: 1`、`refetchOnWindowFocus: false`。
- 写操作使用 `useMutation` + `invalidateQueries`，禁止手动维护列表副本。
- 查询参数统一序列化（日期 `YYYY-MM-DD`），避免缓存键抖动。

### 8.2 状态分层

| 层 | 内容 | 工具 |
|---|---|---|
| 服务端缓存 | 业务列表/详情 | TanStack Query |
| 会话与流 | sessions / messages / runs / streaming | Zustand `analysis-store` |
| UI 偏好 | 当前选中任务、抽屉开合、通知已读、字号/主题 | Zustand `ui-store` / `settings-store` |
| 表单 | 登录、编辑、充值、筛选草稿 | react-hook-form（局部） |
| 主进程 | token、API key、settings、SQLite、cron | 不进渲染进程内存 |

### 8.3 API 客户端

- 单一 `lib/api-client.ts`，自动附加 `Authorization`、`X-Client-Version`、`X-Client-OS`、`X-Request-Id`；
- 401 → 主进程清 token 并广播 `auth:event` → 渲染端回登录页；
- 统一错误结构 `{ code, message, details? }`；toast 文案由 `error-message.ts` 集中映射，页面不写零散文案；
- 超时 15s；GET 失败重试 1 次，写操作不重试（幂等键由服务端保证）。

---

## 9. 复杂模块专项

### 9.1 经营分析（最复杂）

风险点：流式渲染性能、事件乱序、产物与消息对应、定时任务补跑、抽屉内 HTML 预览安全。

方案：

1. 事件在主进程按 `sessionId + seq` 单调递增，渲染端丢弃 `seq` 倒退的事件；
2. 流式文本用 `requestAnimationFrame` 批量合并；
3. 消息与产物通过 `messageId` 关联，产物卡只读 `artifact.messageId`；
4. HTML 预览用独立 `BrowserView`/iframe + `sandbox="allow-scripts"`，静态服务仅绑定 `127.0.0.1`；
5. 定时任务在主进程 cron 触发，写 session 后通过 `notify:event` 通知；启动时检查当天是否遗漏（D5）。

### 9.2 买单

- 购物车状态放 feature 内 `useBuyCart`（Zustand slice 或 `useReducer`），不污染全局；
- 挂单只允许一笔；恢复前二次确认；
- 会员权益（积分/余额/券）计算集中到 `lib/pricing.ts`，纯函数 + 单测（含边界：余额不足、券门槛、折扣叠加规则以旧实现为准）；
- 提交成功后一次性失效订单/库存/会员/数据四域，并清空购物车。

### 9.3 数据看板

- 使用 `ChartContainer` + Recharts `ComposedChart`；关闭 CartesianGrid / XAxis 刻度线 / YAxis，与 demo 一致；
- 柱宽、间距、标签位置用 CSS 变量控制，不做响应式重排以外的视觉调整；
- 月度 → 按天使用同一容器，标题与"返回按月"按钮切换，不新建路由。

### 9.4 筛选一致性

`DateRangePicker` 是唯一日期区间入口，复用于订单、会员、营销、数据、操作日志。禁止在业务页写第二套日历逻辑；预设（今天/近7天/近30天）由 `presets` prop 注入，数据页使用，其余页不显示。

### 9.5 表格体系

- 所有列表页用 `DataTable`，禁止直接写 `<table>`；
- 操作列固定表头文字「操作」，固定右侧、`whitespace-nowrap`；
- 空态、加载、错误三态由 `DataTable` 统一渲染；
- 列定义与导出复用（订单商品）；
- 排列/筛选默认不做（demo 未出现），避免过度设计。

### 9.6 抽屉体系

- 统一 `SheetDrawer`；`fullHeight` 默认 true，`top-0 h-screen`；
- 抽屉可叠一层（详情 → 订单商品），最多两层，禁止无限嵌套；
- 关闭时保留列表滚动位置；抽屉内表格独立滚动，页脚固定；
- 抽屉标题与页面标题同字号体系，不再单独设计。

### 9.7 权限

- 路由级：无（两角色均可进所有页面）；
- 菜单级：设置中的定时任务编辑仅管理员；
- 字段级：`usePermission()` 返回 `canViewCost`，在 `columns.tsx` 里过滤列；服务端同时裁剪；
- 操作级：导购员可退货/退款（明确放开）；
- 权限判断集中 `lib/permissions.ts`，禁止页面里散落 `role === 'admin'`。

### 9.8 设置与密钥

- 设置写入 `~/.nova/settings.json`，API Key 用 `safeStorage` 加密后存 `apiKeyEnc`；
- 渲染进程只回显掩码与"已配置"状态；
- 所有设置自动保存（400ms debounce），失败 toast + 回滚显示；
- 测试连接在主进程发起，返回延迟与模型可用性。

### 9.9 小票打印

- 入口在订单明细抽屉 footer；点击打开 `PrintReceiptDialog`（预览 + 份数 + 打印）；
- 模板为 58mm 热敏宽度，内容：门店名、订单号、时间、商品行（名称/数量/金额）、合计、支付方式、导购；
- 使用隐藏 `BrowserWindow` 渲染模板后调用 `webContents.print({ silent: false })`，首版走系统打印对话框；
- 打印记录仅更新 `printedAt` 用于列表"打印/未打印"列，不生成额外业务表。

### 9.10 其他三端（复用策略）

| 端 | 复用 | 不复用 |
|---|---|---|
| 插件 | API client、款号识别规则、图片上传 | 桌面 UI、Agent |
| 手机 | 接口契约、金额计算纯函数、权限常量 | shadcn / Electron / AI Elements |
| 小程序 | 接口契约、会员权益计算 | 上层 UI |

手机端组件按 RN 习惯自建（`Screen`、`List`、`Sheet`、`TabBar`），不强行套桌面组件；买单状态机与桌面共用 `lib/pricing` 的纯逻辑（复制为 `src/lib/pricing.ts`，双端各自单测同一组用例）。

---

## 10. 质量门禁

### 10.1 工具链

| 项 | 命令 | 门禁 |
|---|---|---|
| 类型 | `npm run typecheck` | 0 error，CI 必过 |
| Lint | `npm run lint` | 0 error；warning 不得新增 |
| 单测 | `npm run test` | 核心纯函数覆盖率 ≥ 80%（`lib/`、`sql-guard`、`pricing`、`permissions`） |
| 组件测试 | `npm run test`（RTL） | 共享组件必须有渲染 + 交互用例 |
| E2E | `npm run test:e2e`（Playwright + Electron） | 关键路径全绿 |
| 构建 | `npm run build` | 三段构建通过，主进程无 renderer import |
| 打包 | `npm run pack` | 产物名 DaveBella，可启动 |

### 10.2 组件规则（Code Review 逐条检查）

- **R1** 页面文件只允许出现布局容器与 feature 组件，不允许出现裸 `<table>`、裸弹层、裸日历；
- **R2** 同一视觉结构出现第 2 次 → 必须提取组件，否则拒绝合并；
- **R3** 组件文件超过 250 行 → 必须拆分（页面文件 150 行）；
- **R4** 组件内禁止 `fetch` / `invoke`；数据经 hook 注入；
- **R5** 禁止 `any`、`@ts-ignore`、`as unknown as`；
- **R6** 禁止内联 `style`，动态值（柱高、进度）除外；
- **R7** 禁止 emoji 与自绘 SVG 图标（品牌资产除外）；
- **R8** 列表/详情必须实现 loading / empty / error 三态；
- **R9** 交互元素必须有可访问名称（`aria-label` 或可见文案），键盘可达；
- **R10** 颜色只用 token / 语义类，禁止 `text-[#4f46e5]` 这类硬编码（demo 迁移时统一替换）；
- **R11** 字号只用语义类（`text-body / text-meta / text-title …`），禁止 `text-[13px]` 这类任意值；像素间距同理优先用 Tailwind 刻度。

### 10.3 视觉验收

- 每个页面在 1440×900 与 1280×800 下与 demo 截图对照，差异需列出并逐个确认；
- 对照项：布局比例、栏宽（rail 78 / 任务栏 280 / 买单右栏 360）、字号、圆角、边框色、状态色、间距；
- 交互对照：抽屉是否到顶、日期区间是否双月、设置是否自动保存且无底部按钮、通知是否跳转并已读；
- 验收记录写入 PR 描述，附截图。

### 10.4 测试清单（最小集）

| 类型 | 用例 |
|---|---|
| 单测 | `sql-guard`（8 类非法 SQL）、`pricing`（积分/余额/券/折扣）、`permissions`（字段过滤）、`format`（金额/日期/数量） |
| 组件 | `DateRangePicker`（选择/确定/取消/预设）、`DataTable`（三态/分页/操作列）、`SheetDrawer`（整高/关闭）、`PromptInput`（提交/禁用/附件） |
| E2E | 登录 → 买单（含挂单/取单）→ 订单详情/对账/订单商品导出 → 会员充值 → 营销下线 → 数据下钻 → 经营分析发消息/产物预览 → 设置改时间 → 操作日志筛选 |
| 安全 | 非 SELECT 被拒、超 200 行被截断、workspace 越界路径被拒、未登录调用 IPC 被拒 |

---

## 11. 里程碑与评审门

> 每一关都是**你 review 后才进入下一阶段**；review 材料为可运行构建 + 截图/录屏 + 对照清单。

| 阶段 | 范围 | 交付 | Review 门 |
|---|---|---|---|
| **D0** 设计系统与壳 | shadcn 初始化、token、`AppShell/AppRail/AppHeader`、路由、登录/注册、sonner、主题与字号 | 可登录的空壳应用 | 壳与登录页像素对照 demo；字号三档切换生效 |
| **D1** 通用组件与个人中心 | `DataTable`、`DateRangePicker`、`SheetDrawer`、`StatCard`、`StatusBadge`、`FilterBar`、`PaginationBar`、设置/日志/改密/退出 Dialog、通知 | 组件可用 + 组件测试 | 组件契约与 demo 一致；区间选择器五处复用演示 |
| **D2** 六大业务页 | 订单 → 买单 → 库存 → 会员 → 营销 → 数据 | 六页可用（真实接口或 mock 双模式） | 每页截图对照 + 空/错/载三态；权限字段隐藏验证 |
| **D3** Agent 与经营分析 | 主进程 runtime、IPC、`analysis-store`、AI Elements、任务三组、产物抽屉 | 真实 DeepSeek + MySQL 只读跑通 | 流式、工具卡、产物预览、任务切换；SQL 拦截演示 |
| **D4** 定时与通知 | scheduler、notifier、三任务、红点、跳转已读、启动补跑 | 定时任务可改时间并触发 | 改时间 → 触发 → 红点 → 跳转；管理员/导购员权限差异 |
| **D5** 联调与收口 | 服务端联调、E2E、性能、打包、机型/尺寸回归 | `DaveBella` 安装包 + 验收报告 | E2E 全绿、构建产物可安装、视觉验收清单签字 |

依赖顺序（不可并行跳过）：

```
D0 → D1 → D2（订单先行，确立表格/抽屉/筛选范式）
        → D3（依赖 D1 的抽屉与 D2 的接口契约）
        → D4 → D5
```

---

## 12. 风险与待确认决策

### 12.1 需要你确认

| # | 决策点 | 建议 | 影响 |
|---|---|---|---|
| D1 | 暗黑模式色值（demo 未定义） | shadcn neutral dark + indigo-500 primary | 设置"暗黑"卡的实际效果 |
| D2 | AI Elements 引入方式 | 复制源码到 `components/ai-elements`，删除 AI SDK 依赖，改为受控 props | 避免引入 `ai` 包与 `useChat`；与 pi-agent-core 一致 |
| D3 | 图表实现 | shadcn `ChartContainer` + Recharts `ComposedChart`，样式压到与 demo 一致 | 数据中心柱图；引入 recharts 依赖 |
| D4 | 表格组件 | TanStack Table + shadcn `Table` 原语自建 `DataTable`（shadcn 官方 DataTable 文档模式） | 所有列表页 |
| D5 | 定时任务补跑 | 应用启动时若当天任务时间已过且未执行 → 立即补跑一次 | 影响日报口径与通知 |
| D6 | 小票打印实现 | Electron `webContents.print` + 58mm 预览模板；先调系统打印对话框，不做静默打印 | demo 订单明细底部有「打印小票」入口，必须实现 |
| D7 | 导出实现 | 前端 CSV（订单商品）／服务端 xlsx（如已有接口） | 首版建议复用旧接口 |
| D8 | 列表虚拟化 | 默认不做；单页 > 200 行再引入 `@tanstack/react-virtual` | 避免过早优化 |
| D9 | 组件文档 | 不引入 Storybook，用 Vitest + RTL 用例替代 | 减依赖；如需可视化再加 |
| D10 | 空态建议问题 | 自由对话新建时展示 `Suggestion` 三条（营业额/库存/会员） | 需文案确认 |
| D11 | 字号设置实现 | 整页 `setZoomFactor`（0.9 / 1.0 / 1.125），默认与 demo 像素一致 | 若改为只放大文字需全站 rem 化 |
| D12 | 库存「商品流水」呈现 | 与 demo/抽屉体系一致用整高抽屉（产品方案写的是"独立页面"） | 若保留独立页面，需加路由与返回态，库存导航高亮规则要单独定义 |
| D13 | 订单「改单」与「商品明细（按 SKU 毛利率）」 | **demo 中无入口，建议首版不做**；若保留，入口与抽屉需补充设计稿 | 涉及订单编辑权限与库存回滚，工作量与风险都高 |

### 12.2 风险

| 风险 | 对策 |
|---|---|
| demo 是静态 HTML，真实数据密度不同导致布局溢出 | D0 先建 1280×800 与 1440×900 双尺寸容器基线；表格列宽用 `min/max` 而非固定 |
| 照搬 nexa 代码带入其多模式逻辑 | 只复制 runtime / store / ai-elements；chat-shell 重写 |
| 流式事件过多导致卡顿 | 主进程 seq + 渲染端批量 flush + memo 化消息项 |
| shadcn 版本差异导致组件 API 变化 | 锁定 `shadcn` CLI 与组件版本；`components/ui` 不做业务改动 |
| 只读 SQL 被绕过 | 三层校验 + 只读账号 + 审计表 + 单测覆盖非法语句 |
| 定时任务与应用生命周期耦合 | 主进程持有 cron；窗口关闭到托盘（需确认是否支持托盘） |
| 老接口字段与 demo 展示不一致 | P1 冻结契约时逐字段核对，缺口登记到 §12.1 |
| 导购员字段过滤遗漏 | 列定义过滤 + 服务端裁剪 + E2E 断言三处覆盖 |

---

## 13. 架构图索引

| 图 | 文件 | 回答的问题 |
|---|---|---|
| 系统总览 | [`diagrams/01-system-overview.html`](./diagrams/01-system-overview.html) | 六工程、MySQL、DeepSeek、桌面端与 Agent 只读链路的关系 |
| 桌面端组件关系 | [`diagrams/02-desktop-components.html`](./diagrams/02-desktop-components.html) | 外壳、共享组件、七个页面、经营分析四件套、数据层之间的依赖 |
| Agent 对话子系统 | [`diagrams/03-agent-chat.html`](./diagrams/03-agent-chat.html) | 主进程 Runtime / IPC / store / ChatPanel / AI Elements 的分层 |
| 经营分析数据流 | [`diagrams/04-analysis-data-flow.html`](./diagrams/04-analysis-data-flow.html) | 一次提问如何经 Agent → 工具 → 只读 MySQL → 产物 → 抽屉预览 |
| 组件分层（补充） | [`diagrams/05-component-layers.html`](./diagrams/05-component-layers.html) | L0 shadcn → L5 pages 的依赖方向与提升规则 |

图的定位是**结构总览**；完整组件树以本文 §6 为准（图中不展开到按钮级）。

---

## 14. 评审通过后的第一批动作（不含实现细节）

1. 冻结本文件 §3 映射表与 §5 契约表；
2. 按 D0 初始化 `nova-desktop`，提交壳与登录页截图对照；
3. 建立 `components/ui` 版本基线并禁用业务改动；
4. 以订单页为样板，产出 `DataTable + DateRangePicker + SheetDrawer` 三件套的组件测试；
5. 三件套通过后，其余页面并行推进。

---

## 15. 评审清单（请逐项确认）

- [ ] §1 红线无异议
- [ ] §2 token 与圆角/字号方案无异议
- [ ] §3 demo → shadcn 映射完整，无遗漏元素
- [ ] §4 目录与 feature 划分认可
- [ ] §5 共享组件契约与分层规则认可
- [ ] §6 页面组件树完整
- [ ] §7 Agent 照搬边界认可（含删除项）
- [ ] §8 Query Key 与状态分层认可
- [ ] §9 复杂模块专项方案认可
- [ ] §10 质量门禁可执行
- [ ] §11 阶段与 Review 门认可
- [ ] §12 待确认项已给出结论
- [ ] §16 旧实现文件级映射认可（复用 / 重写 / 删除边界）

---

## 16. 附录：旧实现文件级映射（评审用）

### 16.1 前提：旧桌面端不是 shadcn 实现

`~/githubProjects/nova` 的桌面端渲染层在 `apps/web`，UI 是 **Ant Design 5 + table-render + less**，不是 shadcn。因此迁移不是"复制组件"，而是三条分开处理：

| 资产 | 处理方式 |
|---|---|
| 业务逻辑、请求、字段口径、交互细节 | 复用（搬到 feature 的 `api.ts` / `hooks`） |
| 列定义语义（查什么、显示什么、操作什么） | 翻译为 TanStack ColumnDef，不保留 table-render |
| 组件与样式（`TableRender` / `Modal` / `Drawer` / `Form` / `less`） | 一律不进入新代码，按 demo 用 shadcn 重写 |

旧代码中 `antd` 的 `Table/Drawer/Modal/Form/DatePicker/Statistic/Tabs` 与 `table-render` 属于本节"必须重写"项；出现即视为 Code Review 阻断（§10.2）。

### 16.2 页面文件 → 新落点

**订单**（`apps/web/src/pages/Order/`）

| 旧文件 | 现状职责 | 新落点 | 处理 |
|---|---|---|---|
| `index.tsx` | table-render 列表 + 汇总 + 对账 + 商品查询入口 | `features/orders/OrdersPage.tsx` | 重写壳（DataTable + 5 StatCard） |
| `search.tsx` / `columns.tsx` | 查询表单 / 列定义 | `OrderFilterBar.tsx` / `columns.tsx` | 重写控件，平迁字段口径 |
| `Summary/` | 汇总统计条 | 页面顶部 5 个 `StatCard` | 合并 |
| `CheckBill/` | 对账 | `ReconcileSheet.tsx` | 平迁逻辑，换 Sheet |
| `OrderItemList/`（含 `columns` `search`） | 订单商品明细 | `OrderGoodsSheet.tsx`（demo 的"订单商品"抽屉） | 平迁 + 加导出 |
| `QueryBySKU/` | 按 SKU 反查订单 | 并入 `OrderGoodsSheet` 的筛选项 | 合并 |
| `Detail/index.tsx` + `Detail/item.tsx` | 订单详情 | `OrderDetailSheet.tsx` + `OrderItemTable.tsx` | 重写壳 |
| `MoreOperate/{index,Refund,Exchange,Print,itemColumns}` | 退货 / 换货 / 打印小票 | `RefundDialog` / `ExchangeDialog` / `PrintReceiptDialog` + `main/services/printer.ts` | 重写壳，复用业务规则 |
| `ExportAndImport/*` | 订单导入、导出 | 删除（导出只在订单商品抽屉，见产品方案） | 删除 |
| `Editor/`、`CustomRadio/` | 改单、订单类型单选 | 首版不做（D13） | 删除 |

**库存**（`apps/web/src/pages/Inventory/`）

| 旧文件 | 现状职责 | 新落点 | 处理 |
|---|---|---|---|
| `index.tsx` | 列表 + 批量出入库 + 流水 + 明细入口 | `features/inventory/InventoryPage.tsx`（4 StatCard + ToggleGroup） | 重写壳 |
| `search.tsx` / `columns.tsx` / `skuColumns.tsx` | 查询 / 商品列 / SKU 列 | `InventoryFilterBar` / `columns.tsx` | 重写控件 |
| `SkuList.tsx` | SKU 展开行 | `SkuTable.tsx`（可展开行） | 重写 |
| `SingleStock` / `NoStockList` / `HotSales` | 单规格 / 断码 / 热销 三个独立列表 | 合并为 `ToggleGroup`（全部 / 断码 / 热销） | 合并（demo 已定） |
| `BitchStock/{index,Purchase,Returns}` | 批量进货 / 批量退货 | `BatchStockDialog.tsx`（两 Tab） | 重写 |
| `SkuRecord/` | 商品流水 | `SkuRecordSheet.tsx` | 平迁（D12 决定抽屉/页面） |
| `Detail/` | 商品详情 | `SkuDetailSheet.tsx` | 重写 |
| `Editor/` | 商品编辑 | `SkuEditorDialog.tsx` | 重写 |
| `ProductImagePreview/` | 图片预览 | 并入 `ProductImageManager.tsx` | 合并 |

**会员**（`apps/web/src/pages/Member/`）

| 旧文件 | 现状职责 | 新落点 | 处理 |
|---|---|---|---|
| `index.tsx` / `search.tsx` / `columns.tsx` | 列表 + 查询 + 列 | `MembersPage` / `MemberFilterBar` / `columns.tsx`（3 StatCard + 区间选择器） | 重写 |
| `Detail/{index,coupon,point,order,balance}` | 详情 Tabs（券 / 积分 / 订单 / 余额） | `MemberDetailSheet.tsx`（Tabs，去券） | 平迁结构 |
| `Editor/` | 编辑 | `MemberEditDialog.tsx` | 重写 |
| `NewJoin/` | 新增会员 | `MemberCreateDialog.tsx` | 重写 |
| `IncomeBalance/` | 充值 | `BalanceRechargeDialog.tsx` | 重写 |

**营销**（`apps/web/src/pages/Marketing/`）

| 旧文件 | 现状职责 | 新落点 | 处理 |
|---|---|---|---|
| `index.tsx` / `search.tsx` / `columns.tsx` | 卡片 + Tab + 查询 | `MarketingPage`（列表化，无 Tab，3 个查询项） | 重写 |
| `Detail/{index,coupon}` | 详情（含优惠券） | `MarketingDetailSheet.tsx`（去券） | 裁剪 |
| `Editor/` + `NewMarketing/` | 新建 / 编辑 | `MarketingEditorDialog.tsx` | 合并重写 |
| `Offline/` / `Remove/` | 下线 / 删除确认 | `ConfirmDialog` 调用点 | 简化 |
| `DrawQuery/` | 抽奖记录 | 活动详情内的 Tab | 保留 |
| `CustomWidgets/` | 自定义控件 | 删除，改用 shadcn `Select` / `DateRangePicker` | 删除 |

**买单**（`apps/web/src/pages/Buy/`）

| 旧文件 | 现状职责 | 新落点 | 处理 |
|---|---|---|---|
| `index.tsx` / `context.tsx` | 页面装配 + 购买上下文 | `BuyPage.tsx` + `BuyProvider`（或并入 zustand） | 平迁状态，重写视图 |
| `WaitSaleList` / `WaitSaleSummary` | 待售列表 / 合计 | `CartTable.tsx` + `CartSummary.tsx`（含 6.0 默认折扣列） | 重写 |
| `Payment.tsx` | 支付方式 + 实收 | `PaymentPanel.tsx`（下拉支付方式，实收宽度修复） | 重写 |
| `SkuInput` / `PhoneInput` | 扫码 / 手机号输入 | `ComposerInput.tsx` | 重写 |
| `BillInfo.tsx` | 单据信息 | `BillSummary.tsx` | 重写 |
| `StoreCoupon` / `MemberCoupon` | 店铺券 / 会员券 | `CouponSelect.tsx` | 合并 |
| `SubmitBar.tsx` | 提交栏 | `CheckoutBar.tsx`（去扫码/加入，见产品方案） | 重写 |

**数据**（`apps/web/src/pages/Data/`）

| 旧文件 | 现状职责 | 新落点 | 处理 |
|---|---|---|---|
| `index.tsx` | 指标卡 + 日期筛选 | `DataPage.tsx`（6 指标 + 区间选择器，自定义走同款） | 重写壳 |
| `StoreChart.tsx` | 店铺营业额 月/日 视图 | `StoreRevenueChart.tsx`（shadcn chart + Recharts） | 平迁数据逻辑 |
| `SalerChart.tsx` | 导购业绩 | 删除（产品方案移除导购业绩） | 删除 |

**共享组件**（`apps/web/src/components/`）

| 旧文件 | 新落点 | 处理 |
|---|---|---|
| `PageTitle/` | `layout/PageHeader.tsx` | 重写 |
| `CustomCard/`、`Box/` | 直接用 `Card` / `Separator`，不保留包装 | 删除 |
| `Bill/` | 小票模板 → `main/services/printer.ts` + `PrintReceiptDialog` | 平迁模板 |
| `OpLog/{index,columns,search}` | `OpLogDialog.tsx`（区间选择，无导出） | 重写 |
| `User/` | `AppHeader` 的 `UserMenu` | 重写 |
| `Logo/`、`StoreLogo/` | `AppRail` 购物袋图标 + Header 两行文字 Logo | 重写（资源复用） |
| `MenuItem/` | `AppRailItem.tsx` | 重写 |
| `ThemeProvider/` | 保留（主题仅单行展示） | 平迁 |
| `Copilot/` | 删除，由经营分析 Agent 取代 | 删除 |

### 16.3 nexa Agent 文件级映射

| 旧文件（`nexa-desktop/src/`） | 内容 | 新落点 | 处理 |
|---|---|---|---|
| `renderer/src/components/ai-elements/conversation.tsx` | `Conversation` / `ConversationContent` | `renderer/src/components/ai-elements/` | 照搬 |
| `.../ai-elements/message.tsx` | `Message` / `MessageAvatar` / `Header` / `Actions` / `Content` / `Response` / `StreamingPreview` | 同上 | 照搬，去掉 AI SDK 依赖 |
| `.../ai-elements/{tool,reasoning,plan,task,shimmer}.tsx` | 工具卡片 / 思考 / 计划 / 任务 / 加载 | 同上 | 照搬 |
| （新增）`prompt-input` `loader` `suggestion` `code-block` | 官方 AI Elements 源码移植 | 同上 | 改受控 props，去 `ai` 依赖 |
| `renderer/src/features/chat/chat-shell.tsx` | 会话装配、`buildRunGroups`、发送入口 | `features/analysis/components/{ChatPanel,MessageList,Composer}.tsx` | 拆分，去 iframe 预览 |
| `main/agent/runtime.ts` | run 生命周期 + 流式事件 | `main/agent/runtime.ts` | 裁剪（保留 §7.2 事件） |
| `main/agent/llm-helper.ts` / `settings.ts` | provider 调用与配置 | `main/agent/` | 保留，改 deepseek-only |
| `main/agent/tools.ts` | 工具注册 | `main/agent/tools/` | 重写为 12 个零售工具 |
| `main/agent/{memory-engine,memory-tools,kb-tools,connector-tool,skill-tool,schedule-tools}.ts` | 记忆 / 知识库 / 连接器 / 技能 / 日程 | — | 删除 |
| `main/db/database.ts` | `sessions` `messages` `tool_calls` `agent_runs` | `main/db/schema.ts` | 平迁 + 增 `artifacts` / `notifications` / `settings` |
| `shared/ipc-channels.ts` | 通道常量 | `shared/ipc-channels.ts` | 平迁并按 §7.2 改名 |
| `renderer` 会话 store | 消息 / run / 流式状态 | `stores/analysis-store.ts` | 平迁 |

### 16.4 禁止迁移清单

- `antd`、`table-render`、`less`、`@ant-design/icons` 依赖与样式：新工程不得出现；
- `electron-store` 的 `cache_*` 缓存表：不再使用，改为服务端接口 + 本地 SQLite；
- `apps/web` 的 `MainPage` 菜单缓存（`currentPage`）：由 React Router 取代；
- 旧项目 `common/electron.ts` 的 `setStore/getStore` 全局缓存能力：改为 `main/services/settings.ts` 受控读写。
