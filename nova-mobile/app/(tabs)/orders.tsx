import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import {
  Badge,
  Button,
  Empty,
  InfoBlock,
  Loading,
  MemberAvatar,
  MetricCard,
  PaymentIcon,
  Screen,
  SearchField,
  SheetModal,
  TabGroup,
  type Tone,
} from '@/src/components/ui';
import { formatDateTime, formatTime, groupNumber } from '@/src/lib/format';
import { formatYuan } from '@/src/lib/money';
import { fetchCoreStats, queryMemberDetail, queryOrderItems, queryOrders } from '@/src/lib/pos';
import type { OrderRow } from '@/src/lib/types';
import { useUiStore } from '@/src/stores/ui';
import { colors, fs, useThemeRevision } from '@/src/theme/tokens';
import { themedStyles } from '@/src/theme/styles';

type RangeKey = 'today' | 'yesterday' | 'week' | 'month';

const RANGES: { id: RangeKey; label: string }[] = [
  { id: 'today', label: '今天' },
  { id: 'yesterday', label: '昨天' },
  { id: 'week', label: '近一周' },
  { id: 'month', label: '近一月' },
];

const PAGE_SIZE = 20;

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function daysAgoString(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateString(date);
}

function rangeDates(key: RangeKey): { start: string; end: string } {
  if (key === 'yesterday') {
    const day = daysAgoString(1);
    return { start: day, end: day };
  }
  const days = key === 'week' ? 6 : key === 'month' ? 29 : 0;
  return { start: daysAgoString(days), end: toDateString(new Date()) };
}

/** 与当前区间等长、紧邻在上一个的时间窗，用于环比 */
function previousDates(start: string, end: string): { start: string; end: string } {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
  const previousEnd = new Date(startDate);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - (days - 1));
  return { start: toDateString(previousStart), end: toDateString(previousEnd) };
}

function delta(current: number, previous: number): number | undefined {
  if (!previous) return undefined;
  return ((current - previous) / previous) * 100;
}

function orderTags(order: OrderRow): { text: string; tone: Tone }[] {
  const tags: { text: string; tone: Tone }[] = [];
  tags.push(
    order.orderStatus === 'uncheck'
      ? { text: '未对账', tone: 'warning' }
      : { text: '已完成', tone: 'success' },
  );
  if (order.orderStatus === 'refund') tags.push({ text: '有退换', tone: 'danger' });
  return tags;
}

