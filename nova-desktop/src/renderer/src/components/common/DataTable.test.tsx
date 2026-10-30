import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ColumnDef } from '@tanstack/react-table'
import { describe, expect, it, vi } from 'vitest'
import { DataTable } from './DataTable'

interface TestRow {
  id: string
  name: string
  amount: number
}

const COLUMNS: ColumnDef<TestRow>[] = [
  { accessorKey: 'name', header: '名称' },
  { accessorKey: 'amount', header: '金额' }
]

const ROWS: TestRow[] = [
  { id: '1', name: '苹果', amount: 12 },
  { id: '2', name: '香蕉', amount: 8 }
]

describe('DataTable', () => {
  it('渲染列头与数据行，并支持行点击', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    render(<DataTable columns={COLUMNS} data={ROWS} rowKey="id" onRowClick={onRowClick} />)

    expect(screen.getByText('名称')).toBeInTheDocument()
    expect(screen.getByText('苹果')).toBeInTheDocument()

    await user.click(screen.getByText('香蕉'))
    expect(onRowClick).toHaveBeenCalledWith(ROWS[1])
  })

  it('无数据时展示统一空态', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={[]}
        rowKey="id"
        empty={{ title: '暂无订单', description: '请调整筛选条件' }}
      />
    )

    expect(screen.getByText('暂无订单')).toBeInTheDocument()
    expect(screen.getByText('请调整筛选条件')).toBeInTheDocument()
  })

  it('加载态不展示空态，错误态优先展示失败提示', () => {
    const { rerender } = render(
      <DataTable columns={COLUMNS} data={[]} rowKey="id" empty={{ title: '暂无订单' }} isLoading />
    )
    expect(screen.queryByText('暂无订单')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)

    rerender(
      <DataTable columns={COLUMNS} data={[]} rowKey="id" error="网络异常，请稍后重试" />
    )
    expect(screen.getByText('加载失败')).toBeInTheDocument()
    expect(screen.getByText('网络异常，请稍后重试')).toBeInTheDocument()
  })
})
