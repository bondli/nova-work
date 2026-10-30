/**
 * PM2 部署配置（nova-pos-server）
 * 用法：npm run build && pm2 start ecosystem.config.cjs
 *
 * 端口 / 监听地址 / 数据库 / 密钥全部在 ~/.nova/server-config.json，
 * 不放进程环境变量；云服务器对外服务请把 server.host 改为 0.0.0.0。
 */
module.exports = {
  apps: [
    {
      name: 'nova-pos-server',
      cwd: __dirname,
      script: 'dist/index.js',
      // 启动时会检查端口占用，占用即 exit(1)，因此固定单实例、fork 模式
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      // 异常退出才重启，正常停止不再拉起
      restart_delay: 2000,
      max_restarts: 10,
      max_memory_restart: '512M',
      // SIGTERM 后先关闭 HTTP 服务、再断开数据库连接
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
}
