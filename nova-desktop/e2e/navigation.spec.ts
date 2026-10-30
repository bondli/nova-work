import { expect, test } from '@playwright/test'
import {
  createHome,
  launchApp,
  login,
  openWindow,
  removeHome,
  resizeWindow,
  shot,
  writePerf
} from './helpers'

const PAGES = [
  { slug: 'analysis', label: 'AI经营', title: '经营分析' },
  { slug: 'buy', label: '买单', title: '买单' },
  { slug: 'orders', label: '订单', title: '订单中心' },
  { slug: 'inventory', label: '库存', title: '库存中心' },
  { slug: 'members', label: '会员', title: '会员中心' },
  { slug: 'marketing', label: '营销', title: '营销中心' },
  { slug: 'data', label: '数据', title: '数据中心' }
]

/**
 * 全页面导航冒烟 + 性能计时 + 1440×900 / 1280×800 双尺寸截图。
 */
test('导航冒烟、性能计时与双尺寸视觉回归', async () => {
  const { home } = createHome('navigation')
  const startupAt = Date.now()
  const app = await launchApp(home)

  try {
    const page = await openWindow(app)
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
    const perf: Record<string, number> = { startupMs: Date.now() - startupAt }

    const loginAt = Date.now()
    await login(page)
    perf['loginMs'] = Date.now() - loginAt

    for (const item of PAGES) {
      const startedAt = Date.now()
      await page.getByRole('link', { name: item.label }).click()
      await expect(page.getByRole('heading', { name: item.title })).toBeVisible()
      await page.waitForTimeout(500)
      perf[`nav_${item.slug}Ms`] = Date.now() - startedAt
      await shot(page, `d6-${item.slug}-1440`)
    }

    await resizeWindow(app, 1280, 800)
    await page.waitForTimeout(300)

    for (const item of PAGES) {
      await page.getByRole('link', { name: item.label }).click()
      await expect(page.getByRole('heading', { name: item.title })).toBeVisible()
      await page.waitForTimeout(400)
      await shot(page, `d6-${item.slug}-1280`)
    }

    writePerf(perf)
  } finally {
    await app.close()
    removeHome(home)
  }
})
