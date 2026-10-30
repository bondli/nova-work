import { expect, test } from '@playwright/test'
import {
  createHome,
  launchApp,
  login,
  openWindow,
  removeHome,
  shot,
  startFakeModel,
  writeAgentConfig
} from './helpers'

/**
 * 经营分析闭环：新建自由对话 → 流式输出 → 工具循环（写文件 / 发布产物）→ 产物预览。
 * 本地假模型服务模拟 DeepSeek SSE，不依赖真实网络与数据库。
 */
test('经营分析流式输出与产物预览', async () => {
  const model = await startFakeModel()
  const { home } = createHome('analysis')
  writeAgentConfig(home, model.url)
  const app = await launchApp(home)

  try {
    const page = await openWindow(app)
    await login(page)

    await page.getByRole('button', { name: '新建自由对话' }).click()
    await expect(page.getByLabel('分析输入框')).toBeVisible()
    await page.getByLabel('分析输入框').fill('帮我生成一份 E2E 测试报告')
    await page.getByLabel('发送', { exact: true }).click()

    await expect(page.getByText('正在生成报告。')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('报告已生成，可在右侧产物面板查看。')).toBeVisible({
      timeout: 30_000
    })

    // 任务轨迹结束后自动收拢，展开后可见两次工具调用
    await page.getByRole('button', { name: /^已完成/ }).first().click()
    await expect(page.getByRole('button', { name: /^write report\.md/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^publish_artifact report\.md/ })).toBeVisible()

    await page.getByLabel('产物文件').click()
    const drawer = page.getByLabel('产物面板')
    await expect(drawer.getByRole('heading', { name: 'E2E 报告' })).toBeVisible()
    await expect(drawer.getByText('这是自动化测试生成的内容。')).toBeVisible()
    await shot(page, 'd6-analysis-artifact')
  } finally {
    await app.close()
    await model.close()
    removeHome(home)
  }
})
