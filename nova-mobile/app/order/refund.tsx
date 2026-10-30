import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, Empty, Loading, Screen, Stepper, TextField } from '@/src/components/ui';
import { ApiError } from '@/src/lib/api';
import { formatDateTime } from '@/src/lib/format';
import { formatYuan } from '@/src/lib/money';
import { queryOrderDetail, queryOrderItems, refundOrder } from '@/src/lib/pos';
import { useUiStore } from '@/src/stores/ui';
import { themedStyles } from '@/src/theme/styles';
import { colors, fs, space, useThemeRevision } from '@/src/theme/tokens';

const PAY_LABELS: Record<string, string> = {
  weixin: '微信',
  wechat: '微信',
  alipay: '支付宝',
  cash: '现金',
  card: '银行卡',
  other: '其他',
};

export default function OrderRefundScreen() {
  useThemeRevision();
  const { orderSn = '' } = useLocalSearchParams<{ orderSn?: string }>();
  const queryClient = useQueryClient();
  const showToast = useUiStore((state) => state.showToast);

  const [picked, setPicked] = useState<number[] | null>(null);
  const [editedCounts, setEditedCounts] = useState<Record<number, number>>({});
  const [amountDraft, setAmountDraft] = useState<string | null>(null);
  const [amountType, setAmountType] = useState<'money' | 'balance'>('money');
  const [saving, setSaving] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['order-detail', orderSn],
    queryFn: () => queryOrderDetail(orderSn),
    enabled: Boolean(orderSn),
  });
  const itemsQuery = useQuery({
    queryKey: ['order-items', orderSn],
    queryFn: () => queryOrderItems(orderSn),
    enabled: Boolean(orderSn),
  });

  const detail = detailQuery.data ?? null;
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const refundable = useMemo(() => items.filter((item) => (item.counts ?? 0) > 0), [items]);

  // 默认全选全部可退商品，用户点击后才落到 picked，避免 effect 同步状态
  const selected = picked ?? refundable.map((item) => item.id);
  const selectedItems = refundable.filter((item) => selected.includes(item.id));

  const countOf = (id: number, fallback: number): number => editedCounts[id] ?? fallback;
  const total = selectedItems.reduce(
    (sum, item) => sum + Number(item.actualPrice ?? 0) * countOf(item.id, item.counts),
    0,
  );
  const refundAmount = amountDraft ?? total.toFixed(2);
  const balance = Number(detail?.useBalance ?? 0);

  function toggle(id: number): void {
    setPicked(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  async function submit(): Promise<void> {
    if (!detail || saving) return;
    if (selectedItems.length === 0) {
      showToast('请选择需要退货的商品', 'warning');
      return;
    }
    const value = Number(refundAmount);
    if (!Number.isFinite(value) || value < 0) {
      showToast('请输入正确的退款金额', 'warning');
      return;
    }

    setSaving(true);
    try {
      await refundOrder({
        orderSn: detail.orderSn,
        refundItems: selectedItems.map((item) => ({
          id: item.id,
          sku: item.sku,
          counts: countOf(item.id, item.counts),
        })),
        refundAmount: value,
        amountType,
      });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['order-detail'] });
      await queryClient.invalidateQueries({ queryKey: ['order-items'] });
      showToast('退货已完成');
      router.back();
    } catch (caught) {
      showToast(caught instanceof ApiError ? caught.message : '退货失败，请稍后重试', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title="退货"
      back
      scroll
      footer={
        <View style={styles.footer}>
          <Button
            title={`确认退货 · 退款 ${formatYuan(total)}`}
            onPress={() => void submit()}
            loading={saving}
            disabled={!detail || selectedItems.length === 0}
          />
        </View>
      }
    >
      {detailQuery.isLoading || itemsQuery.isLoading ? (
        <Loading />
      ) : !detail ? (
        <Empty text="未查询到该订单" />
      ) : (
        <>
          <Card style={styles.card}>
            <Text style={styles.section}>订单信息</Text>
            <InfoLine label="订单编号" value={detail.orderSn} />
            <InfoLine label="下单时间" value={formatDateTime(detail.createdAt)} />
            <InfoLine label="会员手机号" value={detail.userPhone || '散客'} />
            <InfoLine label="实付金额" value={formatYuan(detail.orderActualAmount)} />
            <InfoLine label="支付方式" value={PAY_LABELS[detail.payType] ?? detail.payType} />
            <InfoLine label="导购" value={detail.salerName || '—'} />
          </Card>

          <Text style={styles.hint}>勾选需要退货的商品，件数在下方「确认退回数量」中逐件确认</Text>

          <Card style={styles.card}>
            <Text style={styles.section}>选择退货商品</Text>
            {refundable.length === 0 ? (
              <Text style={styles.hint}>该订单暂无可退商品</Text>
            ) : (
              refundable.map((item) => {
                const active = selected.includes(item.id);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => toggle(item.id)}
                    style={styles.itemRow}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                  >
                    <Ionicons
                      name={active ? 'checkbox' : 'square-outline'}
                      size={18}
                      color={active ? colors.brand : colors.faint}
                    />
                    <View style={styles.itemBody}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.itemMeta} numberOfLines={1}>
                        {item.sku} · {[item.color, item.size].filter(Boolean).join(' / ') || '—'}
                      </Text>
                    </View>
                    <View style={styles.itemRight}>
                      <Text style={styles.itemPrice}>{formatYuan(item.actualPrice)}</Text>
                      <Text style={styles.itemMeta}>原购 {item.counts} 件</Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </Card>

          {selectedItems.length > 0 ? (
            <Card style={styles.card}>
              <Text style={styles.section}>确认退回数量</Text>
              {selectedItems.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.itemBody}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.itemMeta} numberOfLines={1}>
                      {item.sku} · 最多可退 {item.counts} 件
                    </Text>
                  </View>
                  <Stepper
                    value={countOf(item.id, item.counts)}
                    onChange={(next) =>
                      setEditedCounts((current) => ({ ...current, [item.id]: next }))
                    }
                    min={1}
                    max={item.counts}
                  />
                </View>
              ))}
            </Card>
          ) : null}

          <Card style={styles.card}>
            <TextField
              label="退款金额（元）"
              value={refundAmount}
              onChangeText={setAmountDraft}
              keyboardType="decimal-pad"
            />
            {balance > 0 ? (
              <>
                <Text style={styles.label}>退款方式</Text>
                <View style={styles.chipRow}>
                  <Chip
                    label="原路退款"
                    active={amountType === 'money'}
                    onPress={() => setAmountType('money')}
                  />
                  <Chip
                    label="退回会员余额"
                    active={amountType === 'balance'}
                    onPress={() => setAmountType('balance')}
                  />
                </View>
                <Text style={styles.hint}>本单使用余额 {formatYuan(balance)}</Text>
              </>
            ) : null}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = themedStyles(createStyles);

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    hint: { fontSize: fs(11), color: colors.muted },
    section: { fontSize: fs(12), color: colors.fg, fontWeight: '600' },
    card: { gap: space.md },
    label: { fontSize: fs(11), color: colors.muted },
    infoLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
    infoLabel: { fontSize: fs(11), color: colors.muted },
    infoValue: { flexShrink: 1, fontSize: fs(12), color: colors.fg, fontVariant: ['tabular-nums'] },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    itemBody: { flex: 1, minWidth: 0 },
    itemRight: { alignItems: 'flex-end', gap: 2 },
    itemName: { fontSize: fs(12), color: colors.fg },
    itemMeta: { fontSize: fs(10), color: colors.muted, marginTop: 2 },
    itemPrice: { fontSize: fs(11), color: colors.fg, fontVariant: ['tabular-nums'] },
    footer: {
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.card,
    },
  });
}
