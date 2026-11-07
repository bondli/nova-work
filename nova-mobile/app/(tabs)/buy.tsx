import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import {
  Button,
  Empty,
  MemberAvatar,
  PaymentIcon,
  Row,
  Screen,
  SheetModal,
  Stepper,
} from '@/src/components/ui';
import { payLabel } from '@/src/lib/format';
import { formatCents, toCents } from '@/src/lib/money';
import { lineSubtotalCents } from '@/src/lib/pricing';
import { loadBuyMember, lookupProduct, submitSale } from '@/src/lib/pos';
import type { BuyMember, CartItem, PaymentMethod, PaymentReceipt } from '@/src/lib/types';
import { useAuthStore } from '@/src/stores/auth';
import { useCartPricing, useCartStore } from '@/src/stores/cart';
import { useUiStore } from '@/src/stores/ui';
import { colors, fs, useThemeRevision } from '@/src/theme/tokens';
import { themedStyles } from '@/src/theme/styles';

const PAYMENTS: { id: PaymentMethod; label: string }[] = [
  { id: 'wechat', label: '微信' },
  { id: 'alipay', label: '支付宝' },
  { id: 'cash', label: '现金' },
  { id: 'card', label: '银行卡' },
];

interface SuccessInfo {
  receipt: PaymentReceipt;
  memberBalance: number;
}

