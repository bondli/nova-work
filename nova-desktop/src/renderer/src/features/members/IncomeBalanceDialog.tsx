import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import type { Member, MemberPayment } from '@shared/types/member'
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
import { formatMoney } from '@renderer/lib/format'
import { PAYMENT_OPTIONS } from '@renderer/lib/payment'
import { useClerksQuery } from '@renderer/features/orders/queries'
import { useRechargeMember } from './queries'

interface IncomeBalanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: Member | null
}

/** 赠送类型，与老系统 IncomeBalance schema 一致 */
const GIFT_TYPE_OPTIONS: { value: 'balance' | 'goodsValue'; label: string }[] = [
  { value: 'balance', label: '现金余额' },
  { value: 'goodsValue', label: '商品吊牌价值' }
]

/**
 * 会员充值弹窗，字段对齐老系统 IncomeBalance：
 * 充值金额 / 赠送金额 / 赠送类型 / 变动原因 / 成单导购员 / 支付方式。
 */
export function IncomeBalanceDialog({ open, onOpenChange, member }: IncomeBalanceDialogProps) {
  const mutation = useRechargeMember()
  const { data: clerks = [] } = useClerksQuery()

  const [amount, setAmount] = useState('')
  const [gift, setGift] = useState('')
  const [giftType, setGiftType] = useState<'balance' | 'goodsValue'>('balance')
  const [reason, setReason] = useState('')
  const [salerId, setSalerId] = useState('')
  const [payment, setPayment] = useState<MemberPayment>('wechat')
  const [formError, setFormError] = useState('')

  // 每次打开恢复初始值，避免上次输入残留
  useEffect(() => {
    if (!open) return
    setAmount('')
    setGift('')
    setGiftType('balance')
    setReason('')
    setSalerId('')
    setPayment('wechat')
    setFormError('')
  }, [open, member?.id])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!member) return

    const recharge = Number(amount)
    const giftAmount = gift.trim() ? Number(gift) : 0

    if (!Number.isFinite(recharge) || recharge <= 0) {
      setFormError('充值金额需大于 0')
      return
    }
    if (!Number.isFinite(giftAmount) || giftAmount < 0) {
      setFormError('赠送金额不能为负数')
      return
    }

    const saler = clerks.find((item) => String(item.id) === salerId)

    mutation.mutate(
      {
        memberId: member.id,
        amount: recharge,
        gift: giftAmount,
        payment,
        remark: reason,
        sendValueType: giftType,
        salerId: saler ? saler.id : undefined,
        salerName: saler?.name
      },
      {
        onSuccess: (updated) => {
          toast.success(
            `已为 ${updated.name} 充值，当前余额 ${formatMoney(updated.balance, { decimals: 0 })}`
          )
          onOpenChange(false)
        },
        onError: (error) => {
          setFormError(error instanceof Error ? error.message : '充值失败，请稍后重试')
        }
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] max-w-[calc(100vw-48px)]">
        <DialogHeader>
          <DialogTitle className="text-title font-semibold">会员充值</DialogTitle>
          <DialogDescription className="text-meta text-muted-foreground">
            {member
              ? `${member.name} · ${member.phone} · 当前余额 ${formatMoney(member.balance, {
                  decimals: 0
                })}`
              : '请选择要充值的会员'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="recharge-amount" className="text-ui">
                充值金额
              </Label>
              <Input
                id="recharge-amount"
                type="number"
                min={1}
                step={1}
                placeholder="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recharge-gift" className="text-ui">
                赠送金额
              </Label>
              <Input
                id="recharge-gift"
                type="number"
                min={0}
                step={1}
                placeholder="选填"
                value={gift}
                onChange={(event) => setGift(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recharge-gift-type" className="text-ui">
                赠送类型
              </Label>
              <Select
                value={giftType}
                onValueChange={(value) => setGiftType(value as 'balance' | 'goodsValue')}
              >
                <SelectTrigger id="recharge-gift-type" className="h-8 w-full text-ui">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GIFT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-ui">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recharge-payment" className="text-ui">
                支付方式
              </Label>
              <Select
                value={payment}
                onValueChange={(value) => setPayment(value as MemberPayment)}
              >
                <SelectTrigger id="recharge-payment" className="h-8 w-full text-ui">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-ui">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="recharge-reason" className="text-ui">
              变动原因
            </Label>
            <Input
              id="recharge-reason"
              placeholder="输入变动原因"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="recharge-saler" className="text-ui">
              成单导购员
            </Label>
            <Select value={salerId} onValueChange={setSalerId}>
              <SelectTrigger id="recharge-saler" className="h-8 w-full text-ui">
                <SelectValue placeholder="请选择成单导购员" />
              </SelectTrigger>
              <SelectContent>
                {clerks.map((clerk) => (
                  <SelectItem key={clerk.id} value={String(clerk.id)} className="text-ui">
                    {clerk.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formError ? <p className="text-meta text-destructive">{formError}</p> : null}

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending || !member}>
              {mutation.isPending ? '提交中' : '确认充值'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
