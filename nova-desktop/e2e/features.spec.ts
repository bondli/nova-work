import { expect, test } from '@playwright/test'
import { createHome, launchApp, login, openWindow, removeHome, shot } from './helpers'

/**
 * 六大业务页关键交互：买单扫码与选会员、订单明细抽屉、会员详情、
 * 营销活动列表、数据中心区间切换。均为只读操作，不写生产库。
 */
test('业务页关键交互', async () => {
  const { home } = createHome('features')
  const app = await launchApp(home)

  try {
    const page = await openWindow(app)
    await login(page)

    // 买单：扫码真实 SKU 加入待售清单，再搜索会员（只读，不提交收款）
    await page.getByRole('link', { name: '买单' }).click()
    await expect(page.getByRole('heading', { name: '买单' })).toBeVisible()
    await page.getByLabel('扫码或输入款号').fill('6941496121586')
    await page.getByLabel('扫码或输入款号').press('Enter')
    await expect(page.getByRole('cell', { name: /^内衣 DB4253594/ })).toBeVisible()
    // 员工列表异步加载，等导购下拉有值再截图
    await expect(page.getByLabel('导购员')).toHaveText(/\S/)
    await shot(page, 'd6-buy-scan')

    await page.getByRole('button', { name: '选择会员' }).click()
    await expect(page.getByRole('heading', { name: '选择会员' })).toBeVisible()
    // 打开时不查询，输入手机号回车后才发起检索
    await expect(page.getByText('输入手机号后回车查询会员')).toBeVisible()
    await page.getByLabel('搜索会员').fill('15906536862')
    await page.getByLabel('搜索会员').press('Enter')
    await expect(page.getByText('15906536862').first()).toBeVisible()
    await shot(page, 'd6-buy-member-search')

    // 未注册手机号：先让导购确认入会；此处只取消，不写入会员表
    await page.getByLabel('搜索会员').fill('10000000000')
    await page.getByLabel('搜索会员').press('Enter')
    await expect(page.getByText('该手机号还不是会员')).toBeVisible()
    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByText('该手机号还不是会员')).toBeHidden()
    await page.keyboard.press('Escape')

    // 订单：详情抽屉 + 修改订单弹窗（只打开，不提交）
    await page.getByRole('link', { name: '订单' }).click()
    await expect(page.getByRole('heading', { name: '订单中心' })).toBeVisible()
    // 金额列还有「优惠使用详情」按钮，精确匹配操作列的「详情」
    await page.getByRole('button', { name: '详情', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: '订单详情' })).toBeVisible()
    await shot(page, 'd6-orders-detail')
    await page.getByRole('button', { name: '关闭' }).click()

    await page.getByRole('button', { name: '修改' }).first().click()
    await expect(page.getByRole('heading', { name: '修改订单' })).toBeVisible()
    await expect(page.getByLabel('订单编码')).toBeVisible()
    await shot(page, 'd6-orders-edit')
    await page.keyboard.press('Escape')

    // 库存：详情抽屉 + 编辑弹窗（只打开，不提交）
    await page.getByRole('link', { name: '库存' }).click()
    await expect(page.getByRole('heading', { name: '库存中心' })).toBeVisible()
    await page.getByRole('button', { name: '详情', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: '库存详情' })).toBeVisible()
    await shot(page, 'd6-inventory-detail')
    await page.getByRole('button', { name: '关闭' }).click()

    await page.getByRole('button', { name: '编辑' }).first().click()
    await expect(page.getByRole('heading', { name: '编辑库存' })).toBeVisible()
    await expect(
      page
        .getByRole('dialog', { name: '编辑库存' })
        .getByRole('spinbutton', { name: '调整后库存 *' })
    ).toBeVisible()
    await shot(page, 'd6-inventory-edit')
    await page.keyboard.press('Escape')

    // 会员：详情抽屉
    await page.getByRole('link', { name: '会员' }).click()
    await expect(page.getByRole('heading', { name: '会员中心' })).toBeVisible()
    await page.getByRole('button', { name: '详情', exact: true }).first().click()
    await expect(page.getByText('会员详情').first()).toBeVisible()
    // 详情由 4 个接口拼装，等分段内容渲染完再截图
    await expect(page.getByRole('tab', { name: '订单' })).toBeVisible()
    await shot(page, 'd6-members-detail')
    await page.getByRole('button', { name: '关闭' }).click()

    // 营销：确认活动列表来自真实接口（E2E 不写入生产数据）
    await page.getByRole('link', { name: '营销' }).click()
    await expect(page.getByRole('heading', { name: '营销中心' })).toBeVisible()
    await expect(page.getByRole('cell', { name: '一周年庆典活动' })).toBeVisible()
    await shot(page, 'd6-marketing-list')

    // 数据中心：快捷区间切换
    // 首屏需等 /data/getCoreData + /data/getOrderCharts + 逐月日营业额全部返回，
    // 真实库上单次可达数秒，这里放宽单点等待避免误报
    await page.getByRole('link', { name: '数据' }).click()
    await expect(page.getByRole('heading', { name: '数据中心' })).toBeVisible()
    await expect(page.getByText('订单金额')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: '近 7 天' }).click()
    await expect(page.getByText('数据截止')).toBeVisible()
    await shot(page, 'd6-data-7d')
  } finally {
    await app.close()
    removeHome(home)
  }
})
