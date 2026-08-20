import React, {useEffect, useState} from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {PageLayout} from '@shared/components/PageLayout';
import {ConfirmModal} from '@shared/components/ConfirmModal';
import {COLORS} from '@shared/constants';
import {NonoAvatar3D} from '@features/task/components/NonoAvatar3D';
import {
  getActiveAvatarLook,
  installAvatarLook,
  listAvatarLooks,
  selectAvatarLook,
  type AvatarLook,
} from '@features/task/avatar/avatarLooksDemo';

function lookStatus(
  item: AvatarLook,
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
  const [items, setItems] = useState(listAvatarLooks);
  const [activeId, setActiveId] = useState(getActiveAvatarLook().id);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const refresh = () => {
    setItems(listAvatarLooks());
    setActiveId(getActiveAvatarLook().id);
  };

  useEffect(() => {
    if (!downloadingId) {
      return;
    }
    const id = downloadingId;
    setProgress(8);
    const timer = setInterval(() => {
      setProgress(current => {
        const next = Math.min(100, current + 14);
        if (next >= 100) {
          clearInterval(timer);
          installAvatarLook(id);
          setDownloadingId(null);
          refresh();
        }
        return next;
      });
    }, 140);
    return () => clearInterval(timer);
  }, [downloadingId]);

  const current = items.find(item => item.id === activeId) || items[0];
  const pending = items.find(item => item.id === pendingId);

  return (
    <PageLayout title="角色外观" showBackButton>
      <Text style={styles.caption}>
        切换首页角色。未下载的要先下到本机；失败仍用默认 3D，不走 CDN。
      </Text>
      <View style={styles.preview} testID="avatar-look-preview">
        <NonoAvatar3D
          mood="idle"
          layout="preview"
          skinId={current.id}
          width={220}
          height={168}
          style={styles.previewStage}
        />
        <Text style={styles.previewLabel}>当前 · {current.title}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
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
                    {item.bundled ? '安装包内置' : '下载到本机'} · {item.sizeLabel}
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
                    selectAvatarLook(item.id);
                    refresh();
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
            ? `约 ${pending.sizeLabel}，当前按 Wi-Fi 演示。确认后只走页面进度，不会访问真实网络。失败仍用默认角色。`
            : ''
        }
        confirmText="确认下载"
        cancelText="取消"
        onCancel={() => setPendingId(null)}
        onConfirm={() => {
          if (!pending) {
            return;
          }
          setPendingId(null);
          setDownloadingId(pending.id);
        }}
      />
    </PageLayout>
  );
};

const styles = StyleSheet.create({
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
