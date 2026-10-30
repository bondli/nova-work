import type { Order } from '@shared/types/order'
import { formatMoney } from './format'
import { PAYMENT_LABEL } from './payment'

/** 小票上展示的会员权益信息，来自 /member/detail */
export interface ReceiptMember {
  point?: number
  coupon?: number
  balance?: number
}

const STORE_NAME = '戴维贝拉世纪金源店'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function money(value: number): string {
  return formatMoney(Number.isFinite(value) ? value : 0)
}

/**
 * 生成 58mm 热敏小票 HTML，版式对齐老系统 components/Bill。
 * 打印时由主进程放进隐藏窗口交给 Electron 原生打印。
 */
export function buildReceiptHtml(order: Order, member?: ReceiptMember | null): string {
  const itemRows = order.items
    .filter((item) => item.quantity > 0)
    .map((item) => {
      const meta = `${item.styleNo || item.sku}  ${item.color}  ${item.size}`
      return `<tr>
        <td colspan="3" class="item-title">${escapeHtml(item.name)}</td>
      </tr>
      <tr>
        <td colspan="3" class="item-meta">${escapeHtml(meta)}</td>
      </tr>
      <tr class="item-values">
        <td class="num">${escapeHtml(money(item.price))}</td>
        <td class="num">×${escapeHtml(item.quantity)}</td>
        <td class="num">${escapeHtml(money(item.price * item.quantity))}</td>
      </tr>`
    })
    .join('')

  const infoRows = [
    ['订单编号', order.no],
    ['订单时间', order.paidAt],
    ['商品数量', String(order.itemCount)],
    ...(order.memberPhone ? [['会员手机号', order.memberPhone]] : []),
    ...(order.memberName ? [['会员昵称', order.memberName]] : []),
    ['导购', order.clerkAccount || order.clerk || '无']
  ]
    .map(
      ([label, value]) =>
        `<div class="row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`
    )
    .join('')

  const amountRows = [
    order.payable > 0
      ? `<div class="row"><span>应收金额</span><span>${escapeHtml(money(order.payable))}</span></div>`
      : '',
    order.usePoint > 0
      ? `<div class="row"><span>积分抵扣</span><span>-${escapeHtml(money(order.usePoint / 100))}</span></div>`
      : '',
    order.coupon > 0
      ? `<div class="row"><span>优惠券抵扣</span><span>-${escapeHtml(money(order.coupon))}</span></div>`
      : '',
    order.balanceUsed > 0
      ? `<div class="row"><span>余额抵扣</span><span>-${escapeHtml(money(order.balanceUsed))}</span></div>`
      : '',
    `<div class="row total"><span>实收金额</span><span>${escapeHtml(money(order.amount))} ${escapeHtml(PAYMENT_LABEL[order.payment])}</span></div>`
  ]
    .filter(Boolean)
    .join('')

  const memberBlock = order.memberPhone
    ? `<section class="member">
      <div class="member-title">会员信息</div>
      <div class="row"><span>会员卡号</span><span>${escapeHtml(order.memberPhone)}</span></div>
      <div class="row"><span>当前积分</span><span>${escapeHtml(member?.point ?? 0)}</span></div>
      <div class="row"><span>可用优惠券</span><span>${escapeHtml(member?.coupon ?? 0)} 张</span></div>
      <div class="row"><span>储值余额</span><span>${escapeHtml(money(member?.balance ?? 0))}</span></div>
      <div class="row"><span>本次积分</span><span>${escapeHtml(Math.floor(order.amount))}</span></div>
    </section>`
    : ''

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>小票 ${escapeHtml(order.no)}</title>
<style>
  @page { size: 52mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 52mm;
    margin: 0 auto;
    padding: 3mm 2.5mm;
    color: #000;
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 9px;
    line-height: 1.45;
  }
  h1 { margin: 0 0 1mm; font-size: 13px; text-align: center; letter-spacing: 0.5px; }
  .store-sub { text-align: center; font-size: 8px; color: #333; margin-bottom: 2mm; }
  .divider { border-top: 1px dashed #000; margin: 1.6mm 0; }
  .row { display: flex; justify-content: space-between; gap: 2mm; }
  .row > span:last-child { text-align: right; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; }
  th { font-weight: 600; text-align: left; padding: 0.6mm 0; border-bottom: 1px solid #000; }
  th.num, td.num { text-align: right; }
  td.item-title { padding-top: 1.2mm; font-weight: 600; }
  td.item-meta { color: #333; font-size: 8px; padding-bottom: 0.4mm; }
  tr.item-values td { padding-bottom: 1mm; border-bottom: 1px dashed #999; }
  .total { font-size: 10px; font-weight: 700; margin-top: 1mm; }
  .member-title { font-weight: 600; margin-bottom: 0.8mm; }
  .footer { margin-top: 2mm; text-align: center; font-size: 8px; color: #222; }
  .footer p { margin: 0.6mm 0; }
</style>
</head>
<body>
  <h1>${escapeHtml(STORE_NAME)}</h1>
  <div class="store-sub">销售小票</div>
  <div class="divider"></div>
  ${infoRows}
  <div class="divider"></div>
  <table>
    <thead>
      <tr>
        <th class="num">单价</th>
        <th class="num">数量</th>
        <th class="num">金额</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="divider"></div>
  ${amountRows}
  ${memberBlock ? `<div class="divider"></div>${memberBlock}` : ''}
  <div class="footer">
    <p>咨询热线：400-881-8288</p>
    <p>退换货请于购买后 7 日内携带小票办理</p>
    <p>谢谢惠顾，欢迎再次光临</p>
  </div>
</body>
</html>`
}
