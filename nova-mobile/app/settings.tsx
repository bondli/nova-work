import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, TabGroup, TextField } from '@/src/components/ui';
import { useAuthStore } from '@/src/stores/auth';
import { useUiStore } from '@/src/stores/ui';
import {
  appPreferences,
  savePreferences,
  type AppPreferences,
  type FontSizePreference,
  type ThemePreference,
} from '@/src/theme/preferences';
import { themedStyles } from '@/src/theme/styles';
import { applyAppearance, colors, fs, useThemeRevision } from '@/src/theme/tokens';

const THEMES: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: '系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '暗色' },
];

const FONT_SIZES: { id: string; label: string }[] = [
  { id: '12', label: '12px' },
  { id: '14', label: '14px' },
  { id: '16', label: '16px' },
];

export default function SettingsScreen() {
  useThemeRevision();
  const baseUrl = useAuthStore((state) => state.baseUrl);
  const updateBaseUrl = useAuthStore((state) => state.updateBaseUrl);
  const showToast = useUiStore((state) => state.showToast);

  const [theme, setTheme] = useState<ThemePreference>(appPreferences.theme);
  const [fontSize, setFontSize] = useState(String(appPreferences.fontSize));
  const [draftUrl, setDraftUrl] = useState(baseUrl);
  const [saving, setSaving] = useState(false);

  /** 偏好写库后立即应用到运行中的界面，无需重启应用 */
  function applyPreferences(next: Partial<AppPreferences>): void {
    const saved = savePreferences(next);
    applyAppearance(saved.theme, saved.fontSize);
  }

  function changeTheme(id: string): void {
    const next = id as ThemePreference;
    if (next === theme) return;
    setTheme(next);
    applyPreferences({ theme: next });
  }

  function changeFontSize(id: string): void {
    if (id === fontSize) return;
    setFontSize(id);
    applyPreferences({ fontSize: Number(id) as FontSizePreference });
  }

  async function save(): Promise<void> {
    const value = draftUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(value)) {
      showToast('服务地址需以 http:// 或 https:// 开头', 'warning');
      return;
    }
    setSaving(true);
    try {
      await updateBaseUrl(value);
      showToast('已保存 POS 服务地址');
    } catch {
      showToast('保存失败，请重试', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="系统设置" back scroll>
      <Card>
        <Text style={styles.cardTitle}>主题设置</Text>
        <TabGroup items={THEMES} active={theme} onChange={changeTheme} />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>字号设置</Text>
        <TabGroup items={FONT_SIZES} active={fontSize} onChange={changeFontSize} />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>POS 服务设置</Text>
        <TextField
          value={draftUrl}
          onChangeText={setDraftUrl}
          placeholder="http://192.168.1.10:9577"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <View style={styles.saveRow}>
          <Button title="保存" loading={saving} onPress={() => void save()} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    cardTitle: { fontSize: fs(12), fontWeight: '600', color: colors.fg, marginBottom: 2 },
    saveRow: { marginTop: 6 },
  });
}
