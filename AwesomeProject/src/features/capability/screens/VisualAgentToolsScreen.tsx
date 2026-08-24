import React, {useCallback, useMemo, useState} from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import {useFocusEffect, useRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import type {RootStackParamList} from '@shared/types/navigation';
import {PageLayout} from '@shared/components/PageLayout';
import {COLORS} from '@shared/constants';
import type {VisualAgentCapabilitySet, VisualAgentToolId} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import {useAppFacades} from '../../../application/facades/AppFacadesContext';
import type {
  BuiltInVisualAgentToolId,
  CredentialEditIntent,
  VisualAgentMaturity,
  VisualAgentProfileDraftInput,
  VisualAgentProfileViewState,
  VisualAgentReadiness,
  VisualAgentToolOptionViewState,
  VisualAgentToolsViewState,
} from '../../../application/facades/UiRuntimeContracts';

// Home for every visual-agent tool. It renders exactly one
// `VisualAgentToolsViewState`: the five canonical built-in adapters, any
// accepted `custom:*` adapters, and the saved profiles. Every displayed value
// and every enabled control is derived from that view state; there is no
// per-tool special-casing and no OpenClaw-only branch.

type ScreenRoute = RouteProp<RootStackParamList, 'VisualAgentTools'>;

const LOADING_STATE: VisualAgentToolsViewState = {
  status: 'loading',
  revision: 0,
  enabled: false,
  adapters: [],
  profiles: [],
  canOperate: false,
};

const ERROR_STATE: VisualAgentToolsViewState = {
  status: 'error',
  revision: 0,
  enabled: false,
  adapters: [],
  profiles: [],
  canOperate: false,
  errorMessage: '暂时读不到视觉工具配置',
};

const CAPABILITY_LABELS: readonly {
  key: keyof VisualAgentCapabilitySet;
  label: string;
}[] = [
  {key: 'imageInput', label: '看图'},
  {key: 'structuredAction', label: '结构化动作'},
  {key: 'stream', label: '流式'},
  {key: 'cancel', label: '取消'},
  {key: 'approval', label: '审批'},
  {key: 'resume', label: '续跑'},
  {key: 'steer', label: '干预'},
  {key: 'preferences', label: '记偏好'},
];

const READINESS_LABELS: Record<VisualAgentReadiness, string> = {
  not_configured: '未配置',
  connecting: '连接中',
  ready: '已就绪',
  disconnected: '已断开',
  unsupported: '不支持',
  error: '出错',
};

const MATURITY_LABELS: Record<VisualAgentMaturity, string> = {
  stable: '稳定',
  beta: '测试',
  experimental: '实验',
};

const ALL_CAPS_TRUE: VisualAgentCapabilitySet = {
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
};

interface DraftState {
  profileId?: string;
  toolId: VisualAgentToolId;
  enabled: boolean;
  bridgeUrl: string;
  bindingId: string;
  requestedCapabilities: VisualAgentCapabilitySet;
  credential: CredentialEditIntent;
  secretInput: string;
}

export interface VisualAgentToolsScreenProps {
  initialPreset?: BuiltInVisualAgentToolId;
}

export const VisualAgentToolsScreen: React.FC<VisualAgentToolsScreenProps> = ({
  initialPreset,
}) => {
  const {visualAgentTools} = useAppFacades();
  const route = useRoute<ScreenRoute>();
  const preset = initialPreset ?? route.params?.initialPreset;

  const [viewState, setViewState] =
    useState<VisualAgentToolsViewState | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setViewState(current => current ?? LOADING_STATE);
      visualAgentTools
        .getViewState()
        .then(next => active && setViewState(next))
        .catch(() => active && setViewState(ERROR_STATE));
      return () => {
        active = false;
      };
    }, [visualAgentTools]),
  );

  const adapterFor = useCallback(
    (toolId: VisualAgentToolId): VisualAgentToolOptionViewState | undefined =>
      viewState?.adapters.find(item => item.toolId === toolId),
    [viewState],
  );

  const openAddDraft = useCallback(() => {
    if (!viewState) {
      return;
    }
    const defaultTool: VisualAgentToolId =
      preset ?? viewState.adapters[0]?.toolId ?? 'openclaw';
    const adapter = viewState.adapters.find(
      item => item.toolId === defaultTool,
    );
    setDraft({
      toolId: defaultTool,
      enabled: true,
      bridgeUrl: '',
      bindingId: '',
      requestedCapabilities: {...(adapter?.capabilities ?? ALL_CAPS_TRUE)},
      credential: {action: 'replace', plaintext: ''},
      secretInput: '',
    });
  }, [viewState, preset]);

  const openEditDraft = useCallback((profile: VisualAgentProfileViewState) => {
    setDraft({
      profileId: profile.profileId,
      toolId: profile.toolId,
      enabled: profile.enabled,
      bridgeUrl: '',
      bindingId: '',
      // Edit initializes from the requested (configured) capabilities, never the
      // negotiated ones, so a downgraded session never rewrites the config.
      requestedCapabilities: {...profile.requestedCapabilities},
      credential: {action: 'keep'},
      secretInput: '',
    });
  }, []);

  const runCommand = useCallback(
    async (op: () => Promise<VisualAgentToolsViewState>) => {
      try {
        setViewState(await op());
      } catch {
        setViewState(ERROR_STATE);
      }
    },
    [],
  );

  const setEnabled = useCallback(
    (next: boolean) => {
      if (!viewState) {
        return;
      }
      void runCommand(() =>
        visualAgentTools.setEnabled(next, viewState.revision),
      );
    },
    [viewState, visualAgentTools, runCommand],
  );

  const chooseActive = useCallback(
    (profileId: string) => {
      if (!viewState) {
        return;
      }
      void runCommand(() =>
        visualAgentTools.setActiveProfile(profileId, viewState.revision),
      );
    },
    [viewState, visualAgentTools, runCommand],
  );

  const removeProfile = useCallback(
    (profile: VisualAgentProfileViewState) => {
      if (!viewState) {
        return;
      }
      Alert.alert('删除这个连接？', profile.displayName, [
        {text: '返回', style: 'cancel'},
        {
          text: '删除',
          style: 'destructive',
          onPress: () =>
            void runCommand(() =>
              visualAgentTools.deleteProfile(
                profile.profileId,
                viewState.revision,
              ),
            ),
        },
      ]);
    },
    [viewState, visualAgentTools, runCommand],
  );

  const chooseCredentialIntent = useCallback(
    (action: CredentialEditIntent['action']) => {
      setDraft(current => {
        if (!current) {
          return current;
        }
        if (action === 'keep') {
          return {...current, credential: {action: 'keep'}, secretInput: ''};
        }
        return current;
      });
      if (action === 'keep') {
        return;
      }
      // Replace and remove both discard the stored secret, so both need an
      // explicit second confirmation before the intent is armed.
      Alert.alert(
        action === 'replace' ? '替换密钥？' : '移除密钥？',
        action === 'replace'
          ? '保存后会写入新密钥，旧密钥被替换。'
          : '保存后会删除已存密钥，连接需要重新配置密钥。',
        [
          {text: '取消', style: 'cancel'},
          {
            text: '确认',
            style: 'destructive',
            onPress: () =>
              setDraft(current =>
                current
                  ? {
                      ...current,
                      secretInput: '',
                      credential:
                        action === 'replace'
                          ? {action: 'replace', plaintext: ''}
                          : {action: 'remove'},
                    }
                  : current,
              ),
          },
        ],
      );
    },
    [],
  );

  const submitDraft = useCallback(() => {
    if (!viewState || !draft) {
      return;
    }
    const credential: CredentialEditIntent =
      draft.credential.action === 'replace'
        ? {action: 'replace', plaintext: draft.secretInput}
        : draft.credential;
    const input: VisualAgentProfileDraftInput = {
      profileId: draft.profileId,
      toolId: draft.toolId,
      enabled: draft.enabled,
      bridgeUrl: draft.bridgeUrl.trim(),
      bindingId: draft.bindingId.trim(),
      credential,
      requestedCapabilities: draft.requestedCapabilities,
    };
    void runCommand(async () => {
      const next = await visualAgentTools.saveProfile(
        input,
        viewState.revision,
      );
      setDraft(null);
      return next;
    });
  }, [viewState, draft, visualAgentTools, runCommand]);

  const state = viewState ?? LOADING_STATE;

  if (state.status === 'loading') {
    return (
      <PageLayout title="视觉工具" showBackButton>
        <View style={styles.center}>
          <Text style={styles.hint}>正在读取…</Text>
        </View>
      </PageLayout>
    );
  }

  if (state.status === 'error') {
    return (
      <PageLayout title="视觉工具" showBackButton>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>暂时读不到视觉工具配置</Text>
          <TouchableOpacity
            style={styles.retry}
            onPress={() =>
              void runCommand(() => visualAgentTools.getViewState())
            }>
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      </PageLayout>
    );
  }

  const activeProfile = state.profiles.find(
    profile => profile.profileId === state.activeProfileId,
  );

  return (
    <PageLayout title="视觉工具" showBackButton>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <View style={styles.copy}>
            <Text style={styles.title}>使用视觉工具</Text>
            <Text style={styles.body}>
              把看屏和操作交给已连接的视觉智能体。首页对话仍用陪伴模型。
            </Text>
          </View>
          <Switch
            value={state.enabled}
            onValueChange={setEnabled}
            trackColor={{false: '#d8d7df', true: COLORS.violet}}
            thumbColor="#ffffff"
          />
        </View>

        {!state.canOperate && state.blocker ? (
          <View style={styles.blocker}>
            <Text style={styles.blockerText}>{state.blocker.message}</Text>
          </View>
        ) : null}

        <Text style={styles.section}>内置工具</Text>
        {state.adapters.map(adapter => (
          <AdapterCard key={adapter.toolId} adapter={adapter} />
        ))}

        <Text style={styles.section}>已保存的连接</Text>
        {state.profiles.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.title}>还没有连接</Text>
            <Text style={styles.body}>新增一个连接后可在这里选择启用。</Text>
          </View>
        ) : (
          state.profiles.map(profile => (
            <ProfileCard
              key={profile.profileId}
              profile={profile}
              isActive={profile.profileId === state.activeProfileId}
              onActivate={() => chooseActive(profile.profileId)}
              onEdit={() => openEditDraft(profile)}
              onDelete={() => removeProfile(profile)}
            />
          ))
        )}

        {activeProfile ? (
          <Text style={styles.caption}>
            当前连接：{activeProfile.displayName} ·{' '}
            {READINESS_LABELS[activeProfile.readiness]}
          </Text>
        ) : null}

        {draft ? (
          <DraftForm
            draft={draft}
            adapters={state.adapters}
            onChange={setDraft}
            onChooseCredential={chooseCredentialIntent}
            onCancel={() => setDraft(null)}
            onSubmit={submitDraft}
          />
        ) : (
          <TouchableOpacity style={styles.primary} onPress={openAddDraft}>
            <Text style={styles.primaryText}>新增连接</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </PageLayout>
  );
};

