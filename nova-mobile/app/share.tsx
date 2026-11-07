import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button, Empty, Screen, TabGroup } from '@/src/components/ui';
import { useUiStore } from '@/src/stores/ui';
import { useShareStore, listRemoteFiles, downloadRemoteFile } from '@/src/lib/share/store';
import { pickAndAddToShare, deleteShareFile, shareFile } from '@/src/lib/share/files';
import type { Peer, ShareFileInfo } from '@/src/lib/share/relay-client';
import { themedStyles } from '@/src/theme/styles';
import { colors, fs, useThemeRevision } from '@/src/theme/tokens';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ShareScreen() {
  useThemeRevision();
  const showToast = useUiStore((state) => state.showToast);
  const status = useShareStore((state) => state.status);
  const localFiles = useShareStore((state) => state.localFiles);
  const refreshLocal = useShareStore((state) => state.refreshLocal);

  const [tab, setTab] = useState<'devices' | 'local'>('devices');
  const [activeDevice, setActiveDevice] = useState<Peer | null>(null);
  const [remoteFiles, setRemoteFiles] = useState<ShareFileInfo[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    void refreshLocal();
  }, [refreshLocal]);

  async function enterDevice(peer: Peer) {
    setActiveDevice(peer);
    setRemoteLoading(true);
    setRemoteFiles([]);
    try {
      const files = await listRemoteFiles(peer.deviceId);
      setRemoteFiles(files);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '获取文件列表失败', 'error');
    } finally {
      setRemoteLoading(false);
    }
  }

  async function handleDownload(peer: Peer, name: string) {
    setDownloading(name);
    try {
      const uri = await downloadRemoteFile(peer.deviceId, name);
      showToast(`已下载：${name}`);
      if (uri) await shareFile(uri);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '下载失败', 'error');
    } finally {
      setDownloading(null);
    }
  }

  async function handleUpload() {
    try {
      const name = await pickAndAddToShare();
      if (name) {
        showToast(`已添加到共享目录：${name}`);
        void refreshLocal();
      }
    } catch {
      showToast('上传失败', 'error');
    }
  }

  function handleDelete(name: string) {
    try {
      deleteShareFile(name);
      showToast(`已删除：${name}`);
      void refreshLocal();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '删除失败', 'error');
    }
  }

  return (
    <Screen title="文件共享" back>
      <View style={styles.statusBar}>
        <View style={styles.statusDot}>
          <View style={[styles.dot, { backgroundColor: status.connected ? colors.success : colors.faint }]} />
          <Text style={styles.statusText}>
            中继{status.connected ? '已连接' : '未连接'}
            {status.lastError ? `（${status.lastError}）` : ''}
          </Text>
        </View>
        <Text style={styles.statusCount}>同组设备 {status.peers.length}</Text>
      </View>

      <TabGroup
        items={[
          { id: 'devices', label: '设备列表' },
          { id: 'local', label: '本机共享' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as 'devices' | 'local')}
      />

      {tab === 'devices' ? (
        activeDevice ? (
          <ScrollView style={styles.body}>
            <Pressable style={styles.backRow} onPress={() => setActiveDevice(null)}>
              <Ionicons name="chevron-back" size={16} color={colors.muted} />
              <Text style={styles.backText}>返回设备列表</Text>
            </Pressable>
            <Text style={styles.deviceTitle}>{activeDevice.name} 的共享文件</Text>
            {remoteLoading ? (
              <Text style={styles.loading}>加载中…</Text>
            ) : remoteFiles.length === 0 ? (
              <Empty text="该设备暂无共享文件" />
            ) : (
              <View style={styles.fileList}>
                {remoteFiles.map((f) => (
                  <View key={f.name} style={styles.fileRow}>
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName}>{f.name}</Text>
                      <Text style={styles.fileMeta}>
                        {formatBytes(f.size)} · {formatTime(f.mtime)}
                      </Text>
                    </View>
                    <Button
                      title={downloading === f.name ? '下载中' : '下载'}
                      variant="secondary"
                      disabled={downloading === f.name}
                      onPress={() => handleDownload(activeDevice, f.name)}
                    />
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        ) : status.peers.length === 0 ? (
          <Empty text="暂无其他设备" />
        ) : (
          <ScrollView style={styles.body}>
            <View style={styles.deviceGrid}>
              {status.peers.map((peer) => (
                <Pressable
                  key={peer.deviceId}
                  style={[styles.deviceCard, !peer.online && styles.deviceOffline]}
                  onPress={() => peer.online && enterDevice(peer)}
                  disabled={!peer.online}
                >
                  <Ionicons
                    name={peer.role === 'desktop' ? 'desktop-outline' : 'phone-portrait-outline'}
                    size={22}
                    color={peer.online ? colors.brand : colors.faint}
                  />
                  <Text style={styles.deviceName} numberOfLines={1}>
                    {peer.name}
                  </Text>
                  <Text style={styles.deviceRole}>{peer.role === 'desktop' ? '桌面端' : '手机端'}</Text>
                  <View
                    style={[styles.onlineDot, { backgroundColor: peer.online ? colors.success : colors.faint }]}
                  />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )
      ) : (
        <ScrollView style={styles.body}>
          <View style={styles.localHeader}>
            <Text style={styles.localHint}>共享目录：App 沙盒 /sharefiles</Text>
            <Button title="上传文件" onPress={handleUpload} />
          </View>
          {localFiles.length === 0 ? (
            <Empty text="本机暂无共享文件" />
          ) : (
            <View style={styles.fileList}>
              {localFiles.map((f) => (
                <View key={f.name} style={styles.fileRow}>
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName}>{f.name}</Text>
                    <Text style={styles.fileMeta}>
                      {formatBytes(f.size)} · {formatTime(f.mtime)}
                    </Text>
                  </View>
                  <Pressable onPress={() => handleDelete(f.name)} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = themedStyles(createStyles);

function createStyles() {
  return StyleSheet.create({
    statusBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    statusDot: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: fs(12), color: colors.muted },
    statusCount: { fontSize: fs(12), color: colors.muted },

    body: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

    backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    backText: { fontSize: fs(13), color: colors.muted, marginLeft: 2 },
    deviceTitle: { fontSize: fs(15), fontWeight: '600', color: colors.fg, marginBottom: 12 },

    deviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    deviceCard: {
      width: '48%',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      alignItems: 'center',
      gap: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.divider,
    },
    deviceOffline: { opacity: 0.5 },
    deviceName: { fontSize: fs(13), fontWeight: '500', color: colors.fg, textAlign: 'center' },
    deviceRole: { fontSize: fs(11), color: colors.muted },
    onlineDot: { width: 8, height: 8, borderRadius: 4, marginTop: 2 },

    localHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    localHint: { fontSize: fs(12), color: colors.muted },

    fileList: { gap: 8 },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.divider,
    },
    fileInfo: { flex: 1, marginRight: 8 },
    fileName: { fontSize: fs(13), color: colors.fg, fontWeight: '500' },
    fileMeta: { fontSize: fs(11), color: colors.muted, marginTop: 2 },
    deleteBtn: { padding: 8 },
    loading: { textAlign: 'center', color: colors.muted, marginTop: 24, fontSize: fs(13) },
  });
}
