import type { PaymentReceipt } from '@shared/types/buy'
import { CircleCheck, Printer, RotateCcw } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { Button } from '@renderer/components/ui/button'
import { formatMoney } from '@renderer/lib/format'
import { PAY_METHOD_LABEL } from './labels'

interface PaymentSuccessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  receipt: PaymentReceipt | null
  onPrint: () => void
}

/** 收款成功回执：对齐 demo 的金额、积分 / 余额 / 找零三宫格与双按钮 */
export function PaymentSuccessDialog({
  open,
  onOpenChange,
  receipt,
  onPrint
}: PaymentSuccessDialogProps) {
  if (!receipt) return null

  const change = Math.max(0, receipt.received - receipt.payable)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[420px]">
        {/* 用 flex 居中替代 AlertDialogHeader 的 grid，避免 sm 断点回落为左对齐 */}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
            <CircleCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <AlertDialogTitle className="text-brand">收款成功</AlertDialogTitle>
          <AlertDialogDescription>
            订单 {receipt.orderNo} · {PAY_METHOD_LABEL[receipt.payment]}
          </AlertDialogDescription>
        </div>

        <p className="text-center text-display-lg font-semibold tracking-tight tnum">
          {formatMoney(receipt.payable)}
        </p>

        <div className="grid grid-cols-3 gap-2 text-center text-ui">
          <div className="rounded-lg bg-surface p-2">
            <p className="text-meta text-muted-foreground">积分</p>
            <p className="mt-0.5 font-medium tnum">+{receipt.pointsEarned}</p>
          </div>
          <div className="rounded-lg bg-surface p-2">
            <p className="text-meta text-muted-foreground">余额抵扣</p>
            <p className="mt-0.5 font-medium tnum">{formatMoney(receipt.balanceUsed)}</p>
          </div>
          <div className="rounded-lg bg-surface p-2">
            <p className="text-meta text-muted-foreground">找零</p>
            <p className="mt-0.5 font-medium tnum">{formatMoney(change)}</p>
          </div>
        </div>

        <AlertDialogFooter className="mt-2 flex-row gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onPrint}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            打印小票
          </Button>
          <Button type="button" className="flex-1" onClick={() => onOpenChange(false)}>
            继续开单
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface RestoreHeldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 当前购物车款数 */
  currentCount: number
  onConfirm: () => void
}

/** 恢复挂单确认：当前清单非空时提示会被覆盖 */
export function RestoreHeldDialog({
  open,
  onOpenChange,
  currentCount,
  onConfirm
}: RestoreHeldDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[420px]">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <AlertDialogTitle className="text-title">恢复挂单</AlertDialogTitle>
              <AlertDialogDescription className="mt-1 leading-relaxed">
                当前待售清单还有 {currentCount} 款商品，恢复挂单会覆盖当前清单且无法撤销。
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={onConfirm}>
            继续恢复
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
