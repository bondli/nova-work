import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUiStore, type ToastItem, type ToastTone } from '@/src/stores/ui';
import { themedStyles } from '@/src/theme/styles';
import { colors, fs, useThemeRevision } from '@/src/theme/tokens';

/** 与桌面端 antd message 一致：实心圆形状态图标 */
const TONE_META: Record<ToastTone, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  success: { icon: 'checkmark-circle', color: '#52c41a' },
  error: { icon: 'close-circle', color: '#ff4d4f' },
  warning: { icon: 'alert-circle', color: '#faad14' },
  info: { icon: 'information-circle', color: '#1677ff' },
};

/**
 * 全局轻提示：顶部居中、图标 + 文案、自动消失。
 * 应用根部与 SheetModal 内各挂载一份，保证抽屉打开时提示不被 Modal 遮挡。
 */
export function ToastHost() {
  useThemeRevision();
  const toasts = useUiStore((state) => state.toasts);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { paddingTop: insets.top + 108 }]}>
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </View>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const meta = TONE_META[item.tone];

  return (
    <Animated.View
      style={[
        styles.cardWrap,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }),
            },
          ],
        },
      ]}
    >
      <View style={styles.card}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
        <Text style={styles.text} numberOfLines={3}>
          {item.message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: 8,
      zIndex: 999,
      elevation: 999,
    },
    cardWrap: { maxWidth: '88%' },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.16,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    text: { flexShrink: 1, fontSize: fs(13), lineHeight: fs(19), color: colors.fg },
  });
}
