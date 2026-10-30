import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SheetDrawer } from './SheetDrawer'

describe('SheetDrawer', () => {
  it('渲染标题、内容与页脚，并通过关闭按钮回传状态', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <SheetDrawer
        open
        onOpenChange={onOpenChange}
        title="订单详情"
        description="DB202610230042"
        width="lg"
        footer={<button type="button">导出</button>}
      >
        <p>订单正文</p>
      </SheetDrawer>
    )

    expect(screen.getByText('订单详情')).toBeInTheDocument()
    expect(screen.getByText('DB202610230042')).toBeInTheDocument()
    expect(screen.getByText('订单正文')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '关闭' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
