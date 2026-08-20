import React, {useCallback, useState} from 'react';
import {ScrollView, View, Text, TouchableOpacity, StyleSheet, Switch} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {PageLayout} from '@shared/components/PageLayout';
import {ModelListPanel} from '@features/model/components/ModelListPanel';
import {COLORS} from '@shared/constants';
import type {AgentModeId} from '@shared/types/Model';
import {settingsService} from '@features/settings/services/SettingsService';
import {nonoConfigService} from '../services/NonoConfigService';
import {requestAdbFallbackPermission} from '../services/operatePermissions';
import {MODE_LABELS, type AgentModeState} from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const MODES: AgentModeId[] = [
  'cloud_direct',
  'cloud_split',
  'local_vision_cloud_planner',
];

const PIPELINE: Record<AgentModeId, {nodes: string[]; caption: string}> = {
  cloud_direct: {
    nodes: ['截图', '云端一体', '动作'],
    caption: '一个云端或网关模型既看屏幕，也决定下一步。',
  },
  cloud_split: {
    nodes: ['截图', '云端视觉', '云端编排', '动作'],
    caption: '视觉模型和编排模型分开。编排只拿结构化观察，不看原图。',
  },
  local_vision_cloud_planner: {
    nodes: ['截图', '本地视觉', '云端编排', '动作'],
    caption: 'MiniCPM 在手机里看截图；云端只做编排。失败不会自动改走云端视觉。',
  },
};

