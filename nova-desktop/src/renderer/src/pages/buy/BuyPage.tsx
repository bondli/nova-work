import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, Loader2, RotateCcw, ScanBarcode, ShoppingBag, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type {
  BuyCoupon,
  BuyMember,
  CartItem,
  HeldOrder,
  PaymentMethod,
  PaymentReceipt
} from '@shared/types/buy'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { DataTable } from '@renderer/components/common/DataTable'
import { formatMoney } from '@renderer/lib/format'
import { calculatePricing, roundMoney } from '@renderer/lib/pricing'
import { useAuthStore } from '@renderer/stores/auth-store'
import { analyticsKeys } from '@renderer/features/data/queries'
import { inventoryKeys } from '@renderer/features/inventory/queries'
import { memberKeys } from '@renderer/features/members/queries'
import { orderKeys, useClerksQuery } from '@renderer/features/orders/queries'
import { OrderPrintSheet } from '@renderer/features/orders/OrderPrintSheet'
import { createCartColumns } from '@renderer/features/buy/columns'
import { PaymentSuccessDialog, RestoreHeldDialog } from '@renderer/features/buy/BuyDialogs'
import { BuySidebar } from '@renderer/features/buy/BuySidebar'
import { MemberPickerDialog } from '@renderer/features/buy/MemberPickerDialog'
import { loadBuyMember, loadStoreCoupons, lookupProduct, submitSale } from '@renderer/features/buy/api'
import { readHeldOrder, writeHeldOrder } from '@renderer/features/buy/held-store'

/**
 * 收银台：扫码加入 → 待售清单 → 会员权益 → 收款。
 * 商品、会员、导购与下单均来自 nova-pos-server；挂单仍存本地。
 */