export default function OrdersScreen() {
  useThemeRevision();
  const showToast = useUiStore((state) => state.showToast);
  const [range, setRange] = useState<RangeKey>('today');
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<OrderRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const dates = useMemo(() => rangeDates(range), [range]);

  const statsQuery = useQuery({
    queryKey: ['order-stats', dates.start, dates.end],
    queryFn: async () => {
      const previous = previousDates(dates.start, dates.end);
      const [current, previousStats] = await Promise.all([
        fetchCoreStats(dates.start, dates.end),
        fetchCoreStats(previous.start, previous.end),
      ]);
      return { current, previous: previousStats };
    },
  });

  const listQuery = useInfiniteQuery({
    queryKey: ['orders', dates.start, dates.end, search],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      queryOrders({
        start: dates.start,
        end: dates.end,
        current: pageParam,
        pageSize: PAGE_SIZE,
        ...(search
          ? /^1[3-9]\d{9}$/.test(search)
            ? { userPhone: search }
            : { orderSn: search }
          : {}),
      }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + (page.data?.length ?? 0), 0);
      return loaded < (lastPage.count ?? 0) ? pages.length + 1 : undefined;
    },
  });

  const orders = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((page) => page.data ?? []),
    [listQuery.data],
  );
  const total = listQuery.data?.pages[0]?.count ?? 0;

  const stats = statsQuery.data?.current;
  const previous = statsQuery.data?.previous;

  function submitSearch(): void {
    setSearch(keyword.trim());
  }

  /** 下拉刷新：列表与统计一起重新拉取，买单后回到本页也能看到最新订单 */
  async function refresh(): Promise<void> {
    setRefreshing(true);
    try {
      await Promise.all([listQuery.refetch(), statsQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>): void {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y < contentSize.height - 80) return;
    if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) void listQuery.fetchNextPage();
  }

  return (
    <Screen
      title="订单"
      scroll
      onScroll={handleScroll}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
    >
      <SearchField
        value={keyword}
        onChangeText={setKeyword}
        placeholder="手机号 / 订单号"
        onSubmitEditing={submitSearch}
      />

      <TabGroup
        items={RANGES}
        active={range}
        onChange={(id) => {
          setRange(id as RangeKey);
          setSearch('');
          setKeyword('');
        }}
      />

      <View style={styles.metrics}>
        <MetricCard
          label="营业额"
          value={stats ? formatYuan(stats.orderAmount) : '—'}
          delta={delta(stats?.orderAmount ?? 0, previous?.orderAmount ?? 0)}
        />
        <MetricCard
          label="订单笔数"
          value={stats ? groupNumber(stats.orderCount) : '—'}
          delta={delta(stats?.orderCount ?? 0, previous?.orderCount ?? 0)}
        />
        <MetricCard
          label="售出商品"
          value={stats ? groupNumber(stats.saledItemCount) : '—'}
          delta={delta(stats?.saledItemCount ?? 0, previous?.saledItemCount ?? 0)}
        />
      </View>

      {listQuery.isLoading ? (
        <Loading />
      ) : listQuery.isError ? (
        <Empty text="订单加载失败，请检查网络后重试" />
      ) : orders.length === 0 ? (
        <Empty text={search ? '没有匹配的订单' : '当前时间范围内没有订单'} />
      ) : (
        <View style={styles.list}>
          {orders.map((order) => (
            <OrderCard key={order.orderSn} order={order} onPress={() => setDetail(order)} />
          ))}
          <View style={styles.footer}>
            {listQuery.isFetchingNextPage ? (
              <ActivityIndicator color={colors.brand} size="small" />
            ) : listQuery.hasNextPage ? (
              <Text style={styles.footerText}>上拉加载更多 · 共 {total} 单</Text>
            ) : (
              <Text style={styles.footerText}>共 {total} 单</Text>
            )}
          </View>
        </View>
      )}

      <OrderDetailSheet
        order={detail}
        onClose={() => setDetail(null)}
        onAction={(text) => {
          showToast(text);
        }}
      />
    </Screen>
  );
}

function OrderCard({ order, onPress }: { order: OrderRow; onPress: () => void }) {
  const tags = orderTags(order);
  const tagsAll = [...tags];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.cardHead}>
        <Text style={styles.orderNo} numberOfLines={1}>
          {order.orderSn}
        </Text>
        <View style={styles.tagRow}>
          {tagsAll.map((tag) => (
            <Badge key={tag.text} text={tag.text} tone={tag.tone} />
          ))}
        </View>
      </View>
      <View style={styles.cardMeta}>
        <PaymentIcon payment={order.payType} size={20} />
        <Text style={styles.metaText}>{formatTime(order.createdAt)}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.metaText}>{order.orderItems} 件</Text>
      </View>
      <View style={styles.cardFoot}>
        <Text style={styles.payable} numberOfLines={1}>
          <Text style={styles.payableStrong}>应付 {formatYuan(order.orderAmount)}</Text>
          {order.userPhone ? (
            <Text style={styles.phone}> · {order.userPhone}</Text>
          ) : null}
        </Text>
        <Text style={styles.received}>
          <Text style={styles.receivedLabel}>实收 </Text>
          <Text style={styles.receivedValue}>{formatYuan(order.orderActualAmount)}</Text>
        </Text>
      </View>
    </Pressable>
  );
}

