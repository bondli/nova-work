import { expect, test } from '@playwright/test'
import {
  ADMIN,
  createHome,
  launchApp,
  login,
  openWindow,
  removeHome,
  removeTestUser,
  shot,
  writeAgentConfig
} from './helpers'

/**
 * 认证与会话：未登录 IPC 拒绝、错误密码、登录成功、注册默认导购员权限。
 */
test.describe('认证与会话', () => {
  test('未登录调用业务 IPC 被拒绝', async () => {
    const { home } = createHome('unauth')
    const app = await launchApp(home)

    try {
      const page = await openWindow(app)
      await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()

      const result = await page.evaluate(() => window.nova.agent.list())
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('UNAUTHENTICATED')
    } finally {
      await app.close()
      removeHome(home)
    }
  })

  test('错误密码给出提示，正确密码进入经营分析', async () => {
    const { home } = createHome('login')
    const app = await launchApp(home)

    try {
      const page = await openWindow(app)
      await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
      await shot(page, 'd6-login-1440')

      await page.getByPlaceholder('请输入用户名').fill(ADMIN.username)
      await page.getByPlaceholder('请输入密码').fill('wrong-password')
      await page.getByRole('button', { name: '登录', exact: true }).click()
      await expect(page.getByText('用户名或密码不正确')).toBeVisible()

      await page.getByPlaceholder('请输入密码').fill(ADMIN.password)
      await page.getByRole('button', { name: '登录', exact: true }).click()
      await expect(page.getByRole('heading', { name: '经营分析' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'AI经营' })).toBeVisible()
    } finally {
      await app.close()
      removeHome(home)
    }
  })

  test('注册账号默认为导购员，任务时间不可修改', async () => {
    const { home } = createHome('register')
    const app = await launchApp(home)
    const suffix = Date.now().toString().slice(-8)
    const username = `e2e${suffix}`

    try {
      const page = await openWindow(app)
      await page.getByRole('button', { name: '立即注册' }).click()

      await page.getByPlaceholder('4-20 位字母或数字').fill(username)
      await page.getByPlaceholder('请输入真实姓名').fill('测试导购')
      await page.getByPlaceholder('至少 8 位，建议含字母和数字').fill('12345678')
      await page.getByPlaceholder('请再次输入密码').fill('12345678')
      await page.getByRole('button', { name: '注册并登录' }).click()

      await expect(page.getByRole('heading', { name: '经营分析' })).toBeVisible()
      await expect(page.getByRole('button', { name: '个人中心' })).toContainText('测试导购')

      await page.getByRole('button', { name: '设置' }).click()
      await page.getByRole('button', { name: '任务设置' }).click()

      await expect(page.getByLabel('店铺经营日报')).toBeDisabled()
      await expect(page.getByLabel('店铺经营日报')).toHaveValue('23:59')
      await shot(page, 'd6-settings-clerk')

      await page.getByRole('button', { name: '模型设置' }).click()
      await expect(page.getByText('仅管理员可查看模型设置')).toBeVisible()
      await page.getByRole('button', { name: '数据设置' }).click()
      await expect(page.getByText('仅管理员可查看数据设置')).toBeVisible()
    } finally {
      await app.close()
      removeHome(home)
      // 账号已写入 POS 用户表，用例结束清理，避免污染真实数据
      await removeTestUser(username)
    }
  })

  test('管理员可查看模型设置与数据设置', async () => {
    const { home } = createHome('settings-admin')
    writeAgentConfig(home, 'http://127.0.0.1:18080/v1')
    const app = await launchApp(home)

    try {
      const page = await openWindow(app)
      await login(page)

      await page.getByRole('button', { name: '设置' }).click()
      await page.getByRole('button', { name: '模型设置' }).click()

      await expect(page.getByLabel('Base URL')).toHaveValue('http://127.0.0.1:18080/v1')
      await expect(page.getByRole('textbox', { name: 'API Key' })).toHaveValue('e2e-key')
      await expect(page.getByLabel('默认模型')).toContainText('deepseek-flash')

      await page.getByRole('button', { name: '数据设置' }).click()
      await expect(page.getByLabel('服务地址')).toHaveValue('http://127.0.0.1:9577')
      await expect(page.getByLabel('主机')).toHaveValue('127.0.0.1')
      await expect(page.getByLabel('库名')).toHaveValue('store_pos')
      await expect(page.getByLabel('只读账号')).toHaveValue('readonly')

      await shot(page, 'd6-settings-admin')
    } finally {
      await app.close()
      removeHome(home)
    }
  })
})
