import React, {useCallback, useState} from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {PageLayout} from '@shared/components/PageLayout';
import {COLORS} from '@shared/constants';
import {SettingToggle} from '../components/CapabilityCards';
import {useAppFacades} from '../../../application/facades/AppFacadesContext';
import type {PrivacyViewState} from '../../../application/facades/UiRuntimeContracts';

const LOADING_STATE: PrivacyViewState = {
  status: 'loading',
  memoryEnabled: false,
  memoryLocation: 'device',
  canUseVisualAgentMemory: false,
  channels: [],
  persistedDiagnosticFields: [],
};

const ERROR_STATE: PrivacyViewState = {
  status: 'error',
  memoryEnabled: false,
  memoryLocation: 'device',
  canUseVisualAgentMemory: false,
  channels: [],
  persistedDiagnosticFields: [],
  errorMessage: '暂时读不到隐私设置',
};

export const PrivacyScreen: React.FC = () => {
  const {privacy} = useAppFacades();
  const [viewState, setViewState] = useState<PrivacyViewState | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setViewState(current => current ?? LOADING_STATE);
      privacy
        .getViewState()
        .then(next => active && setViewState(next))
        .catch(() => active && setViewState(ERROR_STATE));
      return () => {
        active = false;
      };
    }, [privacy]),
  );

  const state = viewState ?? LOADING_STATE;

  const setMemoryEnabled = (value: boolean) => {
    setViewState(current => (current ? {...current, memoryEnabled: value} : current));
    void privacy
      .setMemoryEnabled(value)
      .then(setViewState)
      .catch(() => setViewState(ERROR_STATE));
  };

  const setLocation = (location: PrivacyViewState['memoryLocation']) => {
    void privacy
      .setMemoryLocation(location)
      .then(setViewState)
      .catch(() => setViewState(ERROR_STATE));
  };

  if (state.status === 'error') {
    return (
      <PageLayout title="隐私" showBackButton>
        <View style={styles.content}>
          <Text style={styles.heading}>暂时读不到隐私设置</Text>
        </View>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="隐私" showBackButton>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingToggle
          title="记忆"
          body="称呼和偏好。交代的事是另一项能力，不在这里关。"
          value={state.memoryEnabled}
          onValueChange={setMemoryEnabled}
        />
        <Text style={styles.heading}>记忆存在哪</Text>
        <View style={styles.seg}>
          <TouchableOpacity
            style={[
              styles.segBtn,
              state.memoryLocation === 'device' && styles.segBtnOn,
            ]}
            onPress={() => setLocation('device')}>
            <Text
              style={[
                styles.segText,
                state.memoryLocation === 'device' && styles.segTextOn,
              ]}>
              仅这台手机
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!state.canUseVisualAgentMemory}
            style={[
              styles.segBtn,
              state.memoryLocation === 'visual_agent' && styles.segBtnOn,
              !state.canUseVisualAgentMemory && styles.segBtnDisabled,
            ]}
            onPress={() => setLocation('visual_agent')}>
            <Text
              style={[
                styles.segText,
                state.memoryLocation === 'visual_agent' && styles.segTextOn,
                !state.canUseVisualAgentMemory && styles.segTextDisabled,
              ]}>
              随视觉工具
            </Text>
          </TouchableOpacity>
        </View>
        {!state.canUseVisualAgentMemory ? (
          <Text style={styles.caption}>
            当前视觉工具连接不支持记忆，或未选择支持记忆的连接。
          </Text>
        ) : null}

        <Text style={styles.heading}>数据去哪</Text>
        {state.channels.map(channel => (
          <View key={channel.id} style={styles.card}>
            <Text style={styles.title}>{channel.destinationLabel}</Text>
            <Text style={styles.body}>{channel.fields.join('、')}</Text>
          </View>
        ))}

        <View style={styles.card}>
          <Text style={styles.title}>诊断会保留</Text>
          <Text style={styles.body}>
            {state.persistedDiagnosticFields.length > 0
              ? state.persistedDiagnosticFields.join('、')
              : '不保留诊断字段'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.danger}
          onPress={() =>
            Alert.alert('忘掉全部称呼和偏好？', '交代的事不会被清掉。', [
              {text: '取消', style: 'cancel'},
              {
                text: '确认忘掉',
                style: 'destructive',
                onPress: () =>
                  void privacy
                    .forgetAllPreferences()
                    .then(setViewState)
                    .catch(() => setViewState(ERROR_STATE)),
              },
            ])
          }>
          <Text style={styles.dangerText}>忘掉全部称呼和偏好</Text>
        </TouchableOpacity>
      </ScrollView>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
  heading: {
    marginTop: 8,
    marginBottom: 10,
    color: COLORS.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  caption: {
    marginBottom: 16,
    color: COLORS.text.secondary,
    fontSize: 11,
    lineHeight: 16,
  },
  seg: {
    marginBottom: 8,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  segBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnOn: {
    backgroundColor: COLORS.violet,
  },
  segBtnDisabled: {
    opacity: 0.5,
  },
  segText: {
    color: '#5d6070',
    fontSize: 12,
    fontWeight: '700',
  },
  segTextOn: {
    color: '#ffffff',
  },
  segTextDisabled: {
    color: '#9a9ca7',
  },
  card: {
    padding: 15,
    marginBottom: 10,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
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
  danger: {
    minHeight: 52,
    marginTop: 8,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff0ec',
  },
  dangerText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '700',
  },
});
