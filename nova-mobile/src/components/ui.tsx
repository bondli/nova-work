import { Ionicons } from '@expo/vector-icons';
import { Check, ChevronDown, ScanLine, UserRound } from 'lucide-react-native';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '@/src/stores/auth';
import { useUiStore } from '@/src/stores/ui';
import { colors, font, HIT_SIZE, radius, space, fs } from '@/src/theme/tokens';
import { themedStyles } from '@/src/theme/styles';
import { BrandLogo } from './brand';
import { ToastHost } from './toast';

export { BrandLogo };

/* ------------------------------------------------------------------ 顶栏 */

export function AppHeader({ title, back = false }: { title: string; back?: boolean }) {
  const user = useAuthStore((state) => state.user);
  const openProfile = useUiStore((state) => state.openProfile);
  const openScan = useUiStore((state) => state.openScan);

  const role = user?.role === 'admin' ? '管理员' : '导购员';
  const subtitle = user ? `${user.realName || user.name} · ${role}` : '未登录';

  return (
    <View style={styles.header}>
      {back ? (
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="返回" style={styles.headerIcon}>
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
      ) : (
        <View style={styles.headerIcon}>
          <BrandLogo size={24} />
        </View>
      )}
      <View style={styles.headerText}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Pressable onPress={openScan} hitSlop={8} accessibilityLabel="扫码" style={styles.headerIcon}>
        <ScanLine size={21} color={colors.fg} strokeWidth={1.8} />
      </Pressable>
      <Pressable onPress={openProfile} accessibilityLabel="我的" style={styles.userIcon}>
        <UserRound size={16} color={colors.brandDark} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ 页面容器 */

export function Screen({
  title,
  children,
  scroll = false,
  back = false,
  footer,
  contentStyle,
  onScroll,
  refreshing = false,
  onRefresh,
}: {
  title: string;
  children: ReactNode;
  scroll?: boolean;
  back?: boolean;
  footer?: ReactNode;
  contentStyle?: ViewStyle;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <AppHeader title={title} back={back} />
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={200}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.brand}
                colors={[colors.brand]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.body, contentStyle]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ 基础卡片 */

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{text}</Text>
      {action}
    </View>
  );
}

export function Row({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'danger' | 'success';
}) {
  const valueColor =
    tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : colors.fg;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, strong && styles.rowValueStrong, { color: valueColor }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand';

export function Badge({
  text,
  tone = 'neutral',
  style,
}: {
  text: string;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    neutral: { bg: colors.bg, fg: colors.muted },
    success: { bg: colors.successBg, fg: colors.success },
    warning: { bg: colors.warningBg, fg: colors.warningText },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    brand: { bg: colors.brandSoft, fg: colors.brandDark },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }, style]}>
      <Text style={[styles.badgeText, { color: palette.fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ 指标卡 */

export function MetricCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {delta === undefined ? null : (
        <Text style={[styles.metricDelta, { color: up ? colors.success : colors.danger }]}>
          {up ? '+' : ''}
          {delta.toFixed(1)}%
          <Text style={styles.metricDeltaMuted}> 较上期</Text>
        </Text>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ Tab 组 */

export interface TabItem {
  id: string;
  label: string;
}

/** 连体无间隙：浅灰容器 + 选中项白底浮起，与桌面端一致 */
export function TabGroup({
  items,
  active,
  onChange,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.tabs}>
      {items.map((item) => {
        const on = item.id === active;
        return (
          <Pressable
            key={item.id}
            onPress={() => onChange(item.id)}
            style={[styles.tab, on && styles.tabActive]}
            accessibilityRole="button"
          >
            <Text
              style={[styles.tabText, on && styles.tabTextActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ 搜索框 */

export function SearchField({
  value,
  onChangeText,
  placeholder,
  onSubmitEditing,
  autoFocus,
  keyboardType,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
}) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={15} color={colors.faint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        style={styles.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        keyboardType={keyboardType}
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="清除搜索内容"
          style={styles.searchClear}
        >
          <Ionicons name="close-circle" size={16} color={colors.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ 选择框 */

/** 下拉选择：点开抽屉单选，默认底部弹出，可指定顶部 */
export function SelectField({
  value,
  options,
  onChange,
  title = '请选择',
  placement = 'bottom',
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  title?: string;
  placement?: 'bottom' | 'top';
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((item) => item.id === value) ?? options[0];
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.selectField} accessibilityRole="button">
        <Text style={styles.selectValue} numberOfLines={1}>
          {current?.label}
        </Text>
        <ChevronDown size={15} color={colors.muted} />
      </Pressable>
      <SheetModal visible={open} title={title} placement={placement} onClose={() => setOpen(false)}>
        <View style={styles.selectList}>
          {options.map((item) => {
            const on = item.id === value;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                style={[styles.selectOption, on && styles.selectOptionActive]}
              >
                <Text style={[styles.selectOptionText, on && styles.selectOptionTextActive]}>
                  {item.label}
                </Text>
                {on ? <Check size={15} color={colors.brandDark} /> : null}
              </Pressable>
            );
          })}
        </View>
      </SheetModal>
    </>
  );
}

/* ------------------------------------------------------------------ 支付 / 会员图标 */

const PAYMENT_KIND: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; soft: string }> = {
  wechat: { icon: 'logo-wechat', color: '#16a34a', soft: '#dcfce7' },
  weixin: { icon: 'logo-wechat', color: '#16a34a', soft: '#dcfce7' },
  alipay: { icon: 'wallet', color: '#2563eb', soft: '#dbeafe' },
  cash: { icon: 'cash-outline', color: '#d97706', soft: '#fef3c7' },
  card: { icon: 'card-outline', color: '#4f46e5', soft: '#eef2ff' },
  balance: { icon: 'wallet', color: '#2563eb', soft: '#dbeafe' },
};

const PAYMENT_FALLBACK = { icon: 'card-outline' as const, color: '#4f46e5', soft: '#eef2ff' };

export function PaymentIcon({ payment, size = 22 }: { payment: string | null | undefined; size?: number }) {
  const kind = (payment && PAYMENT_KIND[payment]) || PAYMENT_FALLBACK;
  return (
    <View
      style={[
        styles.payIcon,
        { width: size, height: size, borderRadius: Math.max(6, Math.round(size / 3)), backgroundColor: kind.soft },
      ]}
    >
      <Ionicons name={kind.icon} size={Math.round(size * 0.62)} color={kind.color} />
    </View>
  );
}

export function MemberAvatar({ kind = 'platform', size = 36 }: { kind?: string; size?: number }) {
  const superMember = kind === 'super';
  return (
    <View
      style={[
        styles.memberAvatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: superMember ? colors.warningBg : colors.brandSoft,
        },
      ]}
    >
      <Ionicons
        name={superMember ? 'star' : 'person'}
        size={Math.round(size * 0.44)}
        color={superMember ? colors.warningText : colors.brand}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ 按钮 / 输入 */

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  compact = false,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
}) {
  const palette = {
    primary: { bg: colors.brand, fg: '#fff', border: colors.brand },
    secondary: { bg: colors.card, fg: colors.fg, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.brand, border: 'transparent' },
    danger: { bg: colors.danger, fg: '#fff', border: colors.danger },
  }[variant];

  const blocked = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={blocked}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: blocked ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <Text style={[styles.buttonText, { color: palette.fg }]} numberOfLines={1}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function TextField({
  label,
  hint,
  secureTextEntry = false,
  value,
  onChangeText,
  style,
  ...props
}: TextInputProps & { label?: string; hint?: string }) {
  const [plain, setPlain] = useState(false);
  const hasValue = String(value ?? '').length > 0;
  // 只读输入框（editable=false）不提供清除按钮
  const canClear = hasValue && props.editable !== false;
  const showActions = canClear || secureTextEntry;

  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.inputWrap}>
        <TextInput
          placeholderTextColor={colors.faint}
          {...props}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry && !plain}
          style={[
            styles.input,
            secureTextEntry && canClear
              ? styles.inputWithClearBoth
              : showActions
                ? styles.inputWithAction
                : null,
            style,
          ]}
        />
        {showActions ? (
          <View style={styles.inputActions}>
            {canClear ? (
              <Pressable
                onPress={() => onChangeText?.('')}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`清除${label ?? '输入内容'}`}
                style={styles.inputAction}
              >
                <Ionicons name="close-circle" size={15} color={colors.faint} />
              </Pressable>
            ) : null}
            {secureTextEntry ? (
              <Pressable
                onPress={() => setPlain((current) => !current)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={plain ? '隐藏密码' : '显示密码'}
                style={styles.inputAction}
              >
                <Ionicons
                  name={plain ? 'eye-off-outline' : 'eye-outline'}
                  size={15}
                  color={colors.muted}
                />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="减少数量"
        onPress={() => onChange(Math.max(min, value - 1))}
        style={styles.stepperButton}
      >
        <Ionicons name="remove" size={14} color={colors.muted} />
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="增加数量"
        onPress={() => onChange(Math.min(max, value + 1))}
        style={styles.stepperButton}
      >
        <Ionicons name="add" size={14} color={colors.muted} />
      </Pressable>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button">
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ 空态 / 加载 */

export function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="cube-outline" size={26} color={colors.faint} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.brand} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ 底部抽屉 / 居中弹窗 */

export function SheetModal({
  visible,
  title,
  onClose,
  children,
  placement = 'bottom',
}: {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  /** top：从顶部下拉，适合带输入框、需要键盘的场景 */
  placement?: 'bottom' | 'top';
}) {
  const insets = useSafeAreaInsets();
  const top = placement === 'top';

  // Modal 自身用 fade（遮罩淡入淡出），sheet 内容用 Animated 自行滑入/滑出，
  // 避免 animationType="slide" 时半透明遮罩也跟着上下移动的突兀感。
  const [showModal, setShowModal] = useState(visible);
  const slide = useRef(new Animated.Value(visible ? 0 : 1)).current;

  useEffect(() => {
    if (visible) {
      setShowModal(true);
      // 下一帧再启动动画，确保 Modal 已挂载、初始位移已应用
      requestAnimationFrame(() => {
        Animated.timing(slide, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }).start();
      });
    } else if (showModal) {
      Animated.timing(slide, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setShowModal(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const sheetTranslate = slide.interpolate({
    inputRange: [0, 1],
    outputRange: top ? ['0%', '-100%'] : ['0%', '100%'],
  });

  return (
    <Modal
      visible={showModal}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.modalRoot, top && styles.modalRootTop]}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            top
              ? [styles.sheetTop, { paddingTop: insets.top + 8 }]
              : { paddingBottom: Math.max(24, insets.bottom + 12) },
            { transform: [{ translateY: sheetTranslate }] },
          ]}
        >
          <View style={styles.sheetHandle} />
          {title ? (
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10} style={styles.sheetClose}>
                <Ionicons name="close" size={16} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
            {children}
          </ScrollView>
        </Animated.View>
        {/* 抽屉内同样渲染提示层，避免 Toast 被 Modal 遮挡 */}
        <ToastHost />
      </View>
    </Modal>
  );
}

export function AppDialog({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dialogRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.dialog}>{children}</View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ 行内小组件 */

/** 弹窗/抽屉内的浅灰信息块 */
export function InfoBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.infoBlock}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoBody}>{children}</View>
    </View>
  );
}

/** 会员详情里的四宫格指标 */
export function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.miniMetricLabel}>{label}</Text>
      <Text style={styles.miniMetricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

/** 抽屉里带分割线的记录行（左右对齐） */
export function RecordRow({
  children,
  right,
  last = false,
}: {
  children: ReactNode;
  right: ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.recordRow, last && styles.recordRowLast]}>
      <View style={styles.recordBody}>{children}</View>
      <View style={styles.recordRight}>{right}</View>
    </View>
  );
}

export const uiStyles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: font.meta },
  strong: { color: colors.fg, fontSize: font.body, fontWeight: '600' },
  metric: { color: colors.fg, fontSize: font.metric, fontWeight: '700' },
});

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    header: {
      height: 52,
      paddingHorizontal: space.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerIcon: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    userIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brandSoft,
    },
    headerText: { flex: 1, minWidth: 0 },
    headerTitle: { fontSize: fs(15), fontWeight: '600', color: colors.fg },
    headerSubtitle: { fontSize: fs(10), color: colors.muted, marginTop: 1 },

    body: { flex: 1 },
    scrollContent: { paddingHorizontal: 7, paddingTop: 14, paddingBottom: 20, gap: 10 },

    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 12,
      gap: 8,
    },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: fs(11), color: colors.muted, fontWeight: '600' },

    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
    rowLabel: { fontSize: font.meta, color: colors.muted },
    rowValue: { fontSize: font.meta, color: colors.fg, fontVariant: ['tabular-nums'], flexShrink: 1 },
    rowValueStrong: { fontWeight: '700', fontSize: font.body },

    badge: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.pill, alignSelf: 'flex-start' },
    badgeText: { fontSize: fs(10), fontWeight: '600' },

    metricCard: {
      flex: 1,
      minWidth: 0,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 12,
    },
    metricLabel: { fontSize: fs(10), color: colors.muted },
    metricValue: { fontSize: fs(17), fontWeight: '600', color: colors.fg, marginTop: 3, fontVariant: ['tabular-nums'] },
    metricDelta: { fontSize: fs(10), fontWeight: '500', marginTop: 4, fontVariant: ['tabular-nums'] },
    metricDeltaMuted: { color: colors.faint, fontWeight: '400' },

    tabs: {
      flexDirection: 'row',
      padding: 5,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.tabsBg,
    },
    tab: {
      flex: 1,
      minWidth: 0,
      height: 26,
      paddingHorizontal: 4,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabActive: {
      backgroundColor: colors.tabsActiveBg,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    tabText: { fontSize: fs(12), color: colors.muted },
    tabTextActive: { color: colors.fg, fontWeight: '600' },

    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      height: 36,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    searchInput: { flex: 1, minWidth: 0, padding: 0, fontSize: fs(12), color: colors.fg },
    searchClear: { alignItems: 'center', justifyContent: 'center' },

    selectField: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 36,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      gap: 8,
    },
    selectValue: { flex: 1, minWidth: 0, fontSize: fs(12), color: colors.fg },
    selectList: { gap: 6 },
    selectOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: colors.subtle,
    },
    selectOptionActive: { backgroundColor: colors.brandSoft },
    selectOptionText: { fontSize: fs(12), color: colors.fg },
    selectOptionTextActive: { color: colors.brandDark, fontWeight: '600' },

    payIcon: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    memberAvatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

    button: {
      minHeight: HIT_SIZE,
      borderRadius: radius.control,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.lg,
    },
    buttonCompact: { minHeight: 32, paddingHorizontal: space.md },
    buttonText: { fontSize: font.body, fontWeight: '600' },

    field: { gap: 4 },
    fieldLabel: { fontSize: fs(11), color: colors.muted },
    inputWrap: { justifyContent: 'center' },
    inputActions: {
      position: 'absolute',
      right: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    inputAction: { padding: 4 },
    inputWithAction: { paddingRight: 32 },
    inputWithClearBoth: { paddingRight: 58 },
    input: {
      minHeight: 40,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.control,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: fs(13),
      color: colors.fg,
      backgroundColor: colors.card,
    },
    fieldHint: { fontSize: fs(10), color: colors.faint },

    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 3,
    },
    stepperButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    stepperValue: {
      minWidth: 16,
      textAlign: 'center',
      fontSize: fs(11),
      color: colors.fg,
      fontVariant: ['tabular-nums'],
    },

    chip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
    chipText: { fontSize: font.meta, color: colors.muted },
    chipTextActive: { color: colors.brandDark, fontWeight: '600' },

    empty: { paddingVertical: 40, alignItems: 'center', gap: 8 },
    emptyText: { fontSize: fs(11), color: colors.faint },

    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    modalRootTop: { justifyContent: 'flex-start' },
    modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.42)' },
    sheet: {
      width: '100%',
      maxHeight: '88%',
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    sheetTop: {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
      paddingBottom: 16,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'center' },
    sheetTitle: { fontSize: fs(15), fontWeight: '600', color: colors.fg, flex: 1 },
    sheetClose: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
    },
    sheetBody: { paddingTop: 4, paddingBottom: 8 },

    dialogRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    dialog: { width: '100%', backgroundColor: colors.card, borderRadius: 18, padding: 16 },

    infoBlock: { backgroundColor: colors.subtle, borderRadius: 10, padding: 12, gap: 6 },
    infoLabel: { fontSize: fs(10), fontWeight: '500', color: colors.muted },
    infoBody: { flexDirection: 'row', alignItems: 'center', gap: 8 },

    miniMetric: {
      flex: 1,
      minWidth: 0,
      backgroundColor: colors.subtle,
      borderRadius: 10,
      padding: 12,
    },
    miniMetricLabel: { fontSize: fs(10), color: colors.muted },
    miniMetricValue: { fontSize: fs(15), fontWeight: '600', color: colors.fg, marginTop: 2, fontVariant: ['tabular-nums'] },

    recordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    recordRowLast: { borderBottomWidth: 0 },
    recordBody: { flex: 1, minWidth: 0, gap: 2 },
    recordRight: { flexShrink: 0, alignItems: 'flex-end' },
  });
}