export default function BuyScreen() {
  useThemeRevision();
  const queryClient = useQueryClient();
  const showToast = useUiStore((state) => state.showToast);
  const user = useAuthStore((state) => state.user);
  const role = user?.role === 'admin' ? '管理员' : '导购员';

  const items = useCartStore((state) => state.items);
  const member = useCartStore((state) => state.member);
  const note = useCartStore((state) => state.note);
  const payment = useCartStore((state) => state.payment);
  const setMember = useCartStore((state) => state.setMember);
  const setPayment = useCartStore((state) => state.setPayment);
  const setNote = useCartStore((state) => state.setNote);
  const setQty = useCartStore((state) => state.setQty);
  const setDiscount = useCartStore((state) => state.setDiscount);
  const removeItem = useCartStore((state) => state.removeItem);
  const clear = useCartStore((state) => state.clear);
  const setReceipt = useCartStore((state) => state.setReceipt);
  const usePoints = useCartStore((state) => state.usePoints);
  const useBalance = useCartStore((state) => state.useBalance);
  const togglePoints = useCartStore((state) => state.togglePoints);
  const toggleBalance = useCartStore((state) => state.toggleBalance);
  const pricing = useCartPricing();

  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 同步锁：state 更新是异步的，连点时立即拦下第二次提交
  const submitLockRef = useRef(false);

  async function confirmPay(receivedInput: string): Promise<void> {
    if (!user || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const receipt = await submitSale({
        cart: items,
        member,
        pricing,
        payment,
        receivedCents: toCents(receivedInput || 0),
        clerk: { id: Number(user.id) || 0, name: user.realName || user.name },
        note,
        memberCouponId: null,
        storeCoupon: null,
      });
      const snapshot: SuccessInfo = {
        receipt,
        memberBalance: Math.max(0, (member?.balance ?? 0) - pricing.balanceDeductionCents / 100),
      };
      setReceipt(receipt);
      setPayOpen(false);
      setSuccess(snapshot);
      clear();
      // 买单成功后失效订单/统计缓存，返回订单页即可看到刚成交的订单
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['order-stats'] });
    } catch (error) {
      showToast(error instanceof Error ? error.message : '收款失败，请重试', 'error');
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  const payable = pricing.payableCents;
  const canPay = items.length > 0 && !submitting;

  return (
    <Screen
      title="买单"
      footer={
        <View style={styles.footer}>
          <Button
            title="去收款"
            disabled={!canPay}
            loading={submitting}
            onPress={() => {
              setPayOpen(true);
            }}
          />
        </View>
      }
      scroll
      contentStyle={styles.content}
    >
      <Pressable
        onPress={() => setBarcodeOpen(true)}
        style={({ pressed }) => [styles.scanCard, pressed && styles.pressed]}
      >
        <View style={styles.scanIcon}>
          <Ionicons name="barcode-outline" size={19} color={colors.brand} />
        </View>
        <View style={styles.scanBody}>
          <Text style={styles.scanTitle}>扫码或输入条码添加商品</Text>
          <Text style={styles.scanHint}>仅识别商品条码，查不到时请核对后重输</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.faint} />
      </Pressable>

      {member ? (
        <Pressable
          onPress={() => setMemberOpen(true)}
          style={({ pressed }) => [styles.memberCard, pressed && styles.pressed]}
        >
          <MemberAvatar kind={member.level} size={32} />
          <View style={styles.memberBody}>
            <Text style={styles.memberName} numberOfLines={1}>
              {member.name}
            </Text>
            <Text style={styles.memberPhone} numberOfLines={1}>
              {member.phone} · 积分 {member.points} · 余额 {formatCents(Math.round(member.balance * 100))}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.warning} />
        </Pressable>
      ) : (
        <Pressable
          onPress={() => setMemberOpen(true)}
          style={({ pressed }) => [styles.emptyMember, pressed && styles.pressed]}
        >
          <Ionicons name="person-add-outline" size={17} color={colors.brand} />
          <Text style={styles.emptyMemberText}>去添加会员</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.faint} />
        </Pressable>
      )}

      {member && (member.points > 0 || member.balance > 0) ? (
        <View style={styles.benefitCard}>
          {member.points > 0 ? (
            <BenefitRow
              label="积分抵扣"
              hint={`可用 ${member.points} 分抵 ${formatCents(member.points)}`}
              value={usePoints}
              onChange={togglePoints}
            />
          ) : null}
          {member.points > 0 && member.balance > 0 ? <View style={styles.benefitDivider} /> : null}
          {member.balance > 0 ? (
            <BenefitRow
              label="余额抵扣"
              hint={`可用 ${formatCents(Math.round(member.balance * 100))}`}
              value={useBalance}
              onChange={toggleBalance}
            />
          ) : null}
        </View>
      ) : null}

      {items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Empty text="购物车为空，扫码或输入条码添加商品" />
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <CartCard
              key={item.sku}
              item={item}
              onQty={(qty) => setQty(item.sku, qty)}
              onDiscount={(discount) => setDiscount(item.sku, discount)}
              onRemove={() => removeItem(item.sku)}
            />
          ))}
        </View>
      )}

      {items.length > 0 ? (
        <View style={styles.totalCard}>
          <View style={styles.totalRow}>
            <Row label="商品件数" value={`${pricing.itemCount} 件`} />
          </View>
          <View style={[styles.totalRow, styles.totalRowDivider]}>
            <Row label="商品原价" value={formatCents(pricing.originalCents)} />
          </View>
          <View style={[styles.totalRow, styles.totalRowDivider]}>
            <Row label="商品折扣" value={`-${formatCents(pricing.lineDiscountCents)}`} tone="danger" />
          </View>
          {pricing.pointsDeductionCents > 0 ? (
            <View style={[styles.totalRow, styles.totalRowDivider]}>
              <Row
                label={`积分抵扣（${pricing.pointsUsed} 分）`}
                value={`-${formatCents(pricing.pointsDeductionCents)}`}
                tone="danger"
              />
            </View>
          ) : null}
          {pricing.balanceDeductionCents > 0 ? (
            <View style={[styles.totalRow, styles.totalRowDivider]}>
              <Row
                label="余额抵扣"
                value={`-${formatCents(pricing.balanceDeductionCents)}`}
                tone="danger"
              />
            </View>
          ) : null}
          <View style={[styles.totalRow, styles.totalRowDivider]}>
            <Row label="应收" value={formatCents(payable)} strong />
          </View>
        </View>
      ) : null}

      {/* 常驻挂载、只切换 visible：华为 P40 上「挂载即 visible」的 Modal 会只出遮罩不出内容 */}
      <BarcodeSheet
        visible={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        onSuccess={(name) => {
          setBarcodeOpen(false);
          showToast(`已加入买单：${name}`);
        }}
      />

      <MemberSheet
        visible={memberOpen}
        onClose={() => setMemberOpen(false)}
        onSuccess={(next) => {
          setMember(next);
          setMemberOpen(false);
          showToast(`已关联会员 ${next.name}`);
        }}
      />

      <SheetModal
        visible={payOpen}
        title="确认收款"
        placement="top"
        onClose={() => {
          if (!submitting) setPayOpen(false);
        }}
      >
        {payOpen ? (
          <PayContent
            payable={payable}
            payment={payment}
            note={note}
            role={role}
            clerkName={user?.realName || user?.name || '—'}
            submitting={submitting}
            onPayment={setPayment}
            onNote={setNote}
            onConfirm={(received) => void confirmPay(received)}
          />
        ) : null}
      </SheetModal>

      <SheetModal
        visible={Boolean(success)}
        onClose={() => {
          setSuccess(null);
          setReceipt(null);
        }}
      >
        {success ? (
          <SuccessContent
            info={success}
            onContinue={() => {
              setSuccess(null);
              setReceipt(null);
            }}
          />
        ) : null}
      </SheetModal>
    </Screen>
  );
}