const AdapterCard: React.FC<{adapter: VisualAgentToolOptionViewState}> = ({
  adapter,
}) => (
  <View style={styles.card}>
    <View style={styles.cardHead}>
      <Text style={styles.title}>{adapter.label}</Text>
      <Text style={styles.tag}>
        {MATURITY_LABELS[adapter.maturity]} · {READINESS_LABELS[adapter.readiness]}
      </Text>
    </View>
    <Text style={styles.body}>
      已配置连接 {adapter.configuredProfileCount} 个
    </Text>
    <View style={styles.chips}>
      {CAPABILITY_LABELS.filter(cap => adapter.capabilities[cap.key]).map(cap => (
        <Text key={cap.key} style={styles.chip}>
          {cap.label}
        </Text>
      ))}
    </View>
  </View>
);

const ProfileCard: React.FC<{
  profile: VisualAgentProfileViewState;
  isActive: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({profile, isActive, onActivate, onEdit, onDelete}) => (
  <View style={[styles.card, isActive && styles.cardActive]}>
    <View style={styles.cardHead}>
      <Text style={styles.title}>{profile.displayName}</Text>
      <Text style={styles.tag}>{READINESS_LABELS[profile.readiness]}</Text>
    </View>
    <Text style={styles.body}>{profile.endpointLabel}</Text>
    {!profile.runnable ? (
      <Text style={styles.profileBlocked}>当前不可操作</Text>
    ) : null}
    <View style={styles.caps}>
      {CAPABILITY_LABELS.map(cap => (
        <Text key={cap.key} style={styles.capLine}>
          {cap.label}：{profile.capabilities[cap.key] ? '支持' : '不支持'}
        </Text>
      ))}
    </View>
    <View style={styles.profileActions}>
      <TouchableOpacity
        style={[styles.action, isActive && styles.actionOn]}
        disabled={isActive}
        onPress={onActivate}>
        <Text style={[styles.actionText, isActive && styles.actionTextOn]}>
          {isActive ? '使用中' : '设为使用'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.action} onPress={onEdit}>
        <Text style={styles.actionText}>编辑</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.action} onPress={onDelete}>
        <Text style={styles.actionDanger}>删除</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const DraftForm: React.FC<{
  draft: DraftState;
  adapters: readonly VisualAgentToolOptionViewState[];
  onChange: React.Dispatch<React.SetStateAction<DraftState | null>>;
  onChooseCredential: (action: CredentialEditIntent['action']) => void;
  onCancel: () => void;
  onSubmit: () => void;
}> = ({draft, adapters, onChange, onChooseCredential, onCancel, onSubmit}) => {
  const patch = (next: Partial<DraftState>) =>
    onChange(current => (current ? {...current, ...next} : current));
  const toggleCap = (key: keyof VisualAgentCapabilitySet) =>
    onChange(current =>
      current
        ? {
            ...current,
            requestedCapabilities: {
              ...current.requestedCapabilities,
              [key]: !current.requestedCapabilities[key],
            },
          }
        : current,
    );

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>
        {draft.profileId ? '编辑连接' : '新增连接'}
      </Text>

      <View style={styles.row}>
        <Text style={styles.label}>启用</Text>
        <Switch
          value={draft.enabled}
          onValueChange={value => patch({enabled: value})}
          trackColor={{false: '#d8d7df', true: COLORS.violet}}
          thumbColor="#ffffff"
        />
      </View>

      <Text style={styles.label}>工具</Text>
      <View style={styles.chips}>
        {adapters.map(adapter => (
          <TouchableOpacity
            key={adapter.toolId}
            style={[
              styles.presetChip,
              draft.toolId === adapter.toolId && styles.presetChipOn,
            ]}
            onPress={() => patch({toolId: adapter.toolId})}>
            <Text
              style={[
                styles.presetChipText,
                draft.toolId === adapter.toolId && styles.presetChipTextOn,
              ]}>
              {adapter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Connector Bridge 地址</Text>
      <TextInput
        style={styles.input}
        value={draft.bridgeUrl}
        onChangeText={value => patch({bridgeUrl: value})}
        autoCapitalize="none"
        placeholder="https:// 或 wss://"
      />

      <Text style={styles.label}>Bridge 绑定 ID</Text>
      <TextInput
        style={styles.input}
        value={draft.bindingId}
        onChangeText={value => patch({bindingId: value})}
        autoCapitalize="none"
        placeholder="由 Bridge 分配"
      />

      <Text style={styles.label}>请求能力</Text>
      <View style={styles.chips}>
        {CAPABILITY_LABELS.map(cap => (
          <TouchableOpacity
            key={cap.key}
            style={[
              styles.presetChip,
              draft.requestedCapabilities[cap.key] && styles.presetChipOn,
            ]}
            onPress={() => toggleCap(cap.key)}>
            <Text
              style={[
                styles.presetChipText,
                draft.requestedCapabilities[cap.key] && styles.presetChipTextOn,
              ]}>
              {cap.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>密钥</Text>
      <View style={styles.seg}>
        {(
          [
            ['keep', '保留'],
            ['replace', '替换'],
            ['remove', '移除'],
          ] as const
        ).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.segBtn,
              draft.credential.action === key && styles.segBtnOn,
            ]}
            onPress={() => onChooseCredential(key)}>
            <Text
              style={[
                styles.segText,
                draft.credential.action === key && styles.segTextOn,
              ]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {draft.credential.action === 'replace' ? (
        <TextInput
          testID="visual-agent-secret"
          style={styles.input}
          value={draft.secretInput}
          onChangeText={value => patch({secretInput: value})}
          autoCapitalize="none"
          secureTextEntry
          placeholder="输入新密钥"
        />
      ) : null}

      <TouchableOpacity style={styles.primary} onPress={onSubmit}>
        <Text style={styles.primaryText}>保存</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={onCancel}>
        <Text style={styles.secondaryText}>取消</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingBottom: 60,
  },
  center: {
    padding: 40,
    alignItems: 'center',
  },
  hint: {
    color: COLORS.text.secondary,
    fontSize: 12,
  },
  errorTitle: {
    color: COLORS.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  retry: {
    marginTop: 14,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: COLORS.violet,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  row: {
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
  copy: {
    flex: 1,
    paddingRight: 12,
  },
  section: {
    marginTop: 12,
    marginBottom: 8,
    color: COLORS.text.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  blocker: {
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 15,
    backgroundColor: '#fff0ec',
  },
  blockerText: {
    color: COLORS.error,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  card: {
    padding: 15,
    marginBottom: 10,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  cardActive: {
    borderColor: 'rgba(117,107,240,0.38)',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tag: {
    color: COLORS.text.secondary,
    fontSize: 10,
    fontWeight: '700',
  },
  chips: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    color: COLORS.text.secondary,
    backgroundColor: '#eceaf6',
    fontSize: 10,
    fontWeight: '700',
  },
  caps: {
    marginTop: 8,
    gap: 2,
  },
  capLine: {
    color: COLORS.text.secondary,
    fontSize: 10,
  },
  profileBlocked: {
    marginTop: 4,
    color: COLORS.error,
    fontSize: 10,
    fontWeight: '700',
  },
  profileActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  action: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  actionOn: {
    backgroundColor: COLORS.violet,
  },
  actionText: {
    color: COLORS.text.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  actionTextOn: {
    color: '#ffffff',
  },
  actionDanger: {
    color: COLORS.error,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyCard: {
    padding: 15,
    marginBottom: 10,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  caption: {
    marginTop: 4,
    marginBottom: 12,
    color: COLORS.text.secondary,
    fontSize: 11,
  },
  form: {
    marginTop: 12,
    padding: 15,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  formTitle: {
    marginBottom: 12,
    color: COLORS.text.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  label: {
    marginTop: 12,
    marginBottom: 8,
    color: COLORS.text.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    color: COLORS.text.primary,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  presetChipOn: {
    backgroundColor: COLORS.violet,
  },
  presetChipText: {
    color: '#5d6070',
    fontSize: 11,
    fontWeight: '700',
  },
  presetChipTextOn: {
    color: '#ffffff',
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
  segBtnOn: {
    backgroundColor: COLORS.violet,
  },
  segText: {
    color: '#5d6070',
    fontSize: 12,
    fontWeight: '700',
  },
  segTextOn: {
    color: '#ffffff',
  },
  primary: {
    minHeight: 52,
    marginTop: 16,
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
  secondary: {
    minHeight: 44,
    marginTop: 8,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: COLORS.text.secondary,
    fontSize: 13,
    fontWeight: '700',
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
});
