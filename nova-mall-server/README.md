# Nova Mall Server

DaveBella 会员端 API 服务（面向小程序 / 手机端会员场景）：会员登录与资料、订单查询、积分、余额、优惠券与营销活动。与 nova-pos-server 共用同一个 MySQL 库，但只暴露会员侧只读/自助接口。

## 技术栈

- Node.js ≥ 18、TypeScript
- Express 4、Sequelize 6、MySQL（mysql2）
- multer（会员头像等文件上传）、微信开放能力配置（appId / appSecret）

## 目录结构

```
nova-mall-server/
├── src/
│   ├── index.ts             # Express 装配、健康检查、/files 静态资源、端口检查与启动
│   ├── config.ts            # ~/.nova/mall-config.json（端口、库、微信、存储）
│   ├── logger.ts            # 文件日志
│   ├── model/               # 与 POS 同库模型（member / order / inventory / marketing …）
│   ├── router/
│   │   ├── index.ts         # 路由汇总
│   │   ├── member-controller.ts    # /member/login、/member/update、/member/getInfo
│   │   ├── order-controller.ts     # /order/list、/order/detail、/order/itemList
│   │   ├── activity-controller.ts  # /marketing/list、/marketing/detail
│   │   ├── balance-controller.ts   # /balance/list
│   │   ├── score-controller.ts     # /score/list
│   │   ├── coupon-controller.ts    # /coupon/list
│   │   └── common-controller.ts    # /common/upload（带上传令牌）
│   ├── service/ / utils/    # 业务与分页/DB 工具
├── ecosystem.config.cjs     # PM2 部署配置
└── package.json
```

## 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查（免鉴权） |
| POST | `/member/login` | 会员登录（微信 / 手机号，见控制器实现） |
| POST | `/member/update` | 更新会员资料 |
| GET | `/member/getInfo` | 会员信息 |
| GET | `/order/list`、`/order/detail`、`/order/itemList` | 会员订单列表 / 详情 / 商品明细 |
| GET | `/marketing/list`、`/marketing/detail` | 营销活动 |
| GET | `/balance/list` | 余额流水 |
| GET | `/score/list` | 积分流水 |
| GET | `/coupon/list` | 优惠券列表 |
| POST | `/common/upload` | 文件上传（校验 `storage.uploadToken`） |
| GET | `/files/*` | 上传文件静态访问 |

## 本地开发

```bash
npm install
npm run dev        # concurrently：tsc -w + nodemon，默认端口 9599
npm run typecheck
npm run lint
```

> `concurrently` 是开发依赖；服务器上 `npm ci --omit=dev` 后只保留 `npm start`。

## 配置（`~/.nova/mall-config.json`）

首次启动自动创建并补齐：

```json
{
  "baseUrl": "http://127.0.0.1:9599",
  "server": { "host": "127.0.0.1", "port": 9599 },
  "database": {
    "host": "127.0.0.1",
    "port": 3306,
    "username": "nova",
    "password": "******",
    "database": "nova",
    "sqlLog": false,
    "sync": false
  },
  "wechat": { "appId": "", "appSecret": "" },
  "storage": {
    "uploadDir": "~/.nova/mall-files",
    "publicBaseUrl": "http://127.0.0.1:9599",
    "uploadToken": "上传令牌（首次启动随机生成）"
  }
}
```

要点：

- 端口 / 监听地址只读配置（**不支持 `HOST` / `PORT` 环境变量**），云服务器对外服务时把 `server.host` 改成 `0.0.0.0`。
- 配置在进程内**只读取一次**，修改后必须 `pm2 restart nova-mall-server` 才生效。
- `storage.publicBaseUrl` 用于拼接文件外链；走域名 / HTTPS 时改成公网地址，否则返回的图片链接是内网地址。
- `database.sync` 仅本地开发可开，生产结构变更直接执行 POS 侧的 `schema.sql` / `migrations/*.sql`。

## 部署到云服务器（PM2）

### 1. 准备

- Node.js ≥ 18（建议 20 LTS）、MySQL 8、PM2
- 与 nova-pos-server 同一台机器时，注意端口 9599 与 9577 互不冲突；只允许内网或反向代理访问

```bash
npm i -g pm2
```

### 2. 构建与启动

```bash
cd /www/nova/nova-mall-server
npm ci
npm run build
pm2 start ecosystem.config.cjs   # 首次启动生成 ~/.nova/mall-config.json
pm2 save
pm2 startup                      # 开机自启
```

### 3. 修改配置并重启

编辑 `~/.nova/mall-config.json`（`server.host`、`database`、`wechat`、`storage.publicBaseUrl`），然后：

```bash
pm2 restart nova-mall-server
pm2 logs nova-mall-server
curl http://127.0.0.1:9599/health  # {"code":0,"data":{"status":"ok","service":"nova-mall-server"}}
```

### 4. 更新发布

```bash
npm ci
npm run build
pm2 restart nova-mall-server --update-env
```

### 5. `ecosystem.config.cjs` 说明

- `exec_mode: fork`、`instances: 1`：启动时会检查端口占用，占用即退出，**不要开 cluster**。
- 监听地址写在配置文件（不是环境变量），PM2 只设置 `NODE_ENV`。
- `SIGTERM` 会先关闭 HTTP 服务再断开 Sequelize，可安全 `pm2 restart`。
- 上传文件与日志目录在 `~/.nova/mall-files`、日志由应用自身写入（不依赖 PM2 日志文件）。

### 6. 反向代理（可选）

- 转发到 `127.0.0.1:9599`，保留 `/files/` 路径（上传文件静态资源）；
- `baseUrl` / `storage.publicBaseUrl` 必须与对外访问地址一致（影响会员端拿到的文件链接）；
- 微信登录回调域名需在小程序 / 公众号后台登记。

## 排查

- 启动即退出：看 `Port 9599 is already in use`；数据库连接失败会直接抛出并退出。
- 上传 403：检查请求携带的上传令牌与 `storage.uploadToken` 是否一致。
- 文件链接是 127.0.0.1：`storage.publicBaseUrl` 未改成公网地址，改完要重启进程。
- 会员看不到订单：本服务与 POS 共用库，确认 `database.database` 指向同一个库，且订单 `userPhone` 与会员手机号一致。
