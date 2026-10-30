import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import {
  createHome,
  launchApp,
  login,
  openWindow,
  removeHome,
  seedNotification,
  shot
} from './helpers'

/**
 * 通知闭环：未读红点 → 打开列表 → 跳转经营分析并标记已读；
 * 任务设置改时间后自动保存到 settings.json。
 */
test('通知红点、跳转已读与设置自动保存', async () => {
  const { home, settingsPath } = createHome('notify')
  seedNotification(home)
  const app = await launchApp(home)

  try {
    const page = await openWindow(app)
    await login(page)

    await expect(page.getByRole('button', { name: '消息，1 条未读' })).toBeVisible()
    await page.getByRole('button', { name: '消息，1 条未读' }).click()
    await expect(page.getByText('店铺经营日报已生成')).toBeVisible()
    await shot(page, 'd6-notification-menu')

    await page.getByText('店铺经营日报已生成').click()
    await expect(page).toHaveURL(/#\/analysis/)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: '消息', exact: true })).toBeVisible()
    await shot(page, 'd6-notification-jump')

    await page.getByRole('button', { name: '设置' }).click()
    await page.getByRole('button', { name: '任务设置' }).click()
    await page.getByLabel('店铺经营日报').fill('08:30')
    await expect(page.getByText('设置已更新')).toBeVisible()

    const stored = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      task: { daily: string }
    }
    expect(stored.task.daily).toBe('08:30')
    await shot(page, 'd6-task-settings')
  } finally {
    await app.close()
    removeHome(home)
  }
})
