import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
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
  Button,
  Empty,
  Loading,
  MiniMetric,
  Screen,
  SearchField,
  SheetModal,
  TabGroup,
} from '@/src/components/ui';
import { formatYuan } from '@/src/lib/money';
import { groupNumber } from '@/src/lib/format';
import {
  queryHotSales,
  queryInventory,
  queryInventoryByStyle,
  queryInventoryDetail,
} from '@/src/lib/pos';
import type { InventoryRow, InventorySummary, Paged } from '@/src/lib/types';
import { apiGet } from '@/src/lib/api';
import { useUiStore } from '@/src/stores/ui';
import { colors, fs, useThemeRevision } from '@/src/theme/tokens';
import { themedStyles } from '@/src/theme/styles';

type ViewKey = 'all' | 'broken' | 'hot';

const PAGE_SIZE = 20;

const SWATCHES = ['#d6b48c', '#9f1239', '#0f766e', '#1e3a8a', '#6b7280', '#7c3aed', '#b45309', '#0369a1'];

function swatchColor(name: string): string {
  let sum = 0;
  for (let index = 0; index < name.length; index += 1) sum += name.charCodeAt(index);
  return SWATCHES[sum % SWATCHES.length] ?? SWATCHES[0] ?? '#d6b48c';
}

function attributeText(row: InventoryRow): string {
  const parts = [row.color, row.size].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' / ') : '—';
}

export default function InventoryScreen() {
  useThemeRevision();
  const scanKeyword = useUiStore((state) => state.inventoryKeyword);
  const setInventoryKeyword = useUiStore((state) => state.setInventoryKeyword);

  const [view, setView] = useState<ViewKey>('all');
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<InventoryRow | null>(null);

  // 扫码带入的条码优先展示；用户手动输入或切 Tab 后清除
  const effectiveKeyword = scanKeyword || keyword;
  const effectiveView: ViewKey = scanKeyword ? 'all' : view;

  useEffect(() => {
    const timer = setTimeout(() => setSearch(effectiveKeyword.trim()), 300);
    return () => clearTimeout(timer);
  }, [effectiveKeyword]);

  const summaryQuery = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: () => apiGet<InventorySummary>('/inventory/summary'),
  });
  const summary = summaryQuery.data;

  const listQuery = useInfiniteQuery({
    queryKey: ['inventory', effectiveView, search],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      if (effectiveView === 'hot') {
        const rows = await queryHotSales(50);
        return { count: rows.length, data: rows } satisfies Paged<InventoryRow>;
      }
      if (effectiveView === 'broken') {
        return apiGet<Paged<InventoryRow>>('/inventory/getNoStockList', {
          keyword: search || undefined,
          current: pageParam,
          pageSize: PAGE_SIZE,
        });
      }
      return queryInventory(search, pageParam, PAGE_SIZE);
    },
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + (page.data?.length ?? 0), 0);
      return loaded < (lastPage.count ?? 0) ? pages.length + 1 : undefined;
    },
  });

  const rows = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((page) => page.data ?? []),
    [listQuery.data],
  );
  const total = listQuery.data?.pages[0]?.count ?? 0;

  const tabs = [
    { id: 'all', label: `全部 ${groupNumber(summary?.styleCount ?? 0)}` },
    { id: 'broken', label: `断码 ${groupNumber(summary?.brokenStyleCount ?? 0)}` },
    { id: 'hot', label: `热销 ${groupNumber(summary?.soldTotal ?? 0)}` },
  ];

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>): void {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y < contentSize.height - 80) return;
    if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) void listQuery.fetchNextPage();
  }

  return (
    <Screen title="库存" scroll onScroll={handleScroll}>
      <SearchField
        value={effectiveKeyword}
        onChangeText={(text) => {
          if (scanKeyword) setInventoryKeyword('');
          setKeyword(text);
        }}
        placeholder="款号 / 条码 / 商品名称"
      />

      <TabGroup
        items={tabs}
        active={effectiveView}
        onChange={(id) => {
          setInventoryKeyword('');
          setView(id as ViewKey);
          setKeyword('');
          setSearch('');
        }}
      />

      {listQuery.isLoading ? (
        <Loading />
      ) : listQuery.isError ? (
        <Empty text="库存加载失败，请检查网络后重试" />
      ) : rows.length === 0 ? (
        <Empty text={search ? '没有匹配的商品' : effectiveView === 'broken' ? '暂无断码商品' : '暂无库存'} />
      ) : (
        <View style={styles.list}>
          {rows.map((row) => (
            <InventoryCard key={row.sku} row={row} onPress={() => setDetail(row)} />
          ))}
          <View style={styles.footer}>
            {listQuery.isFetchingNextPage ? (
              <ActivityIndicator color={colors.brand} size="small" />
            ) : listQuery.hasNextPage ? (
              <Text style={styles.footerText}>上拉加载更多 · 共 {total} 款</Text>
            ) : (
              <Text style={styles.footerText}>
                共 {total} 款{effectiveView === 'hot' ? '（按销量排序）' : ''}
              </Text>
            )}
          </View>
        </View>
      )}

      <InventoryDetailSheet item={detail} onClose={() => setDetail(null)} />
    </Screen>
  );
}

