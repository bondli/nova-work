import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lookupProduct } from '@/src/lib/pos';
import type { InventoryRow } from '@/src/lib/types';
import { APP_VERSION } from '@/src/lib/version';
import { useAuthStore } from '@/src/stores/auth';
import { useCartStore } from '@/src/stores/cart';
import { useUiStore } from '@/src/stores/ui';
import { colors, fs, useThemeRevision } from '@/src/theme/tokens';
import { themedStyles } from '@/src/theme/styles';
import { AppDialog, Button, MemberAvatar, SheetModal } from './ui';
import { ToastHost } from './toast';

/** 全局浮层：我的抽屉 / 扫码 / Toast */
export function GlobalOverlays() {
  useThemeRevision();
  return (
    <>
      <ProfileSheet />
      <ScanOverlay />
      <ToastHost />
    </>
  );
}

/* ------------------------------------------------------------------ 我的 */

function ProfileSheet() {
  const open = useUiStore((state) => state.profileOpen);
  const close = useUiStore((state) => state.closeProfile);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const role = user?.role === 'admin' ? '管理员' : '导购员';
  const [confirming, setConfirming] = useState(false);

  function doLogout(): void {
    setConfirming(false);
    void logout().then(() => {
      close();
      router.replace('/login');
    });
  }

  return (
    <>
      <SheetModal visible={open} title="我的" onClose={close}>
        <View style={styles.profileHead}>
          <MemberAvatar kind="platform" size={44} />
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{user?.realName || user?.name || '未登录'}</Text>
            <Text style={styles.profileSub}>
              {role} · Dave &amp; Bella
            </Text>
          </View>
        </View>

        <View style={styles.profileMenu}>
          <Pressable
            style={styles.menuRow}
            onPress={() => {
              close();
              router.push('/settings');
            }}
          >
            <Ionicons name="settings-outline" size={16} color={colors.muted} />
            <Text style={styles.menuText}>系统设置</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.faint} />
          </Pressable>
          <Pressable
            style={styles.menuRow}
            onPress={() => {
              close();
              router.push('/logs');
            }}
          >
            <Ionicons name="document-text-outline" size={16} color={colors.muted} />
            <Text style={styles.menuText}>操作日志</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.faint} />
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => setConfirming(true)}>
            <Ionicons name="log-out-outline" size={16} color={colors.danger} />
            <Text style={[styles.menuText, { color: colors.danger }]}>退出登录</Text>
            <View style={styles.menuSpacer} />
          </Pressable>
        </View>

        <Text style={styles.version}>DaveBella {APP_VERSION} · Android</Text>
      </SheetModal>

      <AppDialog visible={confirming} onClose={() => setConfirming(false)}>
        <Text style={styles.dialogTitle}>退出登录</Text>
        <Text style={styles.dialogBody}>确认退出当前账号？</Text>
        <View style={styles.dialogActions}>
          <View style={styles.dialogActionItem}>
            <Button title="取消" variant="secondary" onPress={() => setConfirming(false)} />
          </View>
          <View style={styles.dialogActionItem}>
            <Button title="退出" variant="danger" onPress={doLogout} />
          </View>
        </View>
      </AppDialog>
    </>
  );
}

/* ------------------------------------------------------------------ 扫码 */

interface ScanResult {
  barcode: string;
  product: InventoryRow | null;
  failed: boolean;
}

