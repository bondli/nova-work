import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Empty, Loading, MetricCard, Screen, TabGroup } from '@/src/components/ui';
import { groupNumber } from '@/src/lib/format';
import { formatYuan } from '@/src/lib/money';
import { fetchCoreStats, fetchMonthCharts, fetchSalerMonthCharts } from '@/src/lib/pos';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fs, useThemeRevision } from '@/src/theme/tokens';
import { themedStyles } from '@/src/theme/styles';

type RangeKey = '30d' | '7d' | 'yesterday' | 'today';

const RANGES: { id: RangeKey; label: string }[] = [
  { id: '30d', label: '近30天' },
  { id: '7d', label: '近7天' },
  { id: 'yesterday', label: '昨天' },
  { id: 'today', label: '今天' },
];

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateString(date);
}

function rangeDates(key: RangeKey): { start: string; end: string } {
  if (key === 'yesterday') {
    const day = daysAgo(1);
    return { start: day, end: day };
  }
  if (key === 'today') return { start: daysAgo(0), end: daysAgo(0) };
  return { start: daysAgo(key === '7d' ? 6 : 29), end: daysAgo(0) };
}

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

interface BarDatum {
  month: string;
  amounts: number;
}

// 手机端不展示成本与利润率（任何角色都不展示），只画销售额
function BarChart({ data }: { data: BarDatum[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = useMemo(() => Math.max(1, ...data.map((item) => item.amounts)), [data]);
  const active = selected !== null ? data[selected] : null;

  function tooltip(item: BarDatum): string {
    return `${item.month.replace('-', '/')} 销售额 ${formatYuan(item.amounts)}`;
  }

  return (
    <>
      <View style={styles.chart}>
        {data.map((item, index) => {
          const primaryHeight = Math.max(3, Math.round((item.amounts / max) * 108));
          const on = selected === index;
          return (
            <Pressable
              key={`${item.month}-${item.amounts}`}
              onPress={() => setSelected((prev) => (prev === index ? null : index))}
              accessibilityRole="button"
              accessibilityLabel={tooltip(item)}
              style={styles.chartCol}
            >
              <View style={styles.bars}>
                <View style={[styles.barPrimary, on && styles.barPrimaryOn, { height: primaryHeight }]} />
              </View>
              <Text style={[styles.chartLabel, on && styles.chartLabelOn]} numberOfLines={1}>
                {item.month.slice(5)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.chartTooltip, active ? styles.chartTooltipOn : undefined]} numberOfLines={2}>
        {active ? tooltip(active) : '点击柱状图查看当月数据'}
      </Text>
    </>
  );
}

export default function DataScreen() {
  useThemeRevision();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';
  const [range, setRange] = useState<RangeKey>('30d');
  const dates = useMemo(() => rangeDates(range), [range]);

  const statsQuery = useQuery({
    queryKey: ['data-stats', dates.start, dates.end],
    queryFn: async () => {
      const previous = previousDates(dates.start, dates.end);
      const [current, previousStats] = await Promise.all([
        fetchCoreStats(dates.start, dates.end),
        fetchCoreStats(previous.start, previous.end),
      ]);
      return { current, previous: previousStats };
    },
  });

  const monthQuery = useQuery({
    queryKey: ['month-charts'],
    queryFn: fetchMonthCharts,
  });
  const salerQuery = useQuery({
    queryKey: ['saler-charts'],
    queryFn: fetchSalerMonthCharts,
    enabled: !isAdmin,
  });

  const stats = statsQuery.data?.current;
  const previous = statsQuery.data?.previous;
  const months = monthQuery.data ?? [];
  const salerMonths = salerQuery.data ?? [];

  return (
    <Screen title="数据" scroll>
      <TabGroup
        items={RANGES}
        active={range}
        onChange={(id) => setRange(id as RangeKey)}
      />

      <View style={styles.metrics}>
        <View style={styles.metricRow}>
          <MetricCard
            label="营业额"
            value={stats ? formatYuan(stats.orderAmount) : '—'}
            delta={delta(stats?.orderAmount ?? 0, previous?.orderAmount ?? 0)}
          />
          <MetricCard
            label="订单数"
            value={stats ? groupNumber(stats.orderCount) : '—'}
            delta={delta(stats?.orderCount ?? 0, previous?.orderCount ?? 0)}
          />
        </View>
        <View style={styles.metricRow}>
          <MetricCard
            label="售出商品"
            value={stats ? groupNumber(stats.saledItemCount) : '—'}
            delta={delta(stats?.saledItemCount ?? 0, previous?.saledItemCount ?? 0)}
          />
          <MetricCard
            label="余额消耗"
            value={stats ? formatYuan(stats.totalBalance) : '—'}
            delta={delta(stats?.totalBalance ?? 0, previous?.totalBalance ?? 0)}
          />
        </View>
      </View>

      {!isAdmin ? (
        <Card>
          <View style={styles.chartHead}>
            <Text style={styles.chartTitle}>我的营业额</Text>
          </View>
          {salerQuery.isLoading ? (
            <Loading text="加载中…" />
          ) : salerMonths.length === 0 ? (
            <Empty text="暂无营业额数据" />
          ) : (
            <BarChart data={salerMonths} />
          )}
        </Card>
      ) : null}

      <Card>
        <View style={styles.chartHead}>
          <Text style={styles.chartTitle}>店铺营业额</Text>
        </View>
        {monthQuery.isLoading ? (
          <Loading text="加载中…" />
        ) : months.length === 0 ? (
          <Empty text="暂无营业额数据" />
        ) : (
          <BarChart data={months} />
        )}
      </Card>
    </Screen>
  );
}

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    metrics: { gap: 8 },
    metricRow: { flexDirection: 'row', gap: 8 },

    chartHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    chartTitle: { fontSize: fs(12), fontWeight: '600', color: colors.fg },

    chart: { flexDirection: 'row', alignItems: 'flex-end', height: 134, gap: 2, marginTop: 6 },
    chartCol: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6 },
    bars: { height: 110, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
    barPrimary: { width: 7, borderRadius: 2, backgroundColor: 'rgba(79,70,229,0.8)' },
    barPrimaryOn: { backgroundColor: colors.brand },
    chartLabel: { fontSize: fs(8), color: colors.faint },
    chartLabelOn: { color: colors.brand, fontWeight: '600' },
    chartTooltip: { minHeight: 26, marginTop: 4, fontSize: fs(9), lineHeight: fs(13), color: colors.faint },
    chartTooltipOn: { color: colors.muted, fontVariant: ['tabular-nums'] },
  });
}
