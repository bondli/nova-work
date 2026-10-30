import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { formatDate } from '@renderer/lib/format'
import { DateRangePicker } from './DateRangePicker'

const INITIAL = {
  start: new Date(2026, 9, 1),
  end: new Date(2026, 9, 10)
}

describe('DateRangePicker', () => {
  it('只在点确定后提交草稿区间', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateRangePicker value={INITIAL} onChange={onChange} numberOfMonths={1} />)

    await user.click(screen.getByRole('button', { name: '选择日期区间' }))
    expect(screen.getByText('选择日期区间')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /2026年10月15日/ }))
    fireEvent.click(screen.getByRole('button', { name: /2026年10月18日/ }))

    // 草稿变化不应立刻影响外部展示的已选区间
    expect(screen.getByRole('button', { name: '选择日期区间' })).toHaveTextContent(
      '2026-10-01 → 2026-10-10'
    )

    await user.click(screen.getByRole('button', { name: '确定' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const selected = onChange.mock.calls[0]![0]
    expect(formatDate(selected.start)).toBe('2026-10-01')
    expect(formatDate(selected.end)).toBe('2026-10-18')
  })

  it('取消时丢弃修改且不触发回调', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateRangePicker value={INITIAL} onChange={onChange} numberOfMonths={1} />)

    await user.click(screen.getByRole('button', { name: '选择日期区间' }))
    await user.click(screen.getByRole('button', { name: /2026年10月20日/ }))
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '选择日期区间' })).toHaveTextContent(
      '2026-10-01 → 2026-10-10'
    )
  })

  it('快捷预设会填入草稿，确定后提交预设区间', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <DateRangePicker
        value={INITIAL}
        onChange={onChange}
        numberOfMonths={1}
        presets={[
          { label: '近7天', start: new Date(2026, 9, 3), end: new Date(2026, 9, 9) }
        ]}
      />
    )

    await user.click(screen.getByRole('button', { name: '选择日期区间' }))
    await user.click(screen.getByRole('button', { name: '近7天' }))
    await user.click(screen.getByRole('button', { name: '确定' }))

    const selected = onChange.mock.calls[0]![0]
    expect(formatDate(selected.start)).toBe('2026-10-03')
    expect(formatDate(selected.end)).toBe('2026-10-09')
  })
})
