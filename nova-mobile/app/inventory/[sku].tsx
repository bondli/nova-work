import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Card, Empty, Loading, MiniMetric, Screen } from '@/src/components/ui';
import { formatDateTime } from '@/src/lib/format';
import { formatYuan } from '@/src/lib/money';
import { queryInventoryDetail, queryStockRecords } from '@/src/lib/pos';
import { colors, fs, useThemeRevision } from '@/src/theme/tokens';
import { themedStyles } from '@/src/theme/styles';

/** 变动类型文案，对齐桌面端 INVENTORY_CHANGE_TYPE */
const TYPE_LABEL: Record<string, string> = {
  in: '采购入库',
  sale: '销售出库',
  exchangeIn: '换货回库',
  exchangeOut: '换货出库',
  returnIn: '退货回库',
  return: '批量退库',
  adjust: '人工调整',
};

/** 出库类型服务端存正数，展示为负 */
const OUTBOUND = new Set(['sale', 'exchangeOut', 'return']);

export default function StockFlowScreen() {
  useThemeRevision();
  const params = useLocalSearchParams<{ sku?: string }>();
  const sku = params.sku ?? '';

  const detailQuery = useQuery({
    queryKey: ['inventory-detail', sku],
    queryFn: () => queryInventoryDetail(sku),
    enabled: Boolean(sku),
  });
  const recordsQuery = useQuery({
    queryKey: ['stock-records', sku],
    queryFn: () => queryStockRecords(sku),
    enabled: Boolean(sku),
  });

  const item = detailQuery.data;
  const records = recordsQuery.data ?? [];

  return (
    <Screen title="商品流水" back scroll>
      {detailQuery.isLoading ? (
        <Loading />
      ) : !item ? (
        <Empty text="未查询到该商品" />
      ) : (
        <Card>
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {[item.color, item.size].filter(Boolean).join(' / ') || '—'}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            款号 {item.sn} · 条码 {item.sku}
          </Text>
          <View style={styles.metricRow}>
            <MiniMetric label="吊牌价" value={formatYuan(item.originalPrice)} />
            <MiniMetric label="库存" value={String(item.counts ?? 0)} />
            <MiniMetric label="销量" value={String(item.saleCounts ?? 0)} />
          </View>
        </Card>
      )}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>变动记录</Text>
        <Text style={styles.sectionMeta}>{records.length} 条</Text>
      </View>

      {recordsQuery.isLoading ? (
        <Loading />
      ) : recordsQuery.isError ? (
        <Empty text="流水加载失败，请重试" />
      ) : records.length === 0 ? (
        <Empty text="暂无库存变动记录" />
      ) : (
        <View style={styles.list}>
          {records.map((record) => {
            const change = OUTBOUND.has(record.type) ? -record.count : record.count;
            return (
              <View key={record.id} style={styles.row}>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Badge text={TYPE_LABEL[record.type] ?? '库存变动'} tone="brand" />
                    <Text style={styles.rowInfo} numberOfLines={1}>
                      {record.info || '库存变动'}
                    </Text>
                  </View>
                  <Text style={styles.rowTime}>{formatDateTime(record.createdAt)}</Text>
                </View>
                <Text style={[styles.count, change >= 0 ? styles.up : styles.down]}>
                  {change >= 0 ? '+' : ''}
                  {change}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    name: { fontSize: fs(14), fontWeight: '600', color: colors.fg },
    meta: { fontSize: fs(10), color: colors.muted, fontVariant: ['tabular-nums'] },
    metricRow: { flexDirection: 'row', gap: 8, marginTop: 6 },

    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    sectionTitle: { fontSize: fs(11), fontWeight: '500', color: colors.muted },
    sectionMeta: { fontSize: fs(10), color: colors.faint },

    list: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    rowBody: { flex: 1, minWidth: 0, gap: 3 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rowInfo: { flex: 1, fontSize: fs(12), color: colors.fg },
    rowTime: { fontSize: fs(10), color: colors.muted, fontVariant: ['tabular-nums'] },
    count: { fontSize: fs(14), fontWeight: '600', fontVariant: ['tabular-nums'] },
    up: { color: colors.success },
    down: { color: colors.danger },
  });
}
