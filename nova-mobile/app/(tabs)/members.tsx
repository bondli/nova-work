import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
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
  Empty,
  Loading,
  MemberAvatar,
  MetricCard,
  MiniMetric,
  RecordRow,
  Screen,
  SearchField,
  SheetModal,
} from '@/src/components/ui';
import { apiGet } from '@/src/lib/api';
import { daysAgo, formatDate, formatDateTime, groupNumber, today } from '@/src/lib/format';
import { formatYuan } from '@/src/lib/money';
import {
  queryMemberBalances,
  queryMemberCoupons,
  queryMemberDetail,
  queryMemberScores,
  queryMembers,
  queryOrders,
} from '@/src/lib/pos';
import type { MemberRow, MemberSummary } from '@/src/lib/types';
import { colors, fs, useThemeRevision } from '@/src/theme/tokens';
import { themedStyles } from '@/src/theme/styles';

const PAGE_SIZE = 20;

function levelLabel(level: string | null | undefined): string {
  return level === 'super' ? '超级会员' : '普通会员';
}

export default function MembersScreen() {
  useThemeRevision();
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<MemberRow | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(keyword.trim()), 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const summaryQuery = useQuery({
    queryKey: ['member-summary'],
    queryFn: () => apiGet<MemberSummary>('/member/summary'),
  });
  const summary = summaryQuery.data;

  const listQuery = useInfiniteQuery({
    queryKey: ['members', search],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => queryMembers(search, pageParam, PAGE_SIZE),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + (page.data?.length ?? 0), 0);
      return loaded < (lastPage.count ?? 0) ? pages.length + 1 : undefined;
    },
  });

  const members = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((page) => page.data ?? []),
    [listQuery.data],
  );
  const total = listQuery.data?.pages[0]?.count ?? 0;

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>): void {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y < contentSize.height - 80) return;
    if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) void listQuery.fetchNextPage();
  }

  return (
    <Screen title="会员" scroll onScroll={handleScroll}>
      <SearchField
        value={keyword}
        onChangeText={setKeyword}
        placeholder="请输入完整手机号"
        keyboardType="phone-pad"
      />

      <View style={styles.metrics}>
        <MetricCard label="会员总数" value={groupNumber(summary?.total ?? 0)} />
        <MetricCard label="超级会员" value={groupNumber(summary?.superCount ?? 0)} />
        <MetricCard label="会员余额" value={formatYuan(summary?.balanceTotal ?? 0)} />
      </View>

      {listQuery.isLoading ? (
        <Loading />
      ) : listQuery.isError ? (
        <Empty text="会员加载失败，请检查网络后重试" />
      ) : members.length === 0 ? (
        <Empty text={search ? '没有匹配的会员' : '暂无会员'} />
      ) : (
        <View style={styles.list}>
          {members.map((member) => (
            <MemberCard key={member.phone} member={member} onPress={() => setDetail(member)} />
          ))}
          <View style={styles.footer}>
            {listQuery.isFetchingNextPage ? (
              <ActivityIndicator color={colors.brand} size="small" />
            ) : listQuery.hasNextPage ? (
              <Text style={styles.footerText}>上拉加载更多 · 共 {total} 人</Text>
            ) : (
              <Text style={styles.footerText}>共 {total} 人</Text>
            )}
          </View>
        </View>
      )}

      <MemberDetailSheet member={detail} onClose={() => setDetail(null)} />
    </Screen>
  );
}

function MemberCard({ member, onPress }: { member: MemberRow; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <MemberAvatar kind={member.level ?? 'normal'} size={38} />
      <View style={styles.cardBody}>
        <Text style={styles.name} numberOfLines={1}>
          {member.phone}
          {member.name && member.name !== member.phone ? (
            <Text style={styles.nameAfterPhone}>{`  ${member.name}`}</Text>
          ) : null}
        </Text>
        <Text style={styles.actualAmount} numberOfLines={1}>
          {`到店实付金额: ${formatYuan(member.actual ?? 0)}`}
        </Text>
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.balance}>{formatYuan(member.balance ?? 0)}</Text>
        <Text style={styles.points}>积分 {groupNumber(member.point ?? 0)}</Text>
      </View>
    </Pressable>
  );
}