/** 会员权益抵扣开关：积分 / 余额，与桌面端权益卡一致 */
function BenefitRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <View style={styles.benefitRow}>
      <View style={styles.benefitBody}>
        <Text style={styles.benefitLabel}>{label}</Text>
        <Text style={styles.benefitHint} numberOfLines={1}>
          {hint}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.brand }}
        thumbColor={colors.card}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

function CartCard({
  item,
  onQty,
  onDiscount,
  onRemove,
}: {
  item: CartItem;
  onQty: (qty: number) => void;
  onDiscount: (discount: number) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.cartCard}>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`删除 ${item.name}`}
        style={styles.cartDelete}
      >
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
      </Pressable>
      <View style={styles.cartBody}>
        <View style={styles.cartTop}>
          <Text style={styles.cartName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cartTotal}>{formatCents(lineSubtotalCents(item))}</Text>
        </View>
        <Text style={styles.cartMeta} numberOfLines={1}>
          {[item.color, item.size].filter(Boolean).join(' / ') || '—'} · {item.sku}
        </Text>
        <View style={styles.cartBottom}>
          <Text style={styles.cartPrice}>单价 {formatCents(item.priceCents)}</Text>
          <View style={styles.cartControls}>
            <View style={styles.discountBox}>
              <DiscountInput value={item.discount} onCommit={onDiscount} />
              <Text style={styles.discountUnit}>折</Text>
            </View>
            <Stepper value={item.qty} onChange={onQty} min={0} />
          </View>
        </View>
      </View>
    </View>
  );
}

function DiscountInput({ value, onCommit }: { value: number; onCommit: (next: number) => void }) {
  const [text, setText] = useState(String(value));

  function commit(): void {
    const next = Number(text);
    if (Number.isFinite(next) && next >= 1 && next <= 10) {
      // 支持一位小数，如 5.3 折
      const rounded = Math.round(next * 10) / 10;
      setText(String(rounded));
      onCommit(rounded);
      return;
    }
    setText(String(value));
  }

  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onBlur={commit}
      onSubmitEditing={commit}
      keyboardType="decimal-pad"
      maxLength={4}
      style={styles.discountInput}
      selectTextOnFocus
    />
  );
}

function BarcodeSheet({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: (name: string) => void;
}) {
  const addProduct = useCartStore((state) => state.addProduct);
  const showToast = useUiStore((state) => state.showToast);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(): Promise<void> {
    const barcode = value.trim();
    if (!barcode) {
      showToast('请输入商品条码', 'warning');
      return;
    }
    setLoading(true);
    try {
      const product = await lookupProduct(barcode);
      addProduct(product);
      onSuccess(product.name);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '未查询到该条码，请重新输入', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SheetModal visible={visible} title="输入条码" placement="top" onClose={onClose}>
      <Text style={styles.fieldLabel}>商品条码</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="扫描或手动输入条码"
        placeholderTextColor={colors.faint}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => void submit()}
        style={styles.barcodeInput}
      />
      <View style={styles.sheetButton}>
        <Button title="加入买单" loading={loading} onPress={() => void submit()} />
      </View>
    </SheetModal>
  );
}

