/**
 * PM2 部署配置（nova-relay）
 * 用法：npm run build && pm2 start ecosystem.config.cjs
 *
 * - 默认端口 8722，可用 PORT 环境变量覆盖（不推荐，统一走 server-config.json 的 relay.url）
 * - groupSecret 从 ~/.nova/server-config.json 的 relay.groupSecret 读取，与 POS 共用
 * - 单实例 fork 模式：WebSocket 服务无法在 cluster 模式下共享连接表
 */
module.exports = {
  apps: [
    {
      name: 'nova-relay',
      cwd: __dirname,
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      max_memory_restart: '256M',
      // SIGTERM 后先关 HTTP 服务、再断所有 WS 连接
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
}
