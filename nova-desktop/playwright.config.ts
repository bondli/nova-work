import { defineConfig } from '@playwright/test'

/**
 * D5 E2E：Playwright 直接启动已构建的 Electron 应用。
 * 串行执行，避免多个实例争抢系统资源与截图目录。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  }
})