function MemberSheet({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: (member: BuyMember) => void;
}) {
  const showToast = useUiStore((state) => state.showToast);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(): Promise<void> {
    const value = phone.trim();
    if (!/^1[3-9]\d{9}$/.test(value)) {
      showToast('请输入 11 位手机号', 'warning');
      return;
    }
    setLoading(true);
    try {
      const found = await loadBuyMember(value);
      if (!found) {
        showToast('未查询到该会员，请核对手机号', 'warning');
        return;
      }
      onSuccess(found);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '会员查询失败，请重试', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SheetModal visible={visible} title="添加会员" placement="top" onClose={onClose}>
      <Text style={styles.fieldLabel}>会员手机号</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="请输入 11 位手机号"
        placeholderTextColor={colors.faint}
        keyboardType="phone-pad"
        maxLength={11}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        style={styles.barcodeInput}
      />
      <View style={styles.sheetButton}>
        <Button title="关联会员" loading={loading} onPress={() => void submit()} />
      </View>
    </SheetModal>
  );
}

function PayContent({
  payable,
  payment,
  note,
  role,
  clerkName,
  submitting,
  onPayment,
  onNote,
  onConfirm,
}: {
  payable: number;
  payment: PaymentMethod;
  note: string;
  role: string;
  clerkName: string;
  submitting: boolean;
  onPayment: (method: PaymentMethod) => void;
  onNote: (note: string) => void;
  onConfirm: (received: string) => void;
}) {
  const [received, setReceived] = useState((payable / 100).toFixed(2));

  return (
    <>
      <View style={styles.payAmount}>
        <Text style={styles.payAmountLabel}>应收</Text>
        <Text style={styles.payAmountValue}>{formatCents(payable)}</Text>
      </View>

      <Text style={styles.paySection}>支付方式</Text>
      <View style={styles.payGrid}>
        {PAYMENTS.map((option) => {
          const on = option.id === payment;
          return (
            <Pressable
              key={option.id}
              onPress={() => onPayment(option.id)}
              style={[styles.payCell, on && styles.payCellActive]}
            >
              <PaymentIcon payment={option.id} size={26} />
              <Text style={[styles.payCellText, on && styles.payCellTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.inlineRow}>
        <Text style={styles.inlineLabel}>实收</Text>
        <TextInput
          value={received}
          onChangeText={setReceived}
          keyboardType="decimal-pad"
          style={styles.inlineInput}
          selectTextOnFocus
        />
      </View>

      <Text style={[styles.fieldLabel, styles.fieldGap]}>订单备注</Text>
      <TextInput
        value={note}
        onChangeText={onNote}
        placeholder="选填，如包装/调换等说明"
        placeholderTextColor={colors.faint}
        style={styles.noteInput}
        multiline
      />

      <View style={styles.clerkRow}>
        <Text style={styles.inlineLabel}>当前登录导购</Text>
        <Text style={styles.clerkValue}>
          {clerkName} · {role}
        </Text>
      </View>

      <View style={styles.sheetButton}>
        <Button title="确认收款" loading={submitting} onPress={() => onConfirm(received)} />
      </View>
    </>
  );
}

function SuccessContent({ info, onContinue }: { info: SuccessInfo; onContinue: () => void }) {
  return (
    <>
      <View style={styles.successHead}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={26} color={colors.success} />
        </View>
        <Text style={styles.successTitle}>收款成功</Text>
        <Text style={styles.successMeta}>
          {info.receipt.orderNo} · {payLabel(info.receipt.payment)}
        </Text>
        <Text style={styles.successAmount}>{formatCents(info.receipt.payableCents)}</Text>
      </View>

      <View style={styles.successGrid}>
        <View style={styles.successCell}>
          <Text style={styles.successLabel}>获得积分</Text>
          <Text style={styles.successValue}>{info.receipt.pointsEarned}</Text>
        </View>
        <View style={styles.successCell}>
          <Text style={styles.successLabel}>会员余额</Text>
          <Text style={styles.successValue}>{formatCents(Math.round(info.memberBalance * 100))}</Text>
        </View>
      </View>

      <View style={styles.sheetButton}>
        <Button title="继续开单" onPress={onContinue} />
      </View>
    </>
  );
}

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    content: { paddingBottom: 20 },
    footer: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.card,
    },
    pressed: { opacity: 0.8 },

    scanCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 12,
    },
    scanIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brandSoft,
    },
    scanBody: { flex: 1, minWidth: 0 },
    scanTitle: { fontSize: fs(13), fontWeight: '500', color: colors.fg },
    scanHint: { fontSize: fs(10), color: colors.muted, marginTop: 2 },

    memberCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.warningSoft,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    memberBody: { flex: 1, minWidth: 0 },
    memberName: { fontSize: fs(12), fontWeight: '500', color: colors.fg },
    memberPhone: { fontSize: fs(10), color: colors.warningText, marginTop: 2, fontVariant: ['tabular-nums'] },

    emptyMember: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderStyle: 'dashed',
      paddingHorizontal: 12,
      paddingVertical: 14,
    },
    emptyMemberText: { flex: 1, fontSize: fs(12), color: colors.brand },

    benefitCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    benefitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    benefitBody: { flex: 1, minWidth: 0 },
    benefitLabel: { fontSize: fs(12), fontWeight: '500', color: colors.fg },
    benefitHint: { fontSize: fs(10), color: colors.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
    benefitDivider: { height: 1, backgroundColor: colors.divider },

    emptyCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    list: { gap: 8 },

    cartCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    cartDelete: {
      width: 34,
      height: 34,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.dangerBg,
    },
    cartBody: { flex: 1, minWidth: 0 },
    cartTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cartName: { flex: 1, fontSize: fs(13), fontWeight: '500', color: colors.fg },
    cartTotal: { flexShrink: 0, fontSize: fs(13), fontWeight: '600', color: colors.fg, fontVariant: ['tabular-nums'] },
    cartMeta: { fontSize: fs(10), color: colors.muted, marginTop: 3, fontVariant: ['tabular-nums'] },
    cartBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
    cartPrice: { flex: 1, fontSize: fs(11), color: colors.muted, fontVariant: ['tabular-nums'] },
    cartControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    discountBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 9,
      paddingHorizontal: 8,
      height: 34,
    },
    discountInput: {
      width: 32,
      padding: 0,
      fontSize: fs(13),
      textAlign: 'center',
      color: colors.fg,
      fontVariant: ['tabular-nums'],
    },
    discountUnit: { fontSize: fs(11), color: colors.muted },

    totalCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    totalRow: { paddingHorizontal: 12, paddingVertical: 10 },
    totalRowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },

    fieldLabel: { fontSize: fs(11), color: colors.muted, marginBottom: 6 },
    fieldGap: { marginTop: 12 },
    barcodeInput: {
      height: 42,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      fontSize: fs(14),
      color: colors.fg,
      backgroundColor: colors.card,
    },
    sheetButton: { marginTop: 16 },

    payAmount: { alignItems: 'center', paddingVertical: 8 },
    payAmountLabel: { fontSize: fs(10), color: colors.muted },
    payAmountValue: {
      fontSize: fs(30),
      fontWeight: '600',
      color: colors.fg,
      marginTop: 2,
      fontVariant: ['tabular-nums'],
    },
    paySection: { fontSize: fs(11), color: colors.muted, marginTop: 8, marginBottom: 6 },
    payGrid: { flexDirection: 'row', gap: 8 },
    payCell: {
      flex: 1,
      alignItems: 'center',
      gap: 5,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    payCellActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
    payCellText: { fontSize: fs(12), color: colors.fg },
    payCellTextActive: { color: colors.brandDark, fontWeight: '600' },

    inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    inlineLabel: { minWidth: 76, fontSize: fs(12), color: colors.muted },
    inlineInput: {
      flex: 1,
      minWidth: 0,
      height: 40,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      fontSize: fs(14),
      color: colors.fg,
      backgroundColor: colors.card,
      fontVariant: ['tabular-nums'],
    },
    noteInput: {
      minHeight: 56,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: fs(12),
      color: colors.fg,
      backgroundColor: colors.card,
      textAlignVertical: 'top',
    },
    clerkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    clerkValue: { fontSize: fs(12), fontWeight: '500', color: colors.fg },

    successHead: { alignItems: 'center', paddingTop: 6, paddingBottom: 4 },
    successIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.successBg,
      marginBottom: 8,
    },
    successTitle: { fontSize: fs(15), fontWeight: '600', color: colors.fg },
    successMeta: { fontSize: fs(10), color: colors.muted, marginTop: 4, fontVariant: ['tabular-nums'] },
    successAmount: {
      fontSize: fs(26),
      fontWeight: '600',
      color: colors.fg,
      marginTop: 8,
      fontVariant: ['tabular-nums'],
    },
    successGrid: { flexDirection: 'row', gap: 8, marginTop: 16 },
    successCell: {
      flex: 1,
      minWidth: 0,
      backgroundColor: colors.subtle,
      borderRadius: 10,
      padding: 12,
    },
    successLabel: { fontSize: fs(10), color: colors.muted },
    successValue: { fontSize: fs(15), fontWeight: '600', color: colors.fg, marginTop: 2, fontVariant: ['tabular-nums'] },
  });
}
