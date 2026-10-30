# Nova POS Server

DaveBella 门店端 POS API 服务：订单、买单、库存、会员、营销、数据看板与操作日志。桌面端、手机端、浏览器插件都通过它读写门店业务数据。

## 技术栈

- Node.js ≥ 18、TypeScript 5.8
- Express 4、Sequelize 6、MySQL（mysql2）
- zod（请求体校验）、dayjs、decimal.js、exceljs / xlsx（导入导出）、multer（上传）
- jsonwebtoken（业务 JWT）+ 内部令牌（`auth.internalToken`）

## 目录结构

```
nova-pos-server/
├── src/
│   ├── index.ts             # Express 装配、健康检查、静态图片、鉴权与启动
│   ├── config.ts            # ~/.nova/server-config.json（端口、库、密钥、存储）
│   ├── logger.ts            # 文件日志（10MB 滚动）
│   ├── model/               # Sequelize 模型 + schema.sql（表结构唯一来源）
│   ├── router/              # *-controller.ts 即路由
│   │   ├── auth-controller.ts / user-controller.ts   # 内部令牌换 JWT、账号登录注册
│   │   ├── order-controller.ts / buy-controller.ts
│   │   ├── inventory-controller.ts / member-controller.ts / marketing-controller.ts
│   │   ├── data-controller.ts / store-chart-controller.ts / common-controller.ts
│   ├── middleware/          # context / internal-auth（白名单）/ rate-limit
│   ├── auth/                # jwt.ts / password.ts
│   ├── service/             # order-number.ts（订单号生成 + 唯一冲突重试）
│   ├── utils/               # db.ts（事务）/ query.ts（分页、排序、IN 分批、zod 解析）
│   └── scripts/             # 运维脚本（如 checkOrderPricing）
├── migrations/              # 需要人工执行的 SQL（索引、唯一约束等）
├── ecosystem.config.cjs     # PM2 部署配置
└── tsconfig.server.json     # 编译到 dist/
```

## 本地开发

```bash
npm install
npm run dev        # tsc 编译一次 + nodemon 监听 dist（默认端口 9577）
npm run typecheck
npm run lint
```

> `npm run dev` 只监听 `dist/`，改 `src/` 后靠 tsc 重新编译触发重启；如果改完没有生效，先确认编译是否成功。

## 配置（`~/.nova/server-config.json`）

首次启动时若文件不存在会自动创建，并写入随机生成的 `auth.internalToken`、`auth.jwtSecret`、`storage.uploadToken`，文件权限 `0600`。**这些密钥需要在部署后备份**，桌面端要使用同一个 `internalToken`。

```json
{
  "baseUrl": "http://127.0.0.1:9577",
  "auth": {
    "internalToken": "内部令牌（桌面端 / 管理端换取 JWT 用）",
    "jwtSecret": "业务 JWT 签名密钥"
  },
  "server": { "host": "127.0.0.1", "port": 9577 },
  "database": {
    "host": "127.0.0.1",
    "port": 3306,
    "username": "nova",
    "password": "******",
    "database": "nova",
    "sqlLog": false,
    "sync": false
  },
  "storage": {
    "uploadDir": "~/.nova/storage/inventory-image",
    "logDir": "~/.nova/logs",
    "uploadToken": "浏览器插件上传商品图片的令牌"
  }
}
```

要点：

- 端口优先级：`server.port` → `baseUrl` 里的端口 → 默认 **9577**；监听地址优先环境变量 `HOST`，其次 `server.host`（默认 `127.0.0.1`）。
- 配置有 5 秒缓存（按 mtime 失效），改完最多 5 秒生效；`database.sync` **仅本地开发可开**，生产必须执行 SQL 迁移。
- 商品图片通过 `/inventory-image/` 静态访问（`<img>` 无法带 Authorization，所以注册在业务鉴权之前）。

## 数据库

- 表结构以 `src/model/schema.sql` 为准；`migrations/*.sql` 需要在 MySQL 中**人工执行**，服务启动不会自动跑。
- 订单号唯一索引上线前，先清理历史重复订单号，否则迁移会失败。
- 部署前示例：

```bash
mysql -u root -p nova < src/model/schema.sql
mysql -u root -p nova < migrations/20261030_add_indexes.sql
```

## 部署到云服务器（PM2）

### 1. 准备

- Node.js ≥ 18（建议 20 LTS）、MySQL 8、PM2
- 服务器安全组 / 防火墙放通业务端口（默认 9577），或只对反向代理 / 内网开放

```bash
npm i -g pm2
```

### 2. 构建与启动

```bash
cd /www/nova/nova-pos-server      # 部署目录按实际调整
npm ci                            # 生产依赖可用 npm ci --omit=dev
npm run build                     # 编译到 dist/
pm2 start ecosystem.config.cjs    # 首次启动会生成 ~/.nova/server-config.json
pm2 save                          # 保存进程列表
pm2 startup                       # 按提示执行输出的命令，实现开机自启
```

### 3. 修改配置并重启

首次启动生成的配置里 `host` 是 `127.0.0.1`、数据库为空。编辑 `~/.nova/server-config.json`（云服务器需对外服务时把 `server.host` 改为 `0.0.0.0`，并填写数据库连接），然后：

```bash
pm2 restart nova-pos-server
pm2 logs nova-pos-server          # 应用日志也写在 ~/.nova/logs/pos-server.log
curl http://127.0.0.1:9577/health # {"code":0,"data":{"status":"ok",...}}
```

### 4. 更新发布

```bash
npm ci
npm run build
pm2 restart nova-pos-server --update-env
```

### 5. `ecosystem.config.cjs` 说明

- `exec_mode: fork`、`instances: 1`：服务启动时会检查端口占用，占用即 `exit(1)`，**不要开 cluster 多实例**。
- 端口 / 监听地址、数据库、密钥全部在 `~/.nova/server-config.json`，不要写进 PM2 环境变量（除 `NODE_ENV`）。
- `max_memory_restart` 作为兜底；日志由应用自身写入 `~/.nova/logs/`（单文件 10MB 滚动），PM2 日志仅作 stdout 备份。
- 收到 `SIGTERM` 时会先关闭 HTTP 服务再断开 Sequelize，`pm2 restart` 可安全滚动。

### 6. 反向代理（可选）

用 Nginx 暴露 HTTPS 时，注意：

- 转发到 `127.0.0.1:9577`，保留 `/inventory-image/` 路径（商品图片静态资源）；
- 上传接口需要放开请求体大小（服务端已放宽到 50MB）；
- 手机端 / 插件走公网时，建议只暴露经 TLS 的入口，并把 `~/.nova/server-config.json` 备份到安全位置（含内部令牌）。

## 接口契约

接口路径、请求参数与返回结构见 [docs/api-contract.md](../docs/api-contract.md)。新增接口需同步更新该文档，并在桌面端 `nova-desktop/src/main/api/endpoints.ts` 白名单登记。

## 排查

- 启动即退出：看日志中的 `Port xxx is already in use` 或 `Connection has been established` 之后的报错（数据库连接失败会直接退出）。
- 401 / 未授权：检查内部令牌是否与桌面端一致；手机端走 `/auth/mobile-login` 签发 JWT。
- 图片不显示：确认 `storage.uploadDir` 存在、`/inventory-image/` 未被鉴权或代理拦截。
- 配置改完没生效：`pm2 restart`（配置缓存 5 秒，进程内还持有已初始化的 Sequelize 连接）。
