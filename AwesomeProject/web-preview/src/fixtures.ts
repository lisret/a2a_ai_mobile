import type {
  AppFacades,
  ActivityViewState,
  CompanionTurnViewState,
  CompanionViewState,
  ErrandsViewState,
  ModelConfigListViewState,
  ModelConfigViewState,
  OperateTaskViewState,
  PhoneOperateViewState,
  PrivacyViewState,
  TaskUiEvent,
  VisualAgentToolsViewState,
} from '../../src/application/facades/UiRuntimeContracts';
import type {ModelListKey, AgentModeId} from '../../src/shared/types/Model';
import type {VisualAgentToolId} from '../../src/core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import storage from './adapters/storage';
import {STORAGE_KEYS} from '../../src/shared/constants';

const timestamp = new Date('2026-10-10T08:00:00+08:00').getTime();
export const sampleTasks = [
  {
    id: 'preview-task-success',
    modelId: 'preview-unified',
    instruction: '打开地图，查找附近的咖啡店',
    status: 'success',
    createdAt: timestamp,
    updatedAt: timestamp + 30000,
    output: {
      summary: '已完成演示任务',
      steps: [
        {
          step: 1,
          action: '打开地图',
          timestamp,
          actionDetails: {action: 'Launch', app: '地图'},
        },
        {
          step: 2,
          action: '输入咖啡店',
          timestamp: timestamp + 10000,
          actionDetails: {action: 'Type', text: '咖啡店'},
        },
        {step: 3, action: '完成查找', timestamp: timestamp + 30000},
      ],
    },
  },
  {
    id: 'preview-task-failed',
    modelId: 'preview-unified',
    instruction: '整理今天的提醒',
    status: 'failed',
    error: '演示：连接暂时不可用',
    createdAt: timestamp - 3600000,
    updatedAt: timestamp - 3500000,
    output: {steps: []},
  },
];

export async function seedPreviewHistory() {
  await storage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(sampleTasks));
}

