import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaginationBar } from './PaginationBar'

describe('PaginationBar', () => {
  it('展示总数并折叠页码，点击后回传目标页', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()

    render(<PaginationBar total={100} page={5} pageSize={10} onPageChange={onPageChange} />)

    expect(screen.getByText('共 100 条')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '6' }))
    expect(onPageChange).toHaveBeenCalledWith(6)

    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(onPageChange).toHaveBeenLastCalledWith(6)
  })

  it('首页禁用上一页，末页禁用下一页', () => {
    const { rerender } = render(
      <PaginationBar total={30} page={1} pageSize={10} onPageChange={() => undefined} />
    )
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()

    rerender(<PaginationBar total={30} page={3} pageSize={10} onPageChange={() => undefined} />)
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  })
})
