import React, {useCallback, useEffect, useState} from 'react';
import {
  Platform,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {PageLayout} from '@shared/components/PageLayout';
import {ConfirmModal} from '@shared/components/ConfirmModal';
import {COLORS} from '@shared/constants';
import {type NoNoMood} from '@shared/components/NoNoMascot';
import {NonoAvatar3D} from '@features/task/components/NonoAvatar3D';
import {AVATAR_PINS} from '@features/task/avatar/AvatarArtifactPins';
import {
  getActiveAvatarId,
  installPinnedAvatar,
  listAvatarLooks,
  rollbackAvatarToBuiltin,
  setActiveAvatarId,
  resolveAvatarGltfUri,
  type AvatarLookItem,
} from '@features/task/avatar/AvatarPackStore';
import {localPack} from '@features/task/avatar/LocalPack';

const REACTIONS: {mood: NoNoMood; label: string}[] = [
  {mood: 'spin', label: '转一圈'},
  {mood: 'dance', label: '开心舞'},
  {mood: 'happy', label: '开心摇摆'},
  {mood: 'wave', label: '招招手'},
  {mood: 'wink', label: '眨单眼'},
  {mood: 'surprised', label: '惊讶'},
  {mood: 'shy', label: '害羞'},
  {mood: 'laugh', label: '大笑'},
  {mood: 'stretch', label: '伸懒腰'},
  {mood: 'peek', label: '探头'},
  {mood: 'sleepy', label: '困倦'},
  {mood: 'unfold', label: '展开折翼'},
  {mood: 'fold', label: '收拢折翼'},
  {mood: 'idle', label: '呼吸待机'},
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

function pinBytes(id: string): number {
  return AVATAR_PINS.find(pin => pin.id === id)?.bytes ?? 0;
}

async function looksWithInstallState(): Promise<AvatarLookItem[]> {
  const catalog = listAvatarLooks();
  return Promise.all(
    catalog.map(async item => {
      if (item.id === 'builtin' || item.installed) {
        return item;
      }
      try {
        const files = await localPack.listFiles('avatars', item.id);
        return {...item, installed: files.includes('model.glb')};
      } catch {
        return item;
      }
    }),
  );
}

function lookStatus(
  item: AvatarLookItem,
  activeId: string,
  downloadingId: string | null,
): {label: string; tone: 'current' | 'ready' | 'muted' | 'busy'} {
  if (item.id === activeId) {
    return {label: '使用中', tone: 'current'};
  }
  if (downloadingId === item.id) {
    return {label: '下载中', tone: 'busy'};
  }
  if (item.installed) {
    return {label: '已下载', tone: 'ready'};
  }
  return {label: '未下载', tone: 'muted'};
}

export const AvatarLooksScreen: React.FC = () => {
  const androidOnly = Platform.OS !== 'android';
  const [items, setItems] = useState(() =>
    androidOnly
      ? listAvatarLooks().filter(item => item.id === 'builtin')
      : listAvatarLooks(),
  );
  const [activeId, setActiveId] = useState('builtin');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [gltfUri, setGltfUri] = useState<string | null>(null);
  const [networkType, setNetworkType] = useState('Wi-Fi');
  const [reaction, setReaction] = useState<{mood: NoNoMood; key: number}>({
    mood: 'idle',
    key: 0,
  });

  const refresh = useCallback(async () => {
    const catalog = androidOnly
      ? listAvatarLooks().filter(item => item.id === 'builtin')
      : await looksWithInstallState();
    setItems(catalog);
    const nextActive = await getActiveAvatarId();
    setActiveId(nextActive);
    const uri = androidOnly ? null : await resolveAvatarGltfUri();
    setGltfUri(uri);
  }, [androidOnly]);

  useEffect(() => {
    void refresh();
    void localPack
      .getNetworkType()
      .then(type => {
        if (type === 'wifi') {
          setNetworkType('Wi-Fi');
        } else if (type === 'cellular') {
          setNetworkType('蜂窝网络');
        }
      })
      .catch(() => undefined);
  }, [refresh]);

  const current = items.find(item => item.id === activeId) || items[0];
  const pending = items.find(item => item.id === pendingId);
  const pendingBytes = pending ? pinBytes(pending.id) : 0;

  return (
    <PageLayout title="角色外观" showBackButton>
      <Text style={styles.caption}>
        {androidOnly
          ? '当前版本换装仅支持 Android。iOS 只使用安装包内置角色。'
          : '切换首页角色。未下载的要先下到本机；失败仍用默认 3D，不走 CDN。'}
      </Text>
      <View style={styles.preview} testID="avatar-look-preview">
        <NonoAvatar3D
          mood={activeId === 'builtin' ? reaction.mood : 'idle'}
          reactionKey={activeId === 'builtin' ? reaction.key : 0}
          onPress={
            activeId === 'builtin'
              ? () =>
                  setReaction(previous => ({
                    mood: 'wink',
                    key: previous.key + 1,
                  }))
              : undefined
          }
          pressLabel="逗逗 NoNo"
          pressHint="轻点眨眼，拖动模型旋转"
          layout="preview"
          gltfUri={gltfUri}
          onGltfFailed={() => {
            void rollbackAvatarToBuiltin();
            setGltfUri(null);
            setActiveId('builtin');
          }}
          width={220}
          height={168}
          style={styles.previewStage}
        />
        <Text style={styles.previewLabel}>
          当前 · {current?.title || '默认角色'}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {activeId === 'builtin' ? (
          <View style={styles.reactions}>
            <Text style={styles.headingTitle}>逗逗 NoNo</Text>
            <Text style={styles.headingHint}>
              轻点角色眨眼，拖动看看侧面。默认上翼 95°、下翼 80°。
            </Text>
            <View style={styles.reactionButtons}>
              {REACTIONS.map(item => (
                <TouchableOpacity
                  key={item.mood}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  testID={`avatar-reaction-${item.mood}`}
                  style={styles.reactionButton}
                  onPress={() =>
                    setReaction(previous => ({
                      mood: item.mood,
                      key: previous.key + 1,
                    }))
                  }>
                  <Text style={styles.reactionText}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
        <View style={styles.heading}>
          <Text style={styles.headingTitle}>可切换角色</Text>
          <Text style={styles.headingHint}>已下载可直接用</Text>
        </View>
        {items.map(item => {
          const status = lookStatus(item, activeId, downloadingId);
          const isCurrent = item.id === activeId;
          const isDownloading = downloadingId === item.id;
          return (
            <View
              key={item.id}
              style={[styles.card, isCurrent && styles.cardActive]}
              testID={`look-card-${item.id}`}>
              <View style={styles.topline}>
                <View style={styles.copy}>
                  <Text style={styles.name}>{item.title}</Text>
                  <Text style={styles.meta}>
                    {item.id === 'builtin'
                      ? '安装包内置'
                      : `下载到本机 · ${formatBytes(pinBytes(item.id))}`}
                  </Text>
                </View>
                <View
                  style={[
                    styles.badge,
                    status.tone === 'ready' && styles.badgeReady,
                    status.tone === 'muted' && styles.badgeMuted,
                  ]}>
                  <Text
                    testID={`look-status-${item.id}`}
                    style={[
                      styles.badgeText,
                      status.tone === 'ready' && styles.badgeReadyText,
                      status.tone === 'muted' && styles.badgeMutedText,
                    ]}>
                    {status.label}
                  </Text>
                </View>
              </View>
              {isDownloading ? (
                <View style={styles.track} accessibilityLabel="下载进度">
                  <View style={[styles.trackFill, {width: `${progress}%`}]} />
                </View>
              ) : null}
              {isCurrent ? (
                <View
                  style={[styles.action, styles.actionCurrent]}
                  testID={`look-current-${item.id}`}>
                  <Text style={styles.actionCurrentText}>使用中</Text>
                </View>
              ) : item.installed ? (
                <TouchableOpacity
                  style={styles.action}
                  testID={`look-use-${item.id}`}
                  onPress={() => {
                    void setActiveAvatarId(item.id)
                      .then(() => refresh())
                      .catch(() => {
                        void rollbackAvatarToBuiltin().then(() => refresh());
                      });
                  }}>
                  <Text style={styles.actionText}>使用</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.action,
                    downloadingId ? styles.actionDisabled : undefined,
                  ]}
                  testID={`look-download-${item.id}`}
                  disabled={Boolean(downloadingId)}
                  onPress={() => setPendingId(item.id)}>
                  <Text style={styles.actionText}>下载</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
      <ConfirmModal
        visible={Boolean(pending)}
        title={pending ? `下载「${pending.title}」？` : ''}
        message={
          pending
            ? `约 ${formatBytes(
                pendingBytes,
              )}，当前网络 ${networkType}。确认后下载到本机并校验。失败仍用默认角色。`
            : ''
        }
        confirmText="确认下载"
        cancelText="取消"
        onCancel={() => setPendingId(null)}
        onConfirm={() => {
          if (!pending) {
            return;
          }
          const id = pending.id;
          setPendingId(null);
          setDownloadingId(id);
          setProgress(12);
          void installPinnedAvatar(id)
            .then(() => refresh())
            .catch(() => rollbackAvatarToBuiltin().then(() => refresh()))
            .finally(() => {
              setDownloadingId(null);
              setProgress(0);
            });
        }}
      />
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  reactions: {gap: 10, marginBottom: 18},
  reactionButtons: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  reactionButton: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 20,
    backgroundColor: '#eeefea',
  },
  reactionText: {fontSize: 13, color: '#34332e'},
  content: {
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
  caption: {
    marginHorizontal: 18,
    marginBottom: 4,
    color: COLORS.text.secondary,
    fontSize: 11,
    lineHeight: 16,
  },
  preview: {
    height: 200,
    marginBottom: 4,
    alignItems: 'center',
    backgroundColor: COLORS.pearl,
  },
  previewStage: {
    overflow: 'hidden',
  },
  previewLabel: {
    marginTop: -4,
    color: COLORS.text.secondary,
    fontSize: 11,
    textAlign: 'center',
  },
  heading: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headingTitle: {
    color: COLORS.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  headingHint: {
    color: COLORS.text.secondary,
    fontSize: 10,
  },
  card: {
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  cardActive: {
    borderColor: 'rgba(117,107,240,0.38)',
  },
  topline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  copy: {
    flex: 1,
  },
  name: {
    color: COLORS.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  meta: {
    marginTop: 4,
    color: COLORS.text.secondary,
    fontSize: 10,
    lineHeight: 14,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#e9e6ff',
  },
  badgeReady: {
    backgroundColor: '#dcf2ec',
  },
  badgeMuted: {
    backgroundColor: '#eeedf3',
  },
  badgeText: {
    color: '#5d55cb',
    fontSize: 8,
    fontWeight: '800',
  },
  badgeReadyText: {
    color: COLORS.success,
  },
  badgeMutedText: {
    color: COLORS.text.secondary,
  },
  track: {
    height: 7,
    marginTop: 12,
    overflow: 'hidden',
    borderRadius: 99,
    backgroundColor: '#eceaf6',
  },
  trackFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: COLORS.violet,
  },
  action: {
    width: '100%',
    minHeight: 44,
    marginTop: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.violet,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  actionCurrent: {
    backgroundColor: '#e9e6ff',
  },
  actionCurrentText: {
    color: '#5d55cb',
    fontSize: 13,
    fontWeight: '700',
  },
});
