import { useEffect, useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { Money } from '@renderer/components/common/Money'
import { cn } from '@renderer/lib/utils'
import { posGet } from '@renderer/lib/pos'

interface DrawQueryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface DrawMemberInfo {
  phone?: string
  name?: string
  birthday?: string
  actual?: number
  point?: number
  balance?: number
  coupon?: number
}

interface DrawRecord {
  id: number
  phone: string
  info: string
  award: string | null
  createdAt: string
}

/** 抽奖记录表头，列顺序与老系统 DrawQuery 一致 */
const DRAW_HEADERS = ['手机号', '活动名称', '奖品', '抽奖时间']

const HEAD_CLASS = 'h-8 px-3 text-meta text-muted-foreground'
const CELL_CLASS = 'px-3 py-2 text-ui'

/** 服务端时间 → YYYY-MM-DD HH:mm:ss */
function formatRecordTime(value: string): string {
  const text = String(value).replace('T', ' ')
  return text.length >= 19 ? text.slice(0, 19) : text
}

/**
 * 店庆抽奖会员查询：手机号查会员资产 + 用户抽奖记录。
 * 查询条件与结果列对齐老系统 DrawQuery；抽奖记录接口与老系统一致使用
 * /member/queryDrawRecord。
 */
export function DrawQueryDialog({ open, onOpenChange }: DrawQueryDialogProps) {
  const [phone, setPhone] = useState('')
  const [memberInfo, setMemberInfo] = useState<DrawMemberInfo | null>(null)
  const [records, setRecords] = useState<DrawRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 关闭后清空查询结果，下次打开不残留上一位会员的数据
  useEffect(() => {
    if (open) return
    setPhone('')
    setMemberInfo(null)
    setRecords([])
    setError('')
  }, [open])

  async function handleQuery(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const value = phone.trim()
    if (!value) return

    setLoading(true)
    setError('')
    try {
      const member = await posGet<DrawMemberInfo>('/member/detail', { phone: value })
      if (!member?.phone) {
        setMemberInfo(null)
        setRecords([])
        setError('未查询到该会员')
        return
      }
      setMemberInfo(member)

      try {
        const list = await posGet<DrawRecord[]>('/member/queryDrawRecord', { userPhone: value })
        setRecords(list ?? [])
      } catch (recordError) {
        setRecords([])
        setError(
          recordError instanceof Error
            ? `抽奖记录查询失败：${recordError.message}`
            : '抽奖记录查询失败'
        )
      }
    } catch (memberError) {
      setMemberInfo(null)
      setRecords([])
      setError(memberError instanceof Error ? memberError.message : '查询会员失败')
    } finally {
      setLoading(false)
    }
  }

  const infoItems = [
    { label: '手机号', value: memberInfo?.phone || '--' },
    { label: '姓名', value: memberInfo?.name || '--' },
    { label: '生日', value: memberInfo?.birthday || '--' },
    { label: '实付', value: <Money value={memberInfo?.actual ?? 0} /> },
    {
      label: '积分',
      value: (memberInfo?.point ?? 0).toLocaleString('zh-CN')
    },
    { label: '余额', value: <Money value={memberInfo?.balance ?? 0} /> },
    { label: '优惠券', value: (memberInfo?.coupon ?? 0).toLocaleString('zh-CN') }
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-64px)] w-[720px] max-w-[calc(100vw-48px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-title font-semibold">一周年店庆抽奖会员查询</DialogTitle>
          <DialogDescription className="text-meta text-muted-foreground">
            输入会员手机号回车即可查询会员资产与抽奖记录
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleQuery} className="flex items-center gap-2">
          <Input
            className="h-8 text-ui"
            placeholder="请输入会员手机号"
            aria-label="会员手机号"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={loading || !phone.trim()}>
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            查询
          </Button>
        </form>

        {error ? <p className="text-meta text-destructive">{error}</p> : null}

        <section className="rounded-lg border border-border p-3">
          <h3 className="mb-3 text-ui font-semibold">会员信息</h3>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {infoItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-2">
                <span className="text-meta text-muted-foreground">{item.label}</span>
                <span className="truncate text-ui">{item.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-ui font-semibold">用户抽奖记录</h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader className="bg-surface">
                <TableRow className="border-border hover:bg-transparent">
                  {DRAW_HEADERS.map((header) => (
                    <TableHead key={header} className={HEAD_CLASS}>
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={DRAW_HEADERS.length}
                      className="px-3 py-6 text-center text-ui text-muted-foreground"
                    >
                      暂无数据
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => (
                    <TableRow key={record.id} className="border-border/60 hover:bg-surface">
                      <TableCell className={cn(CELL_CLASS, 'tnum')}>{record.phone}</TableCell>
                      <TableCell className={CELL_CLASS}>{record.info}</TableCell>
                      <TableCell className={CELL_CLASS}>{record.award || '--'}</TableCell>
                      <TableCell className={cn(CELL_CLASS, 'tnum text-muted-foreground')}>
                        {formatRecordTime(record.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}