export function createPreviewFacades(): AppFacades {
  const empty = new URLSearchParams(location.search).get('data') === 'empty';
  let revision = 1;
  let companionState: CompanionViewState = {
    phase: 'idle',
    modelLabel: empty ? undefined : 'NoNo 演示对话模型',
  };
  const pendingTurns = new Map<string, CompanionTurnViewState>();
  let operateState: OperateTaskViewState = {phase: 'idle', steps: []};
  const subscribers = new Set<(event: TaskUiEvent) => void>();
  let sequence = 0;
  const emit = (event: Record<string, unknown>) => {
    const value = {
      taskId: operateState.taskId ?? 'preview-live',
      sessionRevision: 1,
      sequence: ++sequence,
      occurredAtMs: Date.now(),
      ...event,
    } as TaskUiEvent;
    subscribers.forEach(callback => callback(value));
  };
  let taskTimer: ReturnType<typeof setInterval> | undefined;
  const mode = (
    id: AgentModeId,
    label: string,
    nodes: string[],
    caption: string,
  ) => ({
    id,
    label,
    nodes,
    caption,
    runnable: !empty,
    blockers: empty
      ? [{code: 'missing_unified_model' as const, message: '请先配置演示模型'}]
      : [],
  });
  let phone: PhoneOperateViewState = {
    status: 'ready',
    revision,
    activeMode: 'cloud_direct',
    draftMode: 'cloud_direct',
    adbFallbackEnabled: false,
    modes: {
      cloud_direct: mode(
        'cloud_direct',
        '云端直接操作',
        ['视觉模型', '手机执行'],
        '一个模型理解屏幕并给出动作。',
      ),
      cloud_split: mode(
        'cloud_split',
        '云端视觉 + 规划',
        ['视觉模型', '规划模型', '手机执行'],
        '看屏与规划分别处理。',
      ),
      local_vision_cloud_planner: mode(
        'local_vision_cloud_planner',
        '本地视觉 + 云端规划',
        ['本地视觉', '云端规划', '手机执行'],
        '本机理解画面，云端负责规划。',
      ),
    },
  };
  const capabilities = {
    imageInput: true,
    structuredAction: true,
    stream: true,
    cancel: true,
    approval: true,
    resume: true,
    steer: true,
    preferences: true,
  };
  let tools: VisualAgentToolsViewState = {
    status: 'ready',
    revision,
    enabled: false,
    profiles: [],
    canOperate: false,
    adapters: (
      ['openclaw', 'codex', 'cursor', 'dsh', 'hermes'] as VisualAgentToolId[]
    ).map((id, index) => ({
      toolId: id,
      builtIn: true,
      label: ['OpenClaw', 'Codex', 'Cursor', 'DeepSeek Harness', 'Hermes'][
        index
      ],
      readiness: 'not_configured',
      maturity: 'experimental',
      capabilities,
      configuredProfileCount: 0,
    })),
  };
  let errands: ErrandsViewState = {
    status: 'ready',
    enabled: !empty,
    pendingCount: empty ? 0 : 1,
    items: empty
      ? []
      : [
          {
            id: 'preview-errand',
            title: '晚上提醒我整理照片',
            kind: 'schedule',
            status: 'pending',
            scheduleLabel: '今天 20:00',
            nextDueAtMs: timestamp + 12 * 3600000,
          },
        ],
  };
  let privacy: PrivacyViewState = {
    status: 'ready',
    memoryEnabled: !empty,
    memoryLocation: 'device',
    canUseVisualAgentMemory: false,
    channels: [
      {
        id: 'companion',
        state: 'remote',
        destinationLabel: '演示对话模型',
        fields: ['说话内容'],
      },
      {
        id: 'cloud_direct',
        state: 'remote',
        destinationLabel: '演示操作模型',
        fields: ['任务指令', '当前屏幕'],
      },
      {
        id: 'cloud_split',
        state: 'remote',
        destinationLabel: '演示视觉与规划模型',
        fields: ['任务指令', '当前屏幕'],
      },
      {
        id: 'local_vision',
        state: 'local',
        destinationLabel: '这台手机',
        fields: ['当前屏幕'],
      },
      {
        id: 'visual_agent',
        state: 'blocked',
        destinationLabel: '未连接',
        fields: [],
      },
    ],
    persistedDiagnosticFields: ['任务状态', '步骤数量', '错误分类'],
  };
  let activity: ActivityViewState = {
    status: 'ready',
    memoryEnabled: !empty,
    memoryLocationLabel: '仅这台手机',
    preferences: empty
      ? []
      : [
          {
            id: 'preview-preference',
            kind: 'preference',
            title: '喜欢安静的地方',
            body: '挑选地点时优先考虑安静程度。',
          },
        ],
    errands: errands.items,
    tasks: empty
      ? []
      : sampleTasks.map(task => ({
          id: task.id,
          title: task.instruction,
          status: task.status as 'success' | 'failed',
          createdAtMs: task.createdAt,
          completedAtMs: task.updatedAt,
          stepCount: task.output.steps.length,
        })),
  };
  const models = new Map<ModelListKey, ModelConfigListViewState>();
  const modelStates = new Map<string, ModelConfigViewState>();
  const makeModel = (): ModelConfigViewState => ({
    status: 'ready',
    revision,
    mode: 'preset',
    selectedPresetId: 'openai',
    presets: [
      {
        id: 'openai',
        label: 'OpenAI',
        maturity: 'stable',
        catalogSupported: true,
      },
      {
        id: 'deepseek',
        label: 'DeepSeek',
        maturity: 'stable',
        catalogSupported: true,
      },
      {
        id: 'zhipu_glm',
        label: '智谱',
        maturity: 'stable',
        catalogSupported: true,
      },
    ],
    providerLabel: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modelId: empty ? '' : 'preview-model',
    credential: {state: empty ? 'missing' : 'ready', maskedLabel: '演示凭据'},
    catalog: {
      requestGeneration: 0,
      status: 'ready',
      models: [{id: 'preview-model', label: '演示模型'}],
    },
  });
  for (const list of [
    'companion',
    'unified',
    'splitVision',
    'splitPlanner',
    'localPlanner',
  ] as ModelListKey[]) {
    const bindingId = 'preview-' + list;
    models.set(list, {
      status: 'ready',
      revision,
      list,
      items: empty
        ? []
        : [
            {
              bindingId,
              endpointProfileId: bindingId,
              displayName:
                list === 'companion' ? 'NoNo 演示对话模型' : '演示操作模型',
              providerLabel: 'OpenAI',
              modelId: 'preview-model',
              mode: 'preset',
              selected: true,
            },
          ],
    });
    modelStates.set(bindingId, makeModel());
  }
  const updateErrands = () => {
    errands = {
      ...errands,
      pendingCount: errands.items.filter(item => item.status === 'pending')
        .length,
    };
    activity = {...activity, errands: errands.items};
  };

  return {
    companion: {
      async getViewState() {
        return companionState;
      },
      async submitTranscript(text) {
        const intent = /记住|喜欢|叫我/.test(text)
          ? 'preference'
          : /提醒|交代/.test(text)
          ? 'errand'
          : /打开|查找|操作|帮我/.test(text)
          ? 'operate'
          : 'companion';
        const turn: CompanionTurnViewState = {
          id: 'preview-turn-' + Date.now(),
          transcript: text,
          intent,
          reply:
            intent === 'operate'
              ? '我可以开始这个演示任务。'
              : '我听到了。我们可以继续聊这件事。',
          ...(intent === 'preference'
            ? {proposal: {kind: 'preference' as const, title: text}}
            : {}),
          ...(intent === 'errand'
            ? {
                proposal: {
                  kind: 'errand' as const,
                  title: text,
                  errandType: 'once' as const,
                },
              }
            : {}),
        };
        pendingTurns.set(turn.id, turn);
        companionState = {...companionState, phase: 'ready', turn};
        return turn;
      },
      async confirmProposal(id) {
        const turn = pendingTurns.get(id);
        if (turn?.proposal?.kind === 'preference')
          activity = {
            ...activity,
            preferences: [
              ...activity.preferences,
              {id, kind: 'preference', title: turn.proposal.title},
            ],
          };
        if (turn?.proposal?.kind === 'errand') {
          errands = {
            ...errands,
            items: [
              ...errands.items,
              {
                id,
                title: turn.proposal.title,
                kind: 'once',
                status: 'pending',
                scheduleLabel: '待执行',
              },
            ],
          };
          updateErrands();
        }
        pendingTurns.delete(id);
        companionState = {...companionState, phase: 'idle', turn: undefined};
      },
      async dismissTurn(id) {
        pendingTurns.delete(id);
        companionState = {...companionState, phase: 'idle', turn: undefined};
      },
    },
    operate: {
      async getViewState() {
        return operateState;
      },
      async start(instruction) {
        clearInterval(taskTimer);
        sequence = 0;
        operateState = {
          phase: 'running',
          instruction,
          taskId: 'preview-live',
          sessionRevision: 1,
          maxSteps: 3,
          steps: [],
        };
        let step = 0;
        taskTimer = setInterval(() => {
          if (step === 0) emit({type: 'started', maxSteps: 3});
          if (step < 3) {
            emit({type: 'step_started', step, maxSteps: 3});
            const actionLabel = [
              '理解演示指令',
              '准备演示操作',
              '展示演示结果',
            ][step];
            operateState = {
              ...operateState,
              currentStep: step,
              steps: [
                ...operateState.steps,
                {step, actionLabel, occurredAtMs: Date.now()},
              ],
            };
            emit({type: 'step_completed', step, actionLabel});
            step++;
          } else {
            clearInterval(taskTimer);
            operateState = {...operateState, phase: 'success'};
            emit({type: 'completed', summary: '演示结束'});
          }
        }, 1200);
        return {kind: 'started', taskId: 'preview-live', sessionRevision: 1};
      },
      async cancel() {
        clearInterval(taskTimer);
        operateState = {...operateState, phase: 'cancelled'};
        emit({
          type: 'failed',
          code: 'cancelled',
          message: '已停止演示',
          isCancelled: true,
        });
      },
      subscribeTask(_id, _revision, callback) {
        subscribers.add(callback);
        return () => subscribers.delete(callback);
      },
    },
    phoneOperate: {
      async getViewState() {
        return phone;
      },
      async selectDraftMode(draftMode) {
        phone = {...phone, draftMode};
        return phone;
      },
      async activateDraftMode() {
        phone = {...phone, activeMode: phone.draftMode, revision: ++revision};
        return phone;
      },
      async setAdbFallbackEnabled(adbFallbackEnabled) {
        phone = {...phone, adbFallbackEnabled};
        return phone;
      },
    },
    visualAgentTools: {
      async getViewState() {
        return tools;
      },
      async setEnabled(enabled) {
        tools = {...tools, enabled, revision: ++revision};
        return tools;
      },
      async saveProfile(draft) {
        const profileId = draft.profileId ?? 'preview-profile-' + Date.now();
        const profile = {
          profileId,
          toolId: draft.toolId,
          displayName: String(draft.toolId),
          enabled: draft.enabled,
          endpointLabel: draft.bridgeUrl,
          readiness: 'ready' as const,
          maturity: 'experimental' as const,
          requestedCapabilities: draft.requestedCapabilities,
          capabilities,
          runnable: true,
          blockers: [],
        };
        tools = {
          ...tools,
          revision: ++revision,
          profiles: [
            ...tools.profiles.filter(item => item.profileId !== profileId),
            profile,
          ],
          activeProfileId: profileId,
          canOperate: true,
        };
        return tools;
      },
      async deleteProfile(id) {
        tools = {
          ...tools,
          profiles: tools.profiles.filter(item => item.profileId !== id),
          revision: ++revision,
        };
        return tools;
      },
      async setActiveProfile(activeProfileId) {
        tools = {...tools, activeProfileId, revision: ++revision};
        return tools;
      },
      async refreshProfile() {
        return tools;
      },
    },
    errands: {
      async getViewState() {
        return errands;
      },
      async setEnabled(enabled) {
        errands = {...errands, enabled};
        return errands;
      },
      async createFromProposal(proposal) {
        const id = 'preview-errand-' + Date.now();
        errands = {
          ...errands,
          items: [
            ...errands.items,
            {
              id,
              title: proposal.title,
              kind: proposal.errandType,
              status: 'pending',
              scheduleLabel: proposal.when ?? '待执行',
            },
          ],
        };
        updateErrands();
        return id;
      },
      async update(item) {
        errands = {
          ...errands,
          items: errands.items.map(existing =>
            existing.id === item.id ? item : existing,
          ),
        };
        updateErrands();
        return item;
      },
      async cancel(id) {
        errands = {
          ...errands,
          items: errands.items.map(item =>
            item.id === id ? {...item, status: 'cancelled'} : item,
          ),
        };
        updateErrands();
      },
    },
    privacy: {
      async getViewState() {
        return privacy;
      },
      async setMemoryEnabled(memoryEnabled) {
        privacy = {...privacy, memoryEnabled};
        activity = {...activity, memoryEnabled};
        return privacy;
      },
      async setMemoryLocation(memoryLocation) {
        privacy = {...privacy, memoryLocation};
        return privacy;
      },
      async forgetAllPreferences() {
        activity = {...activity, preferences: []};
        return privacy;
      },
    },
    activity: {
      async getViewState() {
        return activity;
      },
      async forgetPreference(id) {
        activity = {
          ...activity,
          preferences: activity.preferences.filter(item => item.id !== id),
        };
        return activity;
      },
      async deleteTask(id) {
        activity = {
          ...activity,
          tasks: activity.tasks.filter(item => item.id !== id),
        };
        return activity;
      },
    },
    modelConfig: {
      async getListViewState(list) {
        return models.get(list)!;
      },
      async getViewState(input) {
        return (
          modelStates.get(input.bindingId ?? 'preview-' + input.list) ??
          makeModel()
        );
      },
      async refreshCatalog(input) {
        return {
          status: 'ready',
          requestGeneration: input.requestGeneration,
          fetchedAtMs: Date.now(),
          models: [
            {id: 'preview-model', label: '演示模型'},
            {id: 'preview-vision', label: '演示视觉模型'},
          ],
        };
      },
      async save(input) {
        const bindingId =
          input.bindingId ?? 'preview-' + input.list + '-' + Date.now();
        const current = modelStates.get(bindingId) ?? makeModel();
        const value: ModelConfigViewState = {
          ...current,
          revision: ++revision,
          modelId: input.selectedModelId,
          mode: input.mode,
          credential: {state: 'ready', maskedLabel: '演示凭据'},
        };
        if (input.mode === 'preset') {
          value.selectedPresetId = input.presetId;
          value.baseUrl = input.baseUrlOverride ?? current.baseUrl;
          value.providerLabel = String(input.presetId);
        } else {
          value.custom = {
            providerLabel: input.customProviderLabel,
            baseUrl: input.baseUrl,
            protocol: input.protocol,
            auth: input.auth,
            chatPath: input.chatPath,
            modelListPath: input.modelListPath,
            declaredCapabilities: input.declaredCapabilities,
            capabilityTrust: 'user_declared_unverified',
          };
          value.providerLabel = input.customProviderLabel;
          value.baseUrl = input.baseUrl;
        }
        modelStates.set(bindingId, value);
        const list = models.get(input.list)!;
        models.set(input.list, {
          ...list,
          revision,
          items: [
            ...list.items.filter(item => item.bindingId !== bindingId),
            {
              bindingId,
              endpointProfileId: bindingId,
              displayName: value.modelId,
              providerLabel: value.providerLabel,
              modelId: value.modelId,
              mode: value.mode,
              selected:
                list.items.length === 0 ||
                list.items.some(
                  item => item.bindingId === bindingId && item.selected,
                ),
            },
          ],
        });
        // Plaintext credential input is deliberately not stored or sent anywhere.
        return value;
      },
      async selectBinding(input) {
        const list = models.get(input.list)!;
        const next = {
          ...list,
          revision: ++revision,
          items: list.items.map(item => ({
            ...item,
            selected: item.bindingId === input.bindingId,
          })),
        };
        models.set(input.list, next);
        return next;
      },
      async deleteBinding(input) {
        const list = models.get(input.list)!;
        const next = {
          ...list,
          revision: ++revision,
          items: list.items.filter(item => item.bindingId !== input.bindingId),
        };
        models.set(input.list, next);
        modelStates.delete(input.bindingId);
        return next;
      },
    },
  };
}
