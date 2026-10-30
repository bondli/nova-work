import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, Empty, Loading, Screen, SelectField, TextField } from '@/src/components/ui';
import { ApiError } from '@/src/lib/api';
import { loadClerks, modifyOrder, queryOrderDetail } from '@/src/lib/pos';
import { useAuthStore } from '@/src/stores/auth';
import { useUiStore } from '@/src/stores/ui';
import { themedStyles } from '@/src/theme/styles';
import { colors, fs, space, useThemeRevision } from '@/src/theme/tokens';

const PAYMENTS = [
  { id: 'weixin', label: '微信' },
  { id: 'alipay', label: '支付宝' },
  { id: 'cash', label: '现金' },
  { id: 'card', label: '银行卡' },
  { id: 'other', label: '其他' },
];

interface EditForm {
  payType: string;
  amount: string;
  salerId: string;
  userPhone: string;
  remark: string;
}

export default function OrderEditScreen() {
  useThemeRevision();
  const { orderSn = '' } = useLocalSearchParams<{ orderSn?: string }>();
  const queryClient = useQueryClient();
  const showToast = useUiStore((state) => state.showToast);
  const user = useAuthStore((state) => state.user);

  const [draft, setDraft] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['order-detail', orderSn],
    queryFn: () => queryOrderDetail(orderSn),
    enabled: Boolean(orderSn),
  });
  const detail = detailQuery.data ?? null;

  const clerksQuery = useQuery({
    queryKey: ['clerks'],
    queryFn: () =>
      loadClerks({
        id: String(user?.id ?? 0),
        name: user?.realName || user?.name || '',
      }),
  });
  const clerkOptions = useMemo(
    () => (clerksQuery.data ?? []).map((clerk) => ({ id: String(clerk.id), label: clerk.name })),
    [clerksQuery.data],
  );

  // 表单默认值直接由订单详情推导，用户编辑后才落到 draft，避免额外 effect 同步
  const form: EditForm = draft ?? {
    payType: detail?.payType ?? 'weixin',
    amount: String(Number(detail?.orderActualAmount ?? 0)),
    salerId: detail?.salerId ? String(detail.salerId) : String(user?.id ?? ''),
    userPhone: detail?.userPhone ?? '',
    remark: detail?.remark ?? '',
  };
  const patch = (next: Partial<EditForm>): void => setDraft({ ...form, ...next });

  const isAdmin = user?.role === 'admin';
  const locked = detail?.orderStatus === 'checked';

  async function submit(): Promise<void> {
    if (!detail || saving) return;

    const paid = Number(form.amount);
    if (!locked) {
      if (!Number.isFinite(paid) || paid < 0) {
        showToast('请输入正确的实付金额', 'warning');
        return;
      }
      if (!detail.id) {
        showToast('订单信息不完整，请返回后重试', 'error');
        return;
      }
      if (isAdmin && !form.salerId) {
        showToast('请选择导购员', 'warning');
        return;
      }
    }

    setSaving(true);
    try {
      await modifyOrder({
        orderId: Number(detail.id),
        orderSn: detail.orderSn,
        payType: form.payType,
        orderActualAmount: paid,
        salerId: isAdmin ? Number(form.salerId || 0) : Number(detail.salerId ?? user?.id ?? 0),
        userPhone: form.userPhone.trim(),
        remark: form.remark.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['order-detail'] });
      await queryClient.invalidateQueries({ queryKey: ['order-items'] });
      showToast('订单已更新');
      router.back();
    } catch (caught) {
      showToast(caught instanceof ApiError ? caught.message : '保存失败，请稍后重试', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title="修改订单"
      back
      scroll
      footer={
        <View style={styles.footer}>
          <Button title="保存修改" onPress={() => void submit()} loading={saving} disabled={!detail} />
        </View>
      }
    >
      {detailQuery.isLoading ? (
        <Loading />
      ) : !detail ? (
        <Empty text="未查询到该订单" />
      ) : (
        <>
          <Text style={styles.orderNo}>{detail.orderSn}</Text>
          <Text style={styles.hint}>
            {locked ? '该订单已完成对账，仅支持修改备注' : '修改后立即写入订单，并同步会员实付金额与积分'}
          </Text>

          <Card style={styles.card}>
            <Text style={styles.label}>支付方式</Text>
            <View
              style={[styles.chipRow, locked && styles.chipRowLocked]}
              pointerEvents={locked ? 'none' : 'auto'}
            >
              {PAYMENTS.map((payment) => (
                <Chip
                  key={payment.id}
                  label={payment.label}
                  active={form.payType === payment.id}
                  onPress={() => patch({ payType: payment.id })}
                />
              ))}
            </View>

            <TextField
              label="实付金额（元）"
              value={form.amount}
              onChangeText={(value) => patch({ amount: value })}
              editable={!locked}
              keyboardType="decimal-pad"
            />

            {isAdmin && !locked ? (
              <>
                <Text style={styles.label}>导购员</Text>
                <SelectField
                  value={form.salerId}
                  options={clerkOptions}
                  onChange={(value) => patch({ salerId: value })}
                  title="选择导购员"
                />
              </>
            ) : (
              <TextField label="导购员" value={detail.salerName || '—'} editable={false} />
            )}

            <TextField
              label="会员手机号"
              value={form.userPhone}
              onChangeText={(value) => patch({ userPhone: value })}
              editable={!locked}
              keyboardType="phone-pad"
              placeholder="散客可留空"
            />

            <TextField
              label="订单备注"
              value={form.remark}
              onChangeText={(value) => patch({ remark: value })}
              placeholder="选填"
            />
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    orderNo: { fontSize: fs(13), color: colors.fg, fontWeight: '600' },
    hint: { fontSize: fs(11), color: colors.muted },
    card: { gap: space.md },
    label: { fontSize: fs(11), color: colors.muted },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    chipRowLocked: { opacity: 0.45 },
    footer: {
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.card,
    },
  });
}