function MemberDetailSheet({ member, onClose }: { member: MemberRow | null; onClose: () => void }) {
  const visible = Boolean(member);
  const phone = member?.phone ?? '';

  const detailQuery = useQuery({
    queryKey: ['member-detail', phone],
    queryFn: () => queryMemberDetail(phone),
    enabled: visible,
  });
  const scoresQuery = useQuery({
    queryKey: ['member-scores', phone],
    queryFn: () => queryMemberScores(phone),
    enabled: visible,
  });
  const balancesQuery = useQuery({
    queryKey: ['member-balances', phone],
    queryFn: () => queryMemberBalances(phone),
    enabled: visible,
  });
  const couponsQuery = useQuery({
    queryKey: ['member-coupons', phone],
    queryFn: () => queryMemberCoupons(phone),
    enabled: visible,
  });
  const ordersQuery = useQuery({
    queryKey: ['member-orders', phone],
    queryFn: () =>
      queryOrders({ userPhone: phone, start: daysAgo(365), end: today(), current: 1, pageSize: 5 }),
    enabled: visible,
  });

  const current = detailQuery.data ?? member;
  const scores = scoresQuery.data ?? [];
  const balances = balancesQuery.data ?? [];
  const coupons = couponsQuery.data ?? [];
  const orders = ordersQuery.data?.data ?? [];
  const balance = Number(current?.balance ?? 0);

  return (
    <SheetModal visible={visible} title="会员详情" onClose={onClose}>
      {current ? (
        <>
          <View style={styles.detailHead}>
            <MemberAvatar kind={current.level ?? 'normal'} size={44} />
            <View style={styles.detailHeadBody}>
              <View style={styles.detailNameRow}>
                <Text style={styles.detailName} numberOfLines={1}>
                  {current.name && current.name !== current.phone ? current.name : current.phone}
                </Text>
                <Badge
                  text={levelLabel(current.level)}
                  tone={current.level === 'super' ? 'warning' : 'brand'}
                />
              </View>
              {current.name && current.name !== current.phone ? (
                <Text style={styles.detailPhone}>{current.phone}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.metricGrid}>
            <View style={styles.metricRow}>
              <MiniMetric label="积分" value={groupNumber(current.point ?? 0)} />
              <MiniMetric label="余额" value={formatYuan(balance)} />
            </View>
            <View style={styles.metricRow}>
              <MiniMetric label="累计消费" value={formatYuan(current.actual ?? 0)} />
              <MiniMetric label="订单数" value={groupNumber(ordersQuery.data?.count ?? 0)} />
            </View>
          </View>

          <Text style={styles.sectionTitle}>订单</Text>
          {ordersQuery.isLoading ? (
            <Text style={styles.mutedText}>加载中…</Text>
          ) : orders.length === 0 ? (
            <Text style={styles.mutedText}>暂无订单</Text>
          ) : (
            <View>
              {orders.map((order, index) => (
                <RecordRow
                  key={order.orderSn}
                  last={index === orders.length - 1}
                  right={
                    <Text style={styles.recordAmount}>
                      <Text style={styles.recordAmountLabel}>实付 </Text>
                      {formatYuan(order.orderActualAmount)}
                    </Text>
                  }
                >
                  <Text style={styles.recordTitle} numberOfLines={1}>
                    {order.orderSn}
                  </Text>
                  <Text style={styles.recordMeta}>
                    {formatDateTime(order.createdAt)} · 应付 {formatYuan(order.orderAmount)}
                  </Text>
                </RecordRow>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>积分记录</Text>
          {scores.length === 0 ? (
            <Text style={styles.mutedText}>暂无积分记录</Text>
          ) : (
            <View>
              {scores.slice(0, 8).map((record, index) => (
                <RecordRow
                  key={record.id}
                  last={index === Math.min(scores.length, 8) - 1}
                  right={
                    <Text style={[styles.recordAmount, record.point >= 0 ? styles.up : styles.down]}>
                      {record.point >= 0 ? '+' : ''}
                      {record.point}
                    </Text>
                  }
                >
                  <Text style={styles.recordTitle} numberOfLines={1}>
                    {record.reason || record.type}
                  </Text>
                  <Text style={styles.recordMeta}>{formatDate(record.createdAt)}</Text>
                </RecordRow>
              ))}
            </View>
          )}

          {balance > 0 ? (
            <>
              <Text style={styles.sectionTitle}>余额记录</Text>
              {balances.length === 0 ? (
                <Text style={styles.mutedText}>暂无余额记录</Text>
              ) : (
                <View>
                  {balances.slice(0, 8).map((record, index) => (
                    <RecordRow
                      key={record.id}
                      last={index === Math.min(balances.length, 8) - 1}
                      right={
                        <Text style={[styles.recordAmount, record.value >= 0 ? styles.up : styles.down]}>
                          {record.value >= 0 ? '+' : ''}
                          {formatYuan(record.value)}
                        </Text>
                      }
                    >
                      <Text style={styles.recordTitle} numberOfLines={1}>
                        {record.reason || record.type}
                      </Text>
                      <Text style={styles.recordMeta}>{formatDate(record.createdAt)}</Text>
                    </RecordRow>
                  ))}
                </View>
              )}
            </>
          ) : null}

          <Text style={styles.sectionTitle}>优惠券</Text>
          {coupons.length === 0 ? (
            <Text style={styles.mutedText}>暂无优惠券</Text>
          ) : (
            <View>
              {coupons.map((coupon, index) => (
                <RecordRow
                  key={String(coupon.id)}
                  last={index === coupons.length - 1}
                  right={
                    <View style={styles.couponRight}>
                      <Text style={styles.couponValue}>¥{coupon.couponValue}</Text>
                      <Badge
                        text={coupon.couponStatus === 'active' ? '有效' : '已使用'}
                        tone={coupon.couponStatus === 'active' ? 'success' : 'neutral'}
                      />
                    </View>
                  }
                >
                  <Text style={styles.recordTitle} numberOfLines={1}>
                    {coupon.couponDesc || `¥${coupon.couponValue} 优惠券`}
                  </Text>
                  <Text style={styles.recordMeta}>
                    {coupon.couponCondition ? `满 ${coupon.couponCondition} 可用` : '无门槛'}
                    {coupon.couponExpiredTime ? ` · ${formatDate(coupon.couponExpiredTime)} 到期` : ''}
                  </Text>
                </RecordRow>
              ))}
            </View>
          )}

          <Text style={styles.note}>手机端仅支持查询，修改会员请前往桌面端</Text>
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 12,
    },
    pressed: { opacity: 0.8 },
    cardBody: { flex: 1, minWidth: 0 },
    name: { fontSize: fs(13), fontWeight: '500', color: colors.fg, fontVariant: ['tabular-nums'] },
    nameAfterPhone: { fontSize: fs(11), fontWeight: '400', color: colors.muted },
    actualAmount: {
      fontSize: fs(10),
      color: colors.muted,
      marginTop: 2,
      fontVariant: ['tabular-nums'],
    },
    cardRight: { alignItems: 'flex-end' },
    balance: { fontSize: fs(13), fontWeight: '600', color: colors.fg, fontVariant: ['tabular-nums'] },
    points: { fontSize: fs(10), color: colors.muted, marginTop: 2, fontVariant: ['tabular-nums'] },

    footer: { paddingVertical: 8, alignItems: 'center' },
    footerText: { fontSize: fs(10), color: colors.faint },

    detailHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    detailHeadBody: { flex: 1, minWidth: 0, gap: 3 },
    detailNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    detailName: { fontSize: fs(15), fontWeight: '600', color: colors.fg, flexShrink: 1 },
    detailPhone: { fontSize: fs(11), color: colors.muted, fontVariant: ['tabular-nums'] },

    metricGrid: { gap: 8, marginTop: 12 },
    metricRow: { flexDirection: 'row', gap: 8 },

    sectionTitle: { fontSize: fs(11), fontWeight: '500', color: colors.muted, marginTop: 14, marginBottom: 2 },
    mutedText: { fontSize: fs(11), color: colors.muted, paddingVertical: 6 },

    recordTitle: { fontSize: fs(12), color: colors.fg },
    recordMeta: { fontSize: fs(10), color: colors.muted, fontVariant: ['tabular-nums'] },
    recordAmount: { fontSize: fs(12), fontWeight: '500', color: colors.fg, fontVariant: ['tabular-nums'] },
    recordAmountLabel: { fontWeight: '400', color: colors.muted, fontSize: fs(10) },
    up: { color: colors.success },
    down: { color: colors.danger },

    couponRight: { alignItems: 'flex-end', gap: 2 },
    couponValue: { fontSize: fs(13), fontWeight: '600', color: colors.fg, fontVariant: ['tabular-nums'] },
    note: { marginTop: 14, textAlign: 'center', fontSize: fs(10), color: colors.faint },
  });
}
