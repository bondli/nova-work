/**
 * PM2 部署配置（nova-mall-server）
 * 用法：npm run build && pm2 start ecosystem.config.cjs
 *
 * 注意：本服务的监听地址只读 ~/.nova/mall-config.json（不支持 HOST / PORT 环境变量），
 * 云服务器对外服务必须把 server.host 改为 0.0.0.0，改完执行 pm2 restart nova-mall-server。
 */
module.exports = {
  apps: [
    {
      name: 'nova-mall-server',
      cwd: __dirname,
      script: 'dist/index.js',
      // 启动时会检查端口占用，占用即 exit(1)，因此固定单实例、fork 模式
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      max_memory_restart: '512M',
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
}
