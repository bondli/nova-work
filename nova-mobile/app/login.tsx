import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo, Button, TextField } from '@/src/components/ui';
import { ApiError, normalizeBaseUrl } from '@/src/lib/api';
import { APP_VERSION } from '@/src/lib/version';
import { useAuthStore } from '@/src/stores/auth';
import { useUiStore } from '@/src/stores/ui';
import { themedStyles } from '@/src/theme/styles';
import { colors, font, space, fs, useThemeRevision } from '@/src/theme/tokens';

export default function LoginScreen() {
  useThemeRevision();
  const storedBaseUrl = useAuthStore((state) => state.baseUrl);
  const login = useAuthStore((state) => state.login);
  const showToast = useUiStore((state) => state.showToast);

  const [baseUrl, setBaseUrl] = useState(storedBaseUrl);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showServer, setShowServer] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(): Promise<void> {
    if (loading) return;

    if (!username.trim() || !password) {
      showToast('请输入用户名和密码', 'warning');
      return;
    }

    setLoading(true);
    try {
      await login({ baseUrl: normalizeBaseUrl(baseUrl), username: username.trim(), password });
      router.replace('/(tabs)/orders');
    } catch (caught) {
      showToast(caught instanceof ApiError ? caught.message : '登录失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.main}>
            <View style={styles.brand}>
              <BrandLogo size={64} />
              <Text style={styles.brandName}>Dave &amp; Bella</Text>
              <Text style={styles.brandSub}>门店移动经营工作台</Text>
            </View>

            <View style={styles.form}>
              <TextField
                label="用户名"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="请输入员工账号"
                returnKeyType="next"
              />
              <TextField
                label="密码"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="请输入密码"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
              />

              <Pressable onPress={() => setShowServer((value) => !value)} style={styles.serverToggle}>
                <Ionicons name={showServer ? 'chevron-down' : 'chevron-forward'} size={13} color={colors.muted} />
                <Text style={styles.serverToggleText}>服务地址</Text>
              </Pressable>

              {showServer ? (
                <TextField
                  value={baseUrl}
                  onChangeText={setBaseUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="http://192.168.1.10:9577"
                  hint="勿轻易修改，具体填写联系管理员"
                />
              ) : null}

              <Button title="登录" onPress={() => void submit()} loading={loading} />
            </View>
          </View>

          <Text style={styles.version}>DaveBella v{APP_VERSION}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    content: {
      paddingHorizontal: 24,
      paddingVertical: space.xl,
      flexGrow: 1,
      justifyContent: 'space-between',
    },
    main: { flex: 1, justifyContent: 'center', gap: space.xl },
    brand: { alignItems: 'center', gap: 6, transform: [{ translateY: -60 }] },
    brandName: { fontSize: fs(20), fontWeight: '600', color: colors.fg, letterSpacing: 0.5 },
    brandSub: { fontSize: font.meta, color: colors.muted, marginBottom: 10 },
    form: { gap: space.md },
    serverToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
    serverToggleText: { fontSize: font.meta, color: colors.muted },
    version: { textAlign: 'center', fontSize: font.meta, color: colors.faint, marginTop: space.md },
  });
}
