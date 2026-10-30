import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScanLine } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, Empty, Loading, Screen, Stepper, TextField } from '@/src/components/ui';
import { ApiError } from '@/src/lib/api';
import { formatDateTime } from '@/src/lib/format';
import { formatYuan } from '@/src/lib/money';
import { changeOrder, queryInventoryDetail, queryOrderDetail, queryOrderItems } from '@/src/lib/pos';
import { useUiStore } from '@/src/stores/ui';
import { themedStyles } from '@/src/theme/styles';
import { colors, fs, space, useThemeRevision } from '@/src/theme/tokens';

interface ExchangeLine {
  sku: string;
  sn: string;
  name: string;
  color: string;
  size: string;
  originalPrice: number;
  counts: number;
}

/** 换货销售价规则与桌面端一致：吊牌价 6 折 */
const SALE_RATE = 0.6;

const PAY_LABELS: Record<string, string> = {
  weixin: '微信',
  wechat: '微信',
  alipay: '支付宝',
  cash: '现金',
  card: '银行卡',
  other: '其他',
};

export default function OrderExchangeScreen() {
  useThemeRevision();
  const { orderSn = '' } = useLocalSearchParams<{ orderSn?: string }>();
  const queryClient = useQueryClient();
  const showToast = useUiStore((state) => state.showToast);
  const openScanForCode = useUiStore((state) => state.openScanForCode);

  const [picked, setPicked] = useState<number[] | null>(null);
  const [editedCounts, setEditedCounts] = useState<Record<number, number>>({});
  const [exchangeLines, setExchangeLines] = useState<ExchangeLine[]>([]);
  const [sku, setSku] = useState('');
  const [looking, setLooking] = useState(false);
  const [amountDraft, setAmountDraft] = useState<string | null>(null);
  const [amountType, setAmountType] = useState<'none' | 'add' | 'sub'>('none');
  const [refundBalance, setRefundBalance] = useState(false);
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

  const selected = picked ?? refundable.map((item) => item.id);
  const selectedItems = refundable.filter((item) => selected.includes(item.id));

  const countOf = (id: number, fallback: number): number => editedCounts[id] ?? fallback;
  const returnTotal = selectedItems.reduce(
    (sum, item) => sum + Number(item.actualPrice ?? 0) * countOf(item.id, item.counts),
    0,
  );
  const exchangeTotal = exchangeLines.reduce(
    (sum, line) => sum + line.originalPrice * SALE_RATE * line.counts,
    0,
  );

  const defaultAmount =
    amountType === 'none' ? '0' : Math.abs(exchangeTotal - returnTotal).toFixed(2);
  const amount = amountDraft ?? defaultAmount;
  const balance = Number(detail?.useBalance ?? 0);

  function toggle(id: number): void {
    setPicked(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  function pickAmountType(next: 'none' | 'add' | 'sub'): void {
    setAmountType(next);
    setAmountDraft(null);
  }

  async function addBySku(codeArg?: string): Promise<void> {
    const code = (codeArg ?? sku).trim();
    if (!code || looking) return;
    setSku(code);
    setLooking(true);
    try {
      const product = await queryInventoryDetail(code);
      setExchangeLines((current) => {
        const found = current.find((line) => line.sku === product.sku);
        if (found) {
          return current.map((line) =>
            line.sku === product.sku ? { ...line, counts: line.counts + 1 } : line,
          );
        }
        return [
          ...current,
          {
            sku: product.sku,
            sn: product.sn,
            name: product.name,
            color: product.color ?? '',
            size: product.size ?? '',
            originalPrice: Number(product.originalPrice ?? 0),
            counts: 1,
          },
        ];
      });
      setSku('');
    } catch {
      showToast('未查询到该条码对应的商品', 'error');
    } finally {
      setLooking(false);
    }
  }

  async function submit(): Promise<void> {
    if (!detail || saving) return;
    if (selectedItems.length === 0) {
      showToast('请选择需要换出的商品', 'warning');
      return;
    }
    if (exchangeLines.length === 0) {
      showToast('请先添加换入商品', 'warning');
      return;
    }
    const exchangeAmount = Number(amount);
    if (!Number.isFinite(exchangeAmount) || exchangeAmount < 0) {
      showToast('请输入正确的差价金额', 'warning');
      return;
    }

    setSaving(true);
    try {
      await changeOrder({
        orderSn: detail.orderSn,
        returnItems: selectedItems.map((item) => ({
          id: item.id,
          sku: item.sku,
          counts: countOf(item.id, item.counts),
          originalPrice: Number(item.originalPrice ?? 0),
          actualPrice: Number(item.actualPrice ?? 0),
        })),
        exchangeItems: exchangeLines.map((line) => ({
          sku: line.sku,
          sn: line.sn,
          name: line.name,
          color: line.color,
          size: line.size,
          originalPrice: line.originalPrice,
          counts: line.counts,
        })),
        exchangeAmount,
        amountType,
        refundBalance,
      });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['order-detail'] });
      await queryClient.invalidateQueries({ queryKey: ['order-items'] });
      showToast('换货已完成');
      router.back();
    } catch (caught) {
      showToast(caught instanceof ApiError ? caught.message : '换货失败，请稍后重试', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title="换货"
      back
      scroll
      footer={
        <View style={styles.footer}>
          <Button
            title={
              amountType === 'add'
                ? `确认换货 · 补差价 ${formatYuan(amount)}`
                : amountType === 'sub'
                  ? `确认换货 · 退差价 ${formatYuan(amount)}`
                  : '确认换货'
            }
            onPress={() => void submit()}
            loading={saving}
            disabled={!detail}
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

          <Card style={styles.card}>
            <Text style={styles.section}>换出商品</Text>
            {refundable.length === 0 ? (
              <Text style={styles.hint}>该订单暂无可换商品</Text>
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
            <Text style={styles.section}>换入商品</Text>
            <View style={styles.addRow}>
              <View style={styles.addField}>
                <TextField
                  value={sku}
                  onChangeText={(text) => {
                    setSku(text);
                    // 13 位条码输入完整后自动查询
                    if (/^\d{13}$/.test(text.trim())) void addBySku(text);
                  }}
                  placeholder="扫描或输入商品条码"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={() => void addBySku()}
                />
              </View>
              <Pressable
                onPress={() =>
                  openScanForCode((code) => {
                    void addBySku(code);
                  })
                }
                disabled={looking}
                accessibilityLabel="扫码"
                style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
              >
                {looking ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <ScanLine size={18} color="#fff" strokeWidth={1.8} />
                )}
              </Pressable>
            </View>
            {exchangeLines.length === 0 ? (
              <Text style={styles.hint}>尚未添加换入商品</Text>
            ) : (
              exchangeLines.map((line) => (
                <View key={line.sku} style={styles.itemRow}>
                  <View style={styles.itemBody}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {line.name}
                    </Text>
                    <Text style={styles.itemMeta} numberOfLines={1}>
                      {line.sku} · {[line.color, line.size].filter(Boolean).join(' / ') || '—'}
                    </Text>
                    <Text style={styles.itemPrice}>
                      {formatYuan(line.originalPrice * SALE_RATE)}
                      <Text style={styles.itemMeta}> / 件</Text>
                    </Text>
                  </View>
                  <Stepper
                    value={line.counts}
                    onChange={(next) =>
                      setExchangeLines((current) =>
                        current.map((row) => (row.sku === line.sku ? { ...row, counts: next } : row)),
                      )
                    }
                    min={1}
                    max={99}
                  />
                  <Pressable
                    onPress={() =>
                      setExchangeLines((current) => current.filter((row) => row.sku !== line.sku))
                    }
                    hitSlop={8}
                    accessibilityLabel="移除换入商品"
                  >
                    <Ionicons name="close-circle-outline" size={18} color={colors.faint} />
                  </Pressable>
                </View>
              ))
            )}
          </Card>

          <Card style={styles.card}>
            <View style={styles.summaryRow}>
              <Text style={styles.hint}>换出合计 {formatYuan(returnTotal)}</Text>
              <Text style={styles.hint}>换入合计 {formatYuan(exchangeTotal)}</Text>
            </View>
            <Text style={styles.label}>差价方式</Text>
            <View style={styles.chipRow}>
              <Chip label="无价差" active={amountType === 'none'} onPress={() => pickAmountType('none')} />
              <Chip label="补差价" active={amountType === 'add'} onPress={() => pickAmountType('add')} />
              <Chip label="退差价" active={amountType === 'sub'} onPress={() => pickAmountType('sub')} />
            </View>
            {amountType !== 'none' ? (
              <TextField
                label={amountType === 'add' ? '补差金额（元）' : '退差金额（元）'}
                value={amount}
                onChangeText={setAmountDraft}
                keyboardType="decimal-pad"
              />
            ) : null}
            {amountType === 'sub' && balance > 0 ? (
              <Pressable style={styles.checkRow} onPress={() => setRefundBalance((value) => !value)}>
                <Ionicons
                  name={refundBalance ? 'checkbox' : 'square-outline'}
                  size={17}
                  color={refundBalance ? colors.brand : colors.faint}
                />
                <Text style={styles.hint}>差价退回会员余额（可用 {formatYuan(balance)}）</Text>
              </Pressable>
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
    itemName: { fontSize: fs(12), color: colors.fg },
    itemMeta: { fontSize: fs(10), color: colors.muted, marginTop: 2 },
    itemPrice: { fontSize: fs(11), color: colors.fg, marginTop: 2, fontVariant: ['tabular-nums'] },
    addRow: { flexDirection: 'row', alignItems: 'stretch', gap: space.sm },
    addField: { flex: 1, justifyContent: 'center' },
    scanButton: {
      width: 44,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: colors.brand,
    },
    scanButtonPressed: { opacity: 0.7 },
    itemRight: { alignItems: 'flex-end', gap: 2 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    footer: {
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.card,
    },
  });
}