function OrderDetailSheet({
  order,
  onClose,
  onAction,
}: {
  order: OrderRow | null;
  onClose: () => void;
  onAction: (text: string) => void;
}) {
  const visible = Boolean(order);
  const [copiedSku, setCopiedSku] = useState<string | null>(null);

  const itemsQuery = useQuery({
    queryKey: ['order-items', order?.orderSn ?? ''],
    queryFn: () => queryOrderItems(order?.orderSn ?? ''),
    enabled: visible,
  });

  const memberQuery = useQuery({
    queryKey: ['order-member', order?.userPhone ?? ''],
    queryFn: () => queryMemberDetail(order?.userPhone ?? ''),
    enabled: visible && Boolean(order?.userPhone),
    staleTime: 60_000,
  });

  const items = itemsQuery.data ?? [];
  const tags = order ? orderTags(order) : [];
  const memberLevel = memberQuery.data?.level ?? null;

  return (
    <SheetModal visible={visible} title="订单详情" onClose={onClose}>
      {order ? (
        <>
          <View style={styles.detailHead}>
            <Text style={styles.detailNo} numberOfLines={1}>
              {order.orderSn}
            </Text>
            <View style={styles.tagRow}>
              {tags.map((tag) => (
                <Badge key={tag.text} text={tag.text} tone={tag.tone} />
              ))}
            </View>
          </View>
          <Text style={styles.detailTime}>
            {formatDateTime(order.createdAt)} · 导购 {order.salerName || '—'}
          </Text>

          <View style={styles.infoGroup}>
            <InfoBlock label="会员信息">
              {order.userPhone ? (
                <>
                  <MemberAvatar kind={memberLevel ?? 'platform'} size={28} />
                  <Text style={styles.infoValue} numberOfLines={1}>
                    {order.userPhone}
                  </Text>
                  <Badge
                    text={memberLevel === 'super' ? '超级会员' : '普通会员'}
                    tone={memberLevel === 'super' ? 'warning' : 'brand'}
                    style={styles.memberBadge}
                  />
                </>
              ) : (
                <Text style={styles.infoMuted}>无会员</Text>
              )}
            </InfoBlock>
            <InfoBlock label="订单备注">
              <Text style={styles.infoValue} numberOfLines={3}>
                {order.remark || '无备注'}
              </Text>
            </InfoBlock>
          </View>

          <Text style={styles.sectionTitle}>商品明细</Text>
          {itemsQuery.isLoading ? (
            <Text style={styles.infoMuted}>加载中…</Text>
          ) : items.length === 0 ? (
            <Text style={styles.infoMuted}>暂无商品记录</Text>
          ) : (
            <View style={styles.itemList}>
              {items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.itemBody}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.itemMeta} numberOfLines={1}>
                      {[item.color, item.size].filter(Boolean).join(' / ') || '—'} × {item.counts}
                    </Text>
                  </View>
                  <View style={styles.itemRight}>
                    <Pressable
                      onPress={() => {
                        void Clipboard.setStringAsync(item.sku);
                        setCopiedSku(item.sku);
                        setTimeout(() => setCopiedSku(null), 1500);
                      }}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`复制条码 ${item.sku}`}
                      style={styles.itemBarcode}
                    >
                      <Text style={styles.itemBarcodeText} numberOfLines={1}>
                        {item.sku}
                      </Text>
                      {copiedSku === item.sku ? (
                        <Text style={styles.itemCopied}>已复制</Text>
                      ) : (
                        <Ionicons name="copy-outline" size={12} color={colors.muted} />
                      )}
                    </Pressable>
                    <Text style={styles.itemAmount}>{formatYuan(item.actualPrice)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>应付金额：{formatYuan(order.orderAmount)}</Text>
            <Text style={styles.totalPaid}>
              <Text style={styles.totalPaidLabel}>实收 </Text>
              <Text style={styles.totalPaidValue}>{formatYuan(order.orderActualAmount)}</Text>
            </Text>
          </View>

          <View style={styles.actions}>
            <View style={styles.actionItem}>
              <Button
                title="修改订单"
                variant="secondary"
                compact
                onPress={() => {
                  onClose();
                  router.push({ pathname: '/order/edit', params: { orderSn: order.orderSn } });
                }}
              />
            </View>
            <View style={styles.actionItem}>
              <Button
                title="退货"
                variant="secondary"
                compact
                onPress={() => {
                  onClose();
                  router.push({ pathname: '/order/refund', params: { orderSn: order.orderSn } });
                }}
              />
            </View>
            <View style={styles.actionItem}>
              <Button
                title="换货"
                compact
                onPress={() => {
                  onClose();
                  router.push({ pathname: '/order/exchange', params: { orderSn: order.orderSn } });
                }}
              />
            </View>
          </View>
        </>
      ) : null}
    </SheetModal>
  );
}

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    metrics: { flexDirection: 'row', gap: 8 },
    list: { gap: 8 },

    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 12,
    },
    pressed: { opacity: 0.8 },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    orderNo: {
      fontSize: fs(12),
      fontWeight: '600',
      color: colors.fg,
      fontVariant: ['tabular-nums'],
      flex: 1,
    },
    tagRow: { flexDirection: 'row', gap: 4, flexShrink: 0, alignItems: 'center' },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    metaText: { fontSize: fs(11), color: colors.muted, fontVariant: ['tabular-nums'] },
    dot: { fontSize: fs(11), color: colors.faint },
    cardFoot: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
    payable: { flex: 1, minWidth: 0, fontSize: fs(11) },
    payableStrong: { color: colors.fg, fontVariant: ['tabular-nums'] },
    phone: { color: colors.muted, fontVariant: ['tabular-nums'] },
    received: { flexShrink: 0, textAlign: 'right' },
    receivedLabel: { fontSize: fs(10), color: colors.faint },
    receivedValue: { fontSize: fs(15), fontWeight: '600', color: colors.fg, fontVariant: ['tabular-nums'] },

    footer: { paddingVertical: 8, alignItems: 'center' },
    footerText: { fontSize: fs(10), color: colors.faint },

    detailHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailNo: { flex: 1, fontSize: fs(12), fontWeight: '600', color: colors.fg, fontVariant: ['tabular-nums'] },
    detailTime: { fontSize: fs(10), color: colors.muted, marginTop: 4, fontVariant: ['tabular-nums'] },
    infoGroup: { gap: 8, marginTop: 10 },
    infoValue: { fontSize: fs(12), color: colors.fg, flexShrink: 1, fontVariant: ['tabular-nums'] },
    infoMuted: { fontSize: fs(12), color: colors.muted },
    memberBadge: { alignSelf: 'center' },

    sectionTitle: { fontSize: fs(11), fontWeight: '500', color: colors.muted, marginTop: 12, marginBottom: 6 },
    itemList: { gap: 6 },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.subtle,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    itemName: { fontSize: fs(12), color: colors.fg },
    itemBody: { flex: 1, minWidth: 0, gap: 2 },
    itemRight: { alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: '55%' },
    itemBarcode: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 6,
      marginRight: -6,
      borderRadius: 6,
    },
    itemBarcodeText: { fontSize: fs(10), color: colors.muted, fontVariant: ['tabular-nums'] },
    itemCopied: { fontSize: fs(10), color: colors.brand },
    itemMeta: { fontSize: fs(10), color: colors.muted },
    itemAmount: { fontSize: fs(12), color: colors.fg, fontVariant: ['tabular-nums'] },

    totalRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.divider,
      marginTop: 12,
      paddingTop: 12,
      gap: 8,
    },
    totalLabel: { fontSize: fs(13), color: colors.muted, fontVariant: ['tabular-nums'] },
    totalPaid: { textAlign: 'right' },
    totalPaidLabel: { fontSize: fs(12), color: colors.muted },
    totalPaidValue: { fontSize: fs(20), fontWeight: '600', color: colors.fg, fontVariant: ['tabular-nums'] },
    actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    actionItem: { flex: 1 },
  });
}
