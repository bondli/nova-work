import { ChartColumn, Package, ReceiptText, ScanLine, Users } from 'lucide-react-native';
import { Redirect, Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useAuthStore } from '@/src/stores/auth';
import { themedStyles } from '@/src/theme/styles';
import { colors, font, useThemeRevision } from '@/src/theme/tokens';

/** 底部导航按钮：去掉 Android 水波纹，改为按下轻微变淡 */
type TabBarButtonProps = Omit<PressableProps, 'style'> & {
  href?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

function TabBarButton(props: TabBarButtonProps) {
  return (
    <Pressable
      accessibilityRole={props.accessibilityRole}
      accessibilityState={props.accessibilityState}
      accessibilityLabel={props.accessibilityLabel}
      testID={props.testID}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      style={({ pressed }) => [props.style, pressed && styles.tabPressed]}
    >
      {props.children}
    </Pressable>
  );
}

export default function TabsLayout() {
  useThemeRevision();
  const token = useAuthStore((state) => state.token);
  if (!token) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: font.caption - 1, fontWeight: '500' },
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarButton: TabBarButton,
      }}
    >
      <Tabs.Screen
        name="orders"
        options={{
          title: '订单',
          tabBarIcon: ({ color }) => (
            <ReceiptText size={20} color={String(color ?? colors.muted)} strokeWidth={1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: '库存',
          tabBarIcon: ({ color }) => (
            <Package size={20} color={String(color ?? colors.muted)} strokeWidth={1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="buy"
        options={{
          title: '买单',
          tabBarIcon: ({ color }) => (
            <ScanLine size={20} color={String(color ?? colors.muted)} strokeWidth={1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: '会员',
          tabBarIcon: ({ color }) => (
            <Users size={20} color={String(color ?? colors.muted)} strokeWidth={1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="data"
        options={{
          title: '数据',
          tabBarIcon: ({ color }) => (
            <ChartColumn size={20} color={String(color ?? colors.muted)} strokeWidth={1.8} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    tabBar: {
      paddingTop: 6,
      borderTopColor: colors.border,
      backgroundColor: colors.card,
    },
    tabItem: { paddingVertical: 0 },
    tabPressed: { opacity: 0.55 },
  });
}
