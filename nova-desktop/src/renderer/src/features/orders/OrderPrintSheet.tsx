import { useMemo, useState } from 'react'
import { Loader2, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { SheetDrawer } from '@renderer/components/common/SheetDrawer'
import { buildReceiptHtml } from '@renderer/lib/receipt'
import { printReceiptHtml } from '@renderer/lib/print'
import { useMarkOrderPrinted, useOrderQuery, useReceiptMemberQuery } from './queries'

interface OrderPrintSheetProps {
  orderNo: string | null
  onClose: () => void
}

/** 订单打印小票：先预览 58mm 小票，再调用系统打印 */
export function OrderPrintSheet({ orderNo, onClose }: OrderPrintSheetProps) {
  const { data: order, isLoading } = useOrderQuery(orderNo)
  const { data: member } = useReceiptMemberQuery(order?.memberPhone ?? null)
  const markPrinted = useMarkOrderPrinted()
  const [printing, setPrinting] = useState(false)

  const html = useMemo(
    () => (order ? buildReceiptHtml(order, member) : ''),
    [order, member]
  )

  async function handlePrint(): Promise<void> {
    if (!order || !html) return
    setPrinting(true)
    try {
      const result = await printReceiptHtml(html)
      if (!result.printed) {
        toast.error(
          result.reason === 'cancelled'
            ? '已取消打印'
            : `打印失败：${result.reason || '未知原因'}`
        )
        return
      }
      await markPrinted.mutateAsync(order.no)
      toast.success('小票已发送到打印机')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '打印失败')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <SheetDrawer
      open={Boolean(orderNo)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="打印小票"
      description={order ? `订单号 ${order.no}` : undefined}
      width="lg"
      bodyClassName="flex flex-col items-center bg-surface p-4"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={printing}>
            关闭
          </Button>
          <Button type="button" onClick={() => void handlePrint()} disabled={!html || printing}>
            {printing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Printer className="h-4 w-4" aria-hidden="true" />
            )}
            {printing ? '正在打印…' : '打印小票'}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <p className="py-10 text-ui text-muted-foreground">正在加载订单…</p>
      ) : order ? (
        <iframe
          title="小票预览"
          srcDoc={html}
          className="h-[calc(100vh-170px)] w-[320px] shrink-0 rounded-xl border border-border bg-white shadow-sm"
        />
      ) : (
        <p className="py-10 text-ui text-muted-foreground">订单已不存在，无法打印小票</p>
      )}
    </SheetDrawer>
  )
}
