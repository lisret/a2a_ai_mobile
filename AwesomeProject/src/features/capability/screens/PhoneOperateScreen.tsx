import React, {useCallback, useState} from 'react';
import {ScrollView, View, Text, TouchableOpacity, StyleSheet, Switch} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {PageLayout} from '@shared/components/PageLayout';
import {COLORS} from '@shared/constants';
import type {AgentModeId} from '@shared/types/Model';
import {useAppFacades} from '../../../application/facades/AppFacadesContext';
import type {PhoneOperateViewState} from '../../../application/facades/UiRuntimeContracts';
import {requestAdbFallbackPermission} from '../services/operatePermissions';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const MODES: AgentModeId[] = [
  'cloud_direct',
  'cloud_split',
  'local_vision_cloud_planner',
];

export const PhoneOperateScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const {phoneOperate} = useAppFacades();
  const [viewState, setViewState] = useState<PhoneOperateViewState | null>(null);
  const [adbFallbackEnabled, setAdbFallbackEnabled] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      phoneOperate.getViewState().then(next => {
        if (active) {
          setViewState(next);
          setAdbFallbackEnabled(next.adbFallbackEnabled);
        }
      });
      return () => {
        active = false;
      };
    }, [phoneOperate]),
  );

  if (!viewState) {
    return null;
  }

  const draft = viewState.draftMode;
  const option = viewState.modes[draft];
  const runnable = option.runnable;
  const showSave = draft !== viewState.activeMode;

  const selectMode = async (mode: AgentModeId) => {
    setViewState(await phoneOperate.selectDraftMode(mode));
  };

  const activate = async () => {
    if (!option.runnable) {
      return;
    }
    setViewState(await phoneOperate.activateDraftMode(viewState.revision));
  };

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
                testID={`mode-${item}`}
                style={[
                  styles.segBtn,
                  draft === item && styles.segBtnSelected,
                  viewState.activeMode === item &&
                    draft !== item &&
                    styles.segBtnCurrent,
                ]}
                onPress={() => selectMode(item)}>
                <Text
                  style={[
                    styles.segText,
                    draft === item && styles.segTextSelected,
                  ]}>
                  {viewState.modes[item].label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.intro}>
            这里的模型只用于看屏和点应用。首页说话用设置里的陪伴模型。
          </Text>
        </View>

        <View style={styles.pipeline}>
          {option.nodes.map((node, index) => (
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
        <Text style={styles.caption}>{option.caption}</Text>

        {option.blockers.length > 0 ? (
          <View style={styles.blockers}>
            {option.blockers.map(blocker => (
              <View key={blocker.code} style={styles.blockerRow}>
                <Text style={styles.blockerText}>{blocker.message}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.guide}
          onPress={() => navigation.navigate('APIKeyGuide')}>
          <Text style={styles.guideText}>API Key 获取指南</Text>
          <Text style={styles.guideChevron}>›</Text>
        </TouchableOpacity>

        {showSave ? (
          <Text style={styles.caption}>保存后从下一次任务生效</Text>
        ) : null}
        <TouchableOpacity
          testID="activate-operate-mode"
          style={[styles.primary, !runnable && styles.primaryDisabled]}
          disabled={!runnable}
          accessibilityState={{disabled: !runnable}}
          onPress={activate}>
          <Text style={styles.primaryText}>使用此模式</Text>
        </TouchableOpacity>

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
                setViewState(await phoneOperate.setAdbFallbackEnabled(value));
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
  blockers: {
    marginBottom: 16,
    gap: 8,
  },
  blockerRow: {
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 15,
    backgroundColor: '#fff0ec',
  },
  blockerText: {
    color: COLORS.error,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  heading: {
    marginTop: 8,
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
  primary: {
    minHeight: 52,
    marginTop: 12,
    marginBottom: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.violet,
  },
  primaryDisabled: {
    backgroundColor: '#c9c6dd',
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
