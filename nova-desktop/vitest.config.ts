import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

/**
 * 组件测试配置：jsdom 环境 + React 插件 + 与 electron.vite 一致的路径别名。
 * 只覆盖 renderer 下的组件与页面，不涉及主进程。
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': `${root}src/renderer/src`,
      '@shared': `${root}src/shared`
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/renderer/src/test/setup.ts'],
    include: ['src/renderer/src/**/*.test.{ts,tsx}', 'src/main/**/*.test.ts'],
    // 主进程序列测试不依赖浏览器环境，按 node 运行
    environmentMatchGlobs: [['src/main/**/*.test.ts', 'node']]
  }
})