export function BuyPage() {
  const queryClient = useQueryClient()
  const scanRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore((state) => state.user)
  const { data: clerksData = [] } = useClerksQuery()

  const [cart, setCart] = useState<CartItem[]>([])
  const [member, setMember] = useState<BuyMember | null>(null)
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null)
  const [storeCoupons, setStoreCoupons] = useState<BuyCoupon[]>([])
  const [selectedStoreCouponId, setSelectedStoreCouponId] = useState<string | null>(null)
  const [usePoints, setUsePoints] = useState(false)
  const [useBalance, setUseBalance] = useState(false)
  const [clerk, setClerk] = useState('')
  const [note, setNote] = useState('')
  const [payment, setPayment] = useState<PaymentMethod>('wechat')
  const [received, setReceived] = useState('')
  const [scanValue, setScanValue] = useState('')
  const [scanning, setScanning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // 同步锁：setState 生效前仍可能被连点，用 ref 立刻拦住第二次提交
  const submitLockRef = useRef(false)
  const [held, setHeld] = useState<HeldOrder | null>(() => readHeldOrder())
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null)
  /** 收款成功后待打印小票的订单号，打开与订单列表相同的打印抽屉 */
  const [printNo, setPrintNo] = useState<string | null>(null)

  const clerks = useMemo(
    () =>
      clerksData.length > 0
        ? clerksData
        : user
          ? [{ id: 0, username: user.username, name: user.name }]
          : [],
    [clerksData, user]
  )

  // 默认导购：员工表加载后，若当前值不在列表中（如先用了登录人名兜底），重新对齐
  useEffect(() => {
    if (clerks.length === 0) return
    if (clerk && clerks.some((item) => item.name === clerk)) return
    const self = clerks.find((item) => item.username === user?.username)
    setClerk(self?.name ?? clerks[0]?.name ?? '')
  }, [clerk, clerks, user?.username])

  const selectedCoupon = member?.coupons.find((item) => item.id === selectedCouponId) ?? null
  const selectedStoreCoupon =
    storeCoupons.find((item) => item.id === selectedStoreCouponId) ?? null

  const pricing = useMemo(
    () =>
      calculatePricing(cart, {
        member,
        coupon: selectedCoupon,
        storeCoupon: selectedStoreCoupon,
        usePoints,
        useBalance
      }),
    [cart, member, selectedCoupon, selectedStoreCoupon, usePoints, useBalance]
  )

  // 折后金额：店铺券按它匹配门槛，与所选券无关，避免选券后反复重查
  const discountedTotal = roundMoney(pricing.originalTotal - pricing.lineDiscount)

  /** 折后金额变化时重新拉取可用店铺券，并清掉上一步已选的券 */
  useEffect(() => {
    if (!cart.length || discountedTotal <= 0) {
      setStoreCoupons([])
      setSelectedStoreCouponId(null)
      return
    }
    let cancelled = false
    setSelectedStoreCouponId(null)
    void loadStoreCoupons(discountedTotal)
      .then((list) => {
        if (!cancelled) setStoreCoupons(list)
      })
      .catch(() => {
        // 店铺券查询失败不阻断收款，只是本轮无券可选
        if (!cancelled) setStoreCoupons([])
      })
    return () => {
      cancelled = true
    }
  }, [cart.length, discountedTotal])

  useEffect(() => {
    setReceived(pricing.payable.toFixed(2))
  }, [pricing.payable])

  // 进入买单页自动聚焦条码输入框，扫码枪可直接输入
  useEffect(() => {
    scanRef.current?.focus()
  }, [])

  /** 查询并加入清单；重复 SKU 只累加数量 */
  async function submitScan(raw: string): Promise<void> {
    const value = raw.trim()
    if (!value || scanning) return

    setScanning(true)
    try {
      const { product, stock } = await lookupProduct(value)
      setCart((current) => {
        const existing = current.find((item) => item.sku === product.sku)
        if (existing) {
          return current.map((item) =>
            item.sku === product.sku ? { ...item, qty: item.qty + 1 } : item
          )
        }
        return [...current, { ...product, qty: 1, discount: 6 }]
      })
      setScanValue('')
      // 库存不足仅提示，仍按超卖加入清单（门店实体可能有货、库存数据不准）
      if (stock <= 0) {
        toast.warning(`SKU ${product.sku} 库存不足（${stock}），已按超卖加入清单`)
      } else {
        toast.success(`已加入：${product.name}`)
      }
      scanRef.current?.focus()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '商品查询失败')
    } finally {
      setScanning(false)
    }
  }

  /** 回车：有内容即查询 */
  function handleScanSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void submitScan(scanValue)
  }

  /** 输入满 13 位条码时自动查询 */
  function handleScanChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value
    setScanValue(next)
    if (next.trim().length === 13) void submitScan(next)
  }

  function updateQty(id: string, qty: number) {
    setCart((current) => current.map((item) => (item.id === id ? { ...item, qty } : item)))
  }

  function updateDiscount(id: string, discount: number) {
    setCart((current) =>
      current.map((item) => (item.id === id ? { ...item, discount } : item))
    )
  }

  function removeItem(id: string) {
    setCart((current) => current.filter((item) => item.id !== id))
    toast.success('商品已移除')
  }

  function clearCart() {
    if (!cart.length) return
    setCart([])
    toast.success('清单已清空')
  }

  function holdOrder() {
    if (!cart.length) return
    const snapshot: HeldOrder = {
      cart,
      member,
      clerk,
      note,
      heldAt: new Date().toISOString()
    }
    writeHeldOrder(snapshot)
    setHeld(snapshot)
    setCart([])
    toast.success('已挂单，可在「恢复挂单」中取回')
  }

  function restoreHeld() {
    if (!held) return
    if (cart.length) {
      setRestoreOpen(true)
      return
    }
    applyRestore()
  }

  function applyRestore() {
    if (!held) return
    setCart(held.cart)
    setMember(held.member)
    setClerk(held.clerk)
    setNote(held.note)
    setHeld(null)
    writeHeldOrder(null)
    setRestoreOpen(false)
    toast.success('挂单已恢复')
  }

  async function confirmPayment(): Promise<void> {
    if (submitLockRef.current) {
      return
    }
    if (!cart.length) {
      toast.error('待售清单为空，请先加入商品')
      return
    }
    const clerkInfo = clerks.find((item) => item.name === clerk) ?? clerks[0]
    if (!clerkInfo) {
      toast.error('未加载到导购员，请稍后重试')
      return
    }

    // 允许议价 / 抹零：实收低于应收也能下单，空值按应收金额处理
    const receivedText = received.trim()
    const receivedValue = receivedText === '' ? pricing.payable : Number(receivedText)
    if (!Number.isFinite(receivedValue) || receivedValue < 0) {
      toast.error('请输入有效的实收金额')
      return
    }

    submitLockRef.current = true
    setSubmitting(true)
    try {
      const result = await submitSale({
        cart,
        member,
        pricing,
        payment,
        received: receivedValue,
        clerk: clerkInfo,
        note,
        couponId: selectedCouponId,
        storeCoupon: selectedStoreCoupon
      })

      setReceipt(result)
      setPayOpen(true)
      setCart([])
      setNote('')
      setUsePoints(false)
      setUseBalance(false)
      setSelectedCouponId(null)
      setSelectedStoreCouponId(null)

      // 会员积分 / 余额 / 券已由服务端变更，重新拉取收银台权益
      if (member) {
        void loadBuyMember(member.id)
          .then((next) => setMember(next))
          .catch(() => undefined)
      }

      // 订单 / 库存 / 会员 / 数据四个域失效重取
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKeys.all }),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: memberKeys.all }),
        queryClient.invalidateQueries({ queryKey: analyticsKeys.all })
      ])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '下单失败，请稍后重试')
    } finally {
      submitLockRef.current = false
      setSubmitting(false)
    }
  }

  const columns = createCartColumns({
    onQtyChange: updateQty,
    onDiscountChange: updateDiscount,
    onRemove: removeItem
  })

  return (
    <div className="flex h-full gap-4 overflow-hidden p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="shrink-0 rounded-xl border border-border bg-card p-3">
          <form onSubmit={handleScanSubmit}>
            <div className="relative">
              {scanning ? (
                <Loader2
                  className="pointer-events-none absolute left-3 top-3 h-4 w-4 animate-spin text-primary"
                  aria-hidden="true"
                />
              ) : (
                <ScanBarcode
                  className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-primary"
                  aria-hidden="true"
                />
              )}
              <Input
                ref={scanRef}
                className="h-10 pl-9 text-body"
                aria-label="扫码或输入款号"
                value={scanValue}
                disabled={scanning}
                onChange={handleScanChange}
              />
            </div>
          </form>
        </div>

        <DataTable
          columns={columns}
          data={cart}
          rowKey="id"
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body font-semibold">待售清单</span>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!cart.length}
                  onClick={clearCart}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  清空
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!cart.length}
                  onClick={holdOrder}
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  挂单
                </Button>
                {held ? (
                  <Button type="button" variant="outline" size="sm" onClick={restoreHeld}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    恢复挂单
                  </Button>
                ) : null}
              </div>
            </div>
          }
          empty={{
            icon: ShoppingBag,
            title: '暂无待售商品',
            description: '扫描条码或输入款号 / SKU 加入清单'
          }}
          footer={
            <div className="flex flex-wrap items-center gap-4 bg-surface px-4 py-2.5 text-ui text-muted-foreground">
              {/* 汇总文案对齐老系统 WaitSaleSummary：待售 / 件 / 原价 / 应付 */}
              <span>
                待售{' '}
                <span className="font-semibold text-foreground tnum">{cart.length} 款</span> ·{' '}
                {pricing.itemCount} 件
              </span>
              <span>
                原价{' '}
                <span className="font-semibold text-foreground tnum">
                  {formatMoney(pricing.originalTotal)}
                </span>
              </span>
              <span>
                优惠{' '}
                <span className="font-semibold text-destructive tnum">
                  -{formatMoney(pricing.totalDiscount)}
                </span>
              </span>
              <span className="ml-auto">
                应付{' '}
                <span className="text-title font-semibold text-foreground tnum">
                  {formatMoney(pricing.payable)}
                </span>
              </span>
            </div>
          }
        />
      </div>

      <BuySidebar
        member={member}
        pricing={pricing}
        cartCount={cart.length}
        selectedCoupon={selectedCoupon}
        onSelectCoupon={setSelectedCouponId}
        storeCoupons={storeCoupons}
        selectedStoreCoupon={selectedStoreCoupon}
        onSelectStoreCoupon={setSelectedStoreCouponId}
        usePoints={usePoints}
        onUsePointsChange={setUsePoints}
        useBalance={useBalance}
        onUseBalanceChange={setUseBalance}
        clerk={clerk}
        clerks={clerks}
        onClerkChange={setClerk}
        note={note}
        onNoteChange={setNote}
        payment={payment}
        onPaymentChange={setPayment}
        received={received}
        onReceivedChange={setReceived}
        submitting={submitting}
        onConfirm={() => void confirmPayment()}
        onChangeMember={() => setMemberOpen(true)}
      />

      <MemberPickerDialog
        open={memberOpen}
        onOpenChange={setMemberOpen}
        onSelect={(next) => {
          setMember(next)
          setSelectedCouponId(null)
        }}
      />

      <RestoreHeldDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        currentCount={cart.length}
        onConfirm={applyRestore}
      />

      <PaymentSuccessDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        receipt={receipt}
        onPrint={() => {
          if (!receipt) return
          setPayOpen(false)
          setPrintNo(receipt.orderNo)
        }}
      />

      <OrderPrintSheet orderNo={printNo} onClose={() => setPrintNo(null)} />
    </div>
  )
}
