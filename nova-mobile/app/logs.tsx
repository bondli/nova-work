import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  Empty,
  Loading,
  Screen,
  SelectField,
  TabGroup,
  type Tone,
} from '@/src/components/ui';
import { daysAgo, formatDateTime, today } from '@/src/lib/format';
import { queryOpLogs } from '@/src/lib/pos';
import { colors, fs, useThemeRevision } from '@/src/theme/tokens';
import { themedStyles } from '@/src/theme/styles';

type RangeKey = 'today' | 'week' | 'month';

const RANGES = [
  { id: 'today', label: '今天' },
  { id: 'week', label: '近7天' },
  { id: 'month', label: '近30天' },
];

/** 服务端日志类型 → 中文名与语义色，与桌面端保持一致 */
const TYPE_META: Record<string, { label: string; tone: Tone }> = {
  return: { label: '订单退货', tone: 'danger' },
  exchange: { label: '订单换货', tone: 'warning' },
  modifyOrder: { label: '修改订单', tone: 'neutral' },
  inCome: { label: '会员充值', tone: 'brand' },
  modifyInventory: { label: '修改库存', tone: 'warning' },
  purchaseInventory: { label: '批量入库', tone: 'success' },
  returnInventory: { label: '批量退库', tone: 'danger' },
};

/** 筛选选项与桌面端老系统一致 */
const TYPE_OPTIONS = [
  { id: 'all', label: '全部' },
  { id: 'return', label: '退货' },
  { id: 'exchange', label: '换货' },
  { id: 'modifyOrder', label: '修改订单' },
  { id: 'inCome', label: '充值' },
  { id: 'modifyInventory', label: '修改库存' },
  { id: 'purchaseInventory', label: '批量入库' },
  { id: 'returnInventory', label: '批量退库' },
];

function typeMeta(type: string): { label: string; tone: Tone } {
  return TYPE_META[type] ?? { label: type, tone: 'neutral' };
}

export default function LogsScreen() {
  useThemeRevision();
  const [range, setRange] = useState<RangeKey>('week');
  const [type, setType] = useState('all');

  const dates = useMemo(() => {
    if (range === 'today') {
      const day = today();
      return { start: day, end: day };
    }
    return { start: daysAgo(range === 'week' ? 6 : 29), end: today() };
  }, [range]);

  const filterType = type === 'all' ? undefined : type;

  const query = useInfiniteQuery({
    queryKey: ['op-logs', dates.start, dates.end, filterType ?? ''],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      queryOpLogs({
        start: dates.start,
        end: dates.end,
        current: pageParam,
        pageSize: 30,
        type: filterType,
      }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + (page.data?.length ?? 0), 0);
      return loaded < (lastPage.count ?? 0) ? pages.length + 1 : undefined;
    },
  });

  const logs = useMemo(
    () => (query.data?.pages ?? []).flatMap((page) => page.data ?? []),
    [query.data],
  );

  return (
    <Screen title="操作日志" back scroll>
      <SelectField
        title="操作类型"
        value={type}
        options={TYPE_OPTIONS}
        onChange={setType}
        placement="top"
      />
      <TabGroup items={RANGES} active={range} onChange={(id) => setRange(id as RangeKey)} />

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <Empty text="日志加载失败，请检查网络后重试" />
      ) : logs.length === 0 ? (
        <Empty text="暂无操作日志" />
      ) : (
        <View style={styles.list}>
          {logs.map((log) => {
            const meta = typeMeta(log.type);
            return (
              <View key={log.id} style={styles.row}>
                <View style={styles.rowTop}>
                  <Badge text={meta.label} tone={meta.tone} />
                  <Text style={styles.time}>{formatDateTime(log.createdAt)}</Text>
                </View>
                <Text style={styles.info} numberOfLines={3}>
                  {log.info || meta.label}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  操作人 {log.userName || '—'}
                  {log.userOS ? ` · ${log.userOS}` : ''}
                </Text>
              </View>
            );
          })}
          {query.isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.brand} size="small" />
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    list: { gap: 8 },
    row: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 12,
      gap: 6,
    },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    time: { fontSize: fs(10), color: colors.muted, fontVariant: ['tabular-nums'] },
    info: { fontSize: fs(12), color: colors.fg, lineHeight: fs(18) },
    meta: { fontSize: fs(10), color: colors.faint },
    footer: { paddingVertical: 8, alignItems: 'center' },
  });
}
