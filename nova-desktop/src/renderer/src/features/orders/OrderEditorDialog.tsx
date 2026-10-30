import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PencilLine } from 'lucide-react'
import { toast } from 'sonner'
import type { Order, PaymentMethod } from '@shared/types/order'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { PAYMENT_OPTIONS } from '@renderer/lib/payment'
import { useAuthStore } from '@renderer/stores/auth-store'
import { useClerksQuery, useModifyOrder, useOrderQuery } from './queries'

interface OrderEditorDialogProps {
  /** 为 null 时弹窗关闭 */
  order: Order | null
  onClose: () => void
}

/** 桌面端支付方式 → 服务端取值，与老系统 Editor schema 一致 */
const PAY_TO_SERVER: Record<PaymentMethod, string> = {
  wechat: 'weixin',
  alipay: 'alipay',
  cash: 'cash',
  card: 'card',
  other: 'other'
}

/**
 * 修改订单弹窗，字段对齐老系统 Order/Editor：
 * 订单编码 / 支付方式 / 实付金额 / 导购员 / 会员 / 备注，底部「确定 / 关闭」。
 * 已完成对账的订单只保留备注可编辑；导购员仅管理员可改。
 */
export function OrderEditorDialog({ order, onClose }: OrderEditorDialogProps) {
  const role = useAuthStore((state) => state.user?.role)
  const isAdmin = role === 'admin'

  const { data: detail } = useOrderQuery(order?.no ?? null)
  const { data: clerks = [] } = useClerksQuery()
  const mutation = useModifyOrder()

  const [orderSn, setOrderSn] = useState('')
  const [payType, setPayType] = useState('')
  const [amount, setAmount] = useState('')
  const [salerId, setSalerId] = useState('')
  const [userPhone, setUserPhone] = useState('')
  const [remark, setRemark] = useState('')

  const source = detail ?? order
  /** 已对账订单只允许修改备注，与老系统/服务端金额保护口径一致 */
  const locked = Boolean(source?.checked)

  /** 打开时用列表行先填充，详情返回后覆盖为完整字段 */
  useEffect(() => {
    if (!source) return
    setOrderSn(source.no)
    setPayType(PAY_TO_SERVER[source.payment])
    setAmount(String(source.amount))
    setSalerId(source.clerkId ? String(source.clerkId) : '')
    setUserPhone(source.memberPhone ?? '')
    setRemark(source.remark ?? '')
  }, [source])

  const open = Boolean(order)
  const orderSnRef = useRef<HTMLDivElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!order) return
    if (!locked && !payType) {
      toast.error('请选择支付方式')
      return
    }
    if (!locked && !amount.trim()) {
      toast.error('请输入实付金额')
      return
    }
    if (!locked && !salerId) {
      toast.error('请选择导购员')
      return
    }

    try {
      await mutation.mutateAsync({
        orderId: order.id,
        orderSn: orderSn.trim() || order.no,
        payType: payType || PAY_TO_SERVER[order.payment],
        orderActualAmount: Number(amount || order.amount),
        salerId: Number(salerId || order.clerkId || 0),
        userPhone: userPhone.trim(),
        remark: remark.trim()
      })
      toast.success('更新订单成功')
      onClose()
    } catch (error) {
      toast.error((error as Error).message || '更新订单失败')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        className="max-w-[520px] gap-4"
        onOpenAutoFocus={(event) => {
          // 默认聚焦订单编码区域；编码已禁用，聚焦仅用于定位与提示
          event.preventDefault()
          orderSnRef.current?.focus()
        }}
      >
        <DialogHeader className="flex-row items-center gap-3 space-y-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PencilLine className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-title">修改订单</DialogTitle>
            <DialogDescription className="text-meta">
              {locked
                ? '该订单已完成对账，仅支持修改备注'
                : '修改后立即写入订单，并同步会员积分与实付'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-border p-3">
            <div
              ref={orderSnRef}
              tabIndex={-1}
              className="space-y-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Label htmlFor="order-sn" className="text-ui">
                订单编码
              </Label>
              <Input
                id="order-sn"
                className="h-9"
                value={orderSn}
                disabled
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-ui">
                支付方式 <span className="text-destructive">*</span>
              </Label>
              <Select value={payType} onValueChange={setPayType} disabled={locked}>
                <SelectTrigger aria-label="支付方式" className="h-9 w-full">
                  <SelectValue placeholder="选择支付方式" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={PAY_TO_SERVER[option.value]}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="order-amount" className="text-ui">
                实付金额 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="order-amount"
                className="h-9"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={amount}
                disabled={locked}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-ui">
                导购员 <span className="text-destructive">*</span>
              </Label>
              <Select
                value={salerId}
                onValueChange={setSalerId}
                disabled={!isAdmin || locked}
              >
                <SelectTrigger aria-label="导购员" className="h-9 w-full">
                  <SelectValue placeholder="选择导购员" />
                </SelectTrigger>
                <SelectContent>
                  {clerks.map((clerk) => (
                    <SelectItem key={clerk.id} value={String(clerk.id)}>
                      {clerk.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="order-member" className="text-ui">
                会员
              </Label>
              <Input
                id="order-member"
                className="h-9"
                placeholder="输入会员手机号"
                value={userPhone}
                disabled={locked}
                onChange={(event) => setUserPhone(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5 rounded-xl border border-border p-3">
            <Label htmlFor="order-remark" className="text-ui">
              备注
            </Label>
            <Input
              id="order-remark"
              className="h-9"
              placeholder="输入订单备注"
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
            />
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              关闭
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '提交中' : '确定'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