function ScanOverlay() {
  const insets = useSafeAreaInsets();
  const open = useUiStore((state) => state.scanOpen);
  const close = useUiStore((state) => state.closeScan);
  const setInventoryKeyword = useUiStore((state) => state.setInventoryKeyword);
  const showToast = useUiStore((state) => state.showToast);
  const addProduct = useCartStore((state) => state.addProduct);

  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [line] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!open) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(line, {
          toValue: 1,
          duration: 1600,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(line, {
          toValue: 0,
          duration: 1600,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [open, line]);

  function dismiss(): void {
    setHandled(false);
    setResult(null);
    setBusy(false);
    close();
  }

  async function acceptBarcode(data: string): Promise<void> {
    if (handled) return;
    setHandled(true);
    const codeHandler = useUiStore.getState().scanCodeHandler;
    if (codeHandler) {
      codeHandler(data);
      dismiss();
      return;
    }
    setBusy(true);
    let product: InventoryRow | null = null;
    let failed = false;
    try {
      product = await lookupProduct(data);
    } catch {
      failed = true;
    }
    setBusy(false);
    setResult({ barcode: data, product, failed });
  }

  function goInventory(): void {
    if (!result) return;
    setInventoryKeyword(result.barcode);
    dismiss();
    router.push('/(tabs)/inventory');
  }

  function addToCart(): void {
    if (!result) return;
    if (!result.product) {
      showToast('未查询到该条码', 'error');
      return;
    }
    addProduct(result.product);
    dismiss();
    router.push('/(tabs)/buy');
    showToast(`已加入买单：${result.product.name}`);
  }

  return (
    <Modal visible={open} animationType="fade" transparent={false} onRequestClose={dismiss}>
      <View style={[styles.scanner, { paddingTop: insets.top }]}>
        <View style={styles.scannerBar}>
          <Pressable onPress={dismiss} style={styles.scannerClose} accessibilityLabel="关闭扫码">
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
          <Text style={styles.scannerTitle}>扫描商品条码</Text>
          <View style={styles.scannerClose} />
        </View>

        {result ? (
          <View style={styles.scanResultWrap}>
            <View style={styles.scanResult}>
              <View style={styles.scanResultIcon}>
                <Ionicons name="barcode-outline" size={22} color={colors.brand} />
              </View>
              <Text style={styles.scanResultTitle}>已识别条码</Text>
              <Text style={styles.scanResultBarcode}>{result.barcode}</Text>
              {result.product ? (
                <Text style={styles.scanResultName} numberOfLines={2}>
                  {result.product.name}
                  {[result.product.color, result.product.size].filter(Boolean).length > 0
                    ? ` · ${[result.product.color, result.product.size].filter(Boolean).join(' / ')}`
                    : ''}
                </Text>
              ) : null}
              <View style={styles.scanActions}>
                <View style={styles.scanActionItem}>
                  <Button title="查询库存" variant="secondary" onPress={goInventory} />
                </View>
                <View style={styles.scanActionItem}>
                  <Button title="加入买单" onPress={addToCart} />
                </View>
              </View>
              <Pressable onPress={dismiss} style={styles.scanCancel}>
                <Text style={styles.scanCancelText}>取消</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.scanCenter}>
              {permission?.granted ? (
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39'] }}
                  onBarcodeScanned={handled ? undefined : ({ data }) => void acceptBarcode(data)}
                />
              ) : null}

              <View pointerEvents="none" style={styles.scanShade}>
                <View style={styles.scanFrame}>
                  <View style={[styles.corner, styles.cornerTopLeft]} />
                  <View style={[styles.corner, styles.cornerTopRight]} />
                  <View style={[styles.corner, styles.cornerBottomLeft]} />
                  <View style={[styles.corner, styles.cornerBottomRight]} />
                  <Animated.View
                    style={[
                      styles.scanLine,
                      {
                        transform: [
                          {
                            translateY: line.interpolate({ inputRange: [0, 1], outputRange: [12, 200] }),
                          },
                        ],
                      },
                    ]}
                  />
                </View>
                <Text style={styles.scanHint}>
                  {busy ? '正在识别…' : '将商品条码放入框内，自动识别'}
                </Text>
              </View>
            </View>

            {permission && !permission.granted ? (
              <View style={styles.permission}>
                <Text style={styles.permissionText}>需要相机权限才能扫码</Text>
                <Button title="授权相机" onPress={() => void requestPermission()} />
              </View>
            ) : null}
          </>
        )}
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Toast */

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    profileHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4, paddingBottom: 8 },
    profileText: { flex: 1 },
    profileName: { fontSize: fs(15), fontWeight: '600', color: colors.fg },
    profileSub: { fontSize: fs(11), color: colors.muted, marginTop: 2 },

    profileMenu: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    menuText: { flex: 1, fontSize: fs(13), color: colors.fg },
    menuSpacer: { width: 15 },
    version: { marginTop: 12, textAlign: 'center', fontSize: fs(10), color: colors.faint },

    dialogTitle: { fontSize: fs(15), fontWeight: '600', color: colors.fg },
    dialogBody: { marginTop: 8, fontSize: fs(12), lineHeight: fs(18), color: colors.muted },
    dialogActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
    dialogActionItem: { flex: 1 },

    scanner: { flex: 1, backgroundColor: '#0b0b0f' },
    scannerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
      backgroundColor: '#0b0b0f',
      zIndex: 2,
    },
    scannerClose: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    scannerTitle: { fontSize: fs(14), fontWeight: '500', color: '#fff' },
    scanCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    camera: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    scanShade: { alignItems: 'center', gap: 24 },
    scanFrame: { width: 220, height: 220, position: 'relative' },
    corner: { position: 'absolute', width: 26, height: 26, borderColor: '#fff', borderWidth: 3 },
    cornerTopLeft: { left: 0, top: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
    cornerTopRight: { right: 0, top: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
    cornerBottomLeft: { left: 0, bottom: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
    cornerBottomRight: { right: 0, bottom: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
    scanLine: {
      position: 'absolute',
      left: 8,
      right: 8,
      top: 0,
      height: 2,
      backgroundColor: colors.brand,
      shadowColor: colors.brand,
      shadowOpacity: 0.9,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
    },
    scanHint: { fontSize: fs(12), color: 'rgba(255,255,255,0.7)' },
    permission: { paddingBottom: 64, alignItems: 'center', gap: 12 },
    permissionText: { fontSize: fs(12), color: 'rgba(255,255,255,0.7)' },

    scanResultWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    scanResult: { width: '100%', backgroundColor: '#fff', borderRadius: 18, padding: 18, alignItems: 'center' },
    scanResultIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brandSoft,
    },
    scanResultTitle: { fontSize: fs(14), fontWeight: '600', color: colors.fg, marginTop: 8 },
    scanResultBarcode: {
      fontSize: fs(13),
      color: '#52525b',
      marginTop: 4,
      fontVariant: ['tabular-nums'],
    },
    scanResultName: { fontSize: fs(12), color: colors.muted, marginTop: 8, textAlign: 'center' },
    scanActions: { flexDirection: 'row', gap: 8, marginTop: 16, alignSelf: 'stretch' },
    scanActionItem: { flex: 1 },
    scanCancel: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 16 },
    scanCancelText: { fontSize: fs(12), color: colors.muted },
  });
}
