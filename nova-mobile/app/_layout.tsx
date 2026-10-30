import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BrandLogo } from '@/src/components/ui';
import { GlobalOverlays } from '@/src/components/overlays';
import { setUnauthorizedHandler } from '@/src/lib/api';
import { useAuthStore } from '@/src/stores/auth';
import { themedStyles } from '@/src/theme/styles';
import { colors, font, fs, space, useThemeMode } from '@/src/theme/tokens';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export default function RootLayout() {
  const mode = useThemeMode();
  const ready = useAuthStore((state) => state.ready);
  const hydrate = useAuthStore((state) => state.hydrate);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void logout();
      router.replace('/login');
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  if (!ready) {
    return (
      <View style={styles.splash}>
        <BrandLogo size={72} />
        <Text style={styles.splashName}>Dave &amp; Bella</Text>
        <Text style={styles.splashSub}>门店移动作业</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
          <View style={styles.root}>
            <Stack
              screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
            />
            <GlobalOverlays />
          </View>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    root: { flex: 1 },
    splash: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      gap: space.sm,
    },
    splashName: { fontSize: fs(15), fontWeight: '600', color: colors.fg, letterSpacing: 0.5 },
    splashSub: { fontSize: font.caption, color: colors.faint },
  });
}