export const PhoneOperateScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [mode, setMode] = useState<AgentModeState | null>(null);
  const [adbFallbackEnabled, setAdbFallbackEnabled] = useState(false);

  const load = useCallback(async () => {
    const [nextMode, adbEnabled] = await Promise.all([
      nonoConfigService.getAgentMode(),
      settingsService.getADBFallbackEnabled(),
    ]);
    setMode(nextMode);
    setAdbFallbackEnabled(adbEnabled);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!mode) return null;

  const draft = mode.draftMode;
  const pipeline = PIPELINE[draft];
  const showSave = draft !== mode.activeMode;

  return (
    <PageLayout
      title="替我操作手机"
      showBackButton
      backgroundColor={COLORS.background.default}>
      <ScrollView contentContainerStyle={styles.content} stickyHeaderIndices={[0]}>
        <View style={styles.pin}>
          <View style={styles.seg}>
            {MODES.map(item => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.segBtn,
                  draft === item && styles.segBtnSelected,
                  mode.activeMode === item &&
                    draft !== item &&
                    styles.segBtnCurrent,
                ]}
                onPress={() => {
                  setMode(current =>
                    current ? {...current, draftMode: item} : current,
                  );
                  nonoConfigService.setDraftMode(item);
                }}>
                <Text
                  style={[
                    styles.segText,
                    draft === item && styles.segTextSelected,
                  ]}>
                  {MODE_LABELS[item]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.intro}>
            这里的模型只用于看屏和点应用。首页说话用设置里的陪伴模型。
          </Text>
        </View>

        <View style={styles.pipeline}>
          {pipeline.nodes.map((node, index) => (
            <React.Fragment key={node}>
              {index ? <View style={styles.pipeLine} /> : null}
              <Text
                style={[
                  styles.pipeNode,
                  node.includes('云端') && styles.pipeCloud,
                  node.includes('本地') && styles.pipeLocal,
                ]}>
                {node}
              </Text>
            </React.Fragment>
          ))}
        </View>
        <Text style={styles.caption}>{pipeline.caption}</Text>

        {draft === 'cloud_direct' ? (
          <ModelListPanel title="一体化模型" listKey="unified" />
        ) : null}
        {draft === 'cloud_split' ? (
          <>
            <ModelListPanel title="云端视觉" listKey="splitVision" />
            <ModelListPanel title="云端编排" listKey="splitPlanner" />
          </>
        ) : null}
        {draft === 'local_vision_cloud_planner' ? (
          <>
            <View style={styles.heading}>
              <Text style={styles.headingTitle}>本地视觉</Text>
              <Text style={styles.headingHint}>无 API Key</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.topline}>
                <View>
                  <Text style={styles.title}>MiniCPM-V 4.6</Text>
                  <Text style={styles.body}>约 1.64 GB · 截图不离机</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>待下载</Text>
                </View>
              </View>
              <Text style={styles.body}>
                本机运行时尚未接通。当前任务仍走云端一体里已选中的模型。
              </Text>
            </View>
            <ModelListPanel title="云端编排" listKey="localPlanner" />
          </>
        ) : null}

        {draft === 'cloud_direct' ? (
          <TouchableOpacity
            style={styles.guide}
            onPress={() => navigation.navigate('APIKeyGuide')}>
            <Text style={styles.guideText}>API Key 获取指南</Text>
            <Text style={styles.guideChevron}>›</Text>
          </TouchableOpacity>
        ) : null}

        {showSave ? (
          <View style={styles.save}>
            <Text style={styles.caption}>保存后从下一次任务生效</Text>
            <TouchableOpacity
              style={styles.primary}
              onPress={async () => {
                const next = await nonoConfigService.saveActiveMode(draft);
                setMode(next);
              }}>
              <Text style={styles.primaryText}>使用此模式</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.heading}>
          <Text style={styles.headingTitle}>兜底</Text>
          <Text style={styles.headingHint}>无障碍失败时</Text>
        </View>
        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <Text style={styles.title}>ADB 兜底</Text>
            <Text style={styles.body}>
              仅在明确开启且设备可用时尝试。打开时才检查 ADB 权限。
            </Text>
          </View>
          <Switch
            value={adbFallbackEnabled}
            onValueChange={value => {
              setAdbFallbackEnabled(value);
              void (async () => {
                if (value) {
                  const allowed = await requestAdbFallbackPermission();
                  if (!allowed) {
                    setAdbFallbackEnabled(false);
                    return;
                  }
                }
                await settingsService.setADBFallbackEnabled(value);
              })();
            }}
            trackColor={{false: '#d8d7df', true: COLORS.violet}}
            thumbColor="#ffffff"
          />
        </View>
      </ScrollView>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
  pin: {
    paddingBottom: 12,
    backgroundColor: COLORS.background.default,
  },
  seg: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  segBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnSelected: {
    backgroundColor: COLORS.violet,
  },
  segBtnCurrent: {
    borderWidth: 1.5,
    borderColor: 'rgba(117,107,240,0.4)',
  },
  segText: {
    color: '#5d6070',
    fontSize: 12,
    fontWeight: '700',
  },
  segTextSelected: {
    color: '#ffffff',
  },
  intro: {
    marginTop: 12,
    color: COLORS.text.secondary,
    fontSize: 11,
    lineHeight: 16,
  },
  pipeline: {
    marginTop: 6,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pipeNode: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    color: COLORS.text.secondary,
    backgroundColor: '#eceaf6',
    fontSize: 10,
    fontWeight: '700',
  },
  pipeCloud: {
    color: '#ffffff',
    backgroundColor: COLORS.violet,
  },
  pipeLocal: {
    color: '#1d3f3a',
    backgroundColor: COLORS.mint,
  },
  pipeLine: {
    flex: 1,
    height: 2,
    minWidth: 8,
    backgroundColor: '#d8d5ea',
  },
  caption: {
    marginBottom: 16,
    color: COLORS.text.secondary,
    fontSize: 11,
    lineHeight: 16,
  },
  heading: {
    marginBottom: 12,
    flexDirection: 'row',
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
    marginBottom: 16,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  topline: {
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: COLORS.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  body: {
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
    alignSelf: 'flex-start',
  },
  badgeText: {
    color: '#5d55cb',
    fontSize: 8,
    fontWeight: '800',
  },
  guide: {
    minHeight: 62,
    marginTop: 8,
    paddingHorizontal: 15,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.84)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guideText: {
    color: COLORS.text.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  guideChevron: {
    color: '#9a9ca7',
    fontSize: 18,
  },
  save: {
    marginTop: 12,
    marginBottom: 24,
  },
  primary: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.violet,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  toggleRow: {
    minHeight: 64,
    marginBottom: 10,
    padding: 15,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  toggleCopy: {
    flex: 1,
    paddingRight: 12,
  },
});