function InventoryCard({ row, onPress }: { row: InventoryRow; onPress: () => void }) {
  const stock = row.counts ?? 0;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={[styles.swatch, { backgroundColor: swatchColor(row.name) }]}>
        <Text style={styles.swatchText}>{row.name.slice(0, 1)}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.name} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[row.sn, row.color, row.size].filter(Boolean).join(' · ') || '—'}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          条码 {row.sku}
          {' · '}
          <Text style={stock === 0 ? styles.stockOut : stock < 10 ? styles.stockLow : undefined}>
            库存 {stock}
          </Text>
          {' · '}
          销量 {row.saleCounts ?? 0}
        </Text>
      </View>
      <Text style={styles.price}>{formatYuan(row.originalPrice)}</Text>
    </Pressable>
  );
}

function InventoryDetailSheet({
  item,
  onClose,
}: {
  item: InventoryRow | null;
  onClose: () => void;
}) {
  const visible = Boolean(item);

  const detailQuery = useQuery({
    queryKey: ['inventory-detail', item?.sku ?? ''],
    queryFn: () => queryInventoryDetail(item?.sku ?? ''),
    enabled: visible,
  });
  const siblingsQuery = useQuery({
    queryKey: ['inventory-siblings', item?.sn ?? ''],
    queryFn: () => queryInventoryByStyle(item?.sn ?? ''),
    enabled: visible && Boolean(item?.sn),
  });

  const current = detailQuery.data ?? item;
  const siblings = siblingsQuery.data ?? [];
  const [copiedSku, setCopiedSku] = useState<string | null>(null);

  function copySku(sku: string): void {
    void Clipboard.setStringAsync(sku);
    setCopiedSku(sku);
    setTimeout(() => setCopiedSku(null), 1500);
  }

  return (
    <SheetModal visible={visible} title="商品详情" onClose={onClose}>
      {current ? (
        <>
          <View style={styles.detailHead}>
            <View style={[styles.swatch, styles.swatchLarge, { backgroundColor: swatchColor(current.name) }]}>
              <Text style={[styles.swatchText, styles.swatchTextLarge]}>{current.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.detailHeadBody}>
              <Text style={styles.detailName} numberOfLines={2}>
                {current.name}
              </Text>
              <Text style={styles.detailAttr} numberOfLines={1}>
                {attributeText(current)}
              </Text>
              <Text style={styles.detailSku} numberOfLines={1}>
                款号 {current.sn} · 条码 {current.sku}
              </Text>
            </View>
          </View>

          <View style={styles.metricRow}>
            <MiniMetric label="吊牌价" value={formatYuan(current.originalPrice)} />
            <MiniMetric label="库存" value={String(current.counts ?? 0)} />
            <MiniMetric label="销量" value={String(current.saleCounts ?? 0)} />
          </View>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>同款其他 SKU</Text>
            <Text style={styles.sectionMeta}>{siblings.length} 个</Text>
          </View>

          {siblingsQuery.isLoading ? (
            <Text style={styles.mutedText}>加载中…</Text>
          ) : siblings.length === 0 ? (
            <Text style={styles.mutedText}>暂无其他规格</Text>
          ) : (
            <View style={styles.skuList}>
              {siblings.map((row) => {
                const on = row.sku === current.sku;
                return (
                  <View key={row.sku} style={[styles.skuRow, on && styles.skuRowActive]}>
                    <View style={styles.skuBody}>
                      <Pressable
                        onPress={() => copySku(row.sku)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`复制条码 ${row.sku}`}
                        style={styles.skuCodeRow}
                      >
                        <Text style={styles.skuCode} numberOfLines={1}>
                          {row.sku}
                        </Text>
                        {copiedSku === row.sku ? (
                          <Text style={styles.skuCopied}>已复制</Text>
                        ) : (
                          <Ionicons name="copy-outline" size={12} color={colors.muted} />
                        )}
                      </Pressable>
                      <Text style={styles.skuAttr} numberOfLines={1}>
                        {attributeText(row)}
                      </Text>
                    </View>
                    <Text style={styles.skuStock}>库存 {row.counts ?? 0}</Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.flowAction}>
            <Button
              title="查看商品流水"
              onPress={() => {
                const sku = current.sku;
                onClose();
                router.push({ pathname: '/inventory/[sku]', params: { sku } });
              }}
            />
          </View>
        </>
      ) : null}
    </SheetModal>
  );
}

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    list: { gap: 8 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 10,
    },
    pressed: { opacity: 0.8 },
    swatch: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 0.9,
    },
    swatchLarge: { width: 56, height: 56, borderRadius: 12 },
    swatchText: { fontSize: fs(15), fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
    swatchTextLarge: { fontSize: fs(20) },
    cardBody: { flex: 1, minWidth: 0 },
    name: { fontSize: fs(13), fontWeight: '500', color: colors.fg },
    price: { flexShrink: 0, fontSize: fs(12), fontWeight: '600', color: colors.fg, fontVariant: ['tabular-nums'] },
    meta: { fontSize: fs(10), color: colors.muted, marginTop: 3, fontVariant: ['tabular-nums'] },
    stockOut: { color: colors.danger, fontWeight: '600' },
    stockLow: { color: colors.warning, fontWeight: '500' },

    footer: { paddingVertical: 8, alignItems: 'center' },
    footerText: { fontSize: fs(10), color: colors.faint },

    detailHead: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    detailHeadBody: { flex: 1, minWidth: 0, gap: 3 },
    detailName: { fontSize: fs(14), fontWeight: '600', color: colors.fg },
    detailAttr: { fontSize: fs(11), color: colors.muted },
    detailSku: { fontSize: fs(10), color: colors.faint, fontVariant: ['tabular-nums'] },

    metricRow: { flexDirection: 'row', gap: 8, marginTop: 12 },

    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
      marginBottom: 6,
    },
    sectionTitle: { fontSize: fs(11), fontWeight: '500', color: colors.muted },
    sectionMeta: { fontSize: fs(10), color: colors.faint },
    mutedText: { fontSize: fs(11), color: colors.muted },

    skuList: { gap: 6 },
    skuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.subtle,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    skuRowActive: { borderColor: colors.brandBorder, backgroundColor: colors.brandSoft },
    skuBody: { flex: 1, minWidth: 0 },
    skuCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
    skuCode: { flexShrink: 1, fontSize: fs(11), color: colors.fg, fontVariant: ['tabular-nums'] },
    skuCopied: { fontSize: fs(10), color: colors.brand },
    skuAttr: { fontSize: fs(10), color: colors.muted, marginTop: 1 },
    skuStock: { fontSize: fs(11), color: colors.fg, fontVariant: ['tabular-nums'] },
    flowAction: { marginTop: 16 },
  });
}
