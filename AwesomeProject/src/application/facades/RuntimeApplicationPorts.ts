import AsyncStorage from '@react-native-async-storage/async-storage';
import {accessibilityService} from '../../core/ability/accessibility/AccessibilityService';
import {OperateRuntime} from '../../core/engine/operateRuntime/OperateRuntime';
import type {RuntimeConfigRepository} from '../../core/engine/operateRuntime/contracts/RuntimeConfigContracts';
import {OperateSessionResolver} from '../../core/engine/operateRuntime/session/OperateSessionResolver';
import {OperateSessionStore} from '../../core/engine/operateRuntime/session/OperateSessionStore';
import {OperateTaskRunner} from '../../core/engine/operateRuntime/runner/OperateTaskRunner';
import {
  RegistryModelChatAdapter,
  type OperateTaskEvent,
} from '../../core/engine/operateRuntime/runner/OperateTaskPorts';
import {SnapshotAgentRuntimeAdapter} from '../../core/engine/operateRuntime/runner/SnapshotAgentRuntimeAdapter';
import {LocalPerceptionUnavailableError} from '../../core/engine/agentRuntime/runtime/AgentRuntimeFactory';
import type {TaskAction} from '../../core/engine/taskEngine/types/Task';
import type {ModelProviderRegistry} from '../../core/engine/operateRuntime/model/ModelProviderContracts';
import type {CredentialStore} from '../../core/engine/operateRuntime/contracts/CredentialStore';
import type {VisualAgentProfileV1} from '../../core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import {createBuiltInVisualAgentToolRegistry} from '../../connectorBridge/visualAgent/BuiltInVisualAgentToolRegistry';
import {NativeLocalModelEligibilityChecker} from '../../core/engine/agentRuntime/config/NativeLocalModelEligibilityChecker';
import {taskHistoryService} from '../../features/task/services/TaskHistoryService';
import {setHeadlessOperateEntry} from '../../features/task/services/TaskExecutionHeadless';
import {STORAGE_KEYS} from '../../shared/constants/storage.config';
import {PROVIDER_PRESET_DISPLAY} from '../../shared/constants/apiProviders';
import type {
  ActivityApplicationPort,
  ActivityViewState,
  CompanionApplicationPort,
  CompanionTurnViewState,
  CompanionViewState,
  ErrandApplicationPort,
  ErrandItemViewState,
  ErrandsViewState,
  OperateApplicationPort,
  OperateTaskViewState,
  PreferenceViewState,
  PrivacyApplicationPort,
  PrivacyViewState,
  StartOperateResult,
  TaskUiEvent,
  TaskUiEventSource,
  UiBlocker,
  Unsubscribe,
  VisualAgentProfileDraftInput,
  VisualAgentReadiness,
  VisualAgentToolsApplicationPort,
  VisualAgentToolsViewState,
} from './UiRuntimeContracts';

export class TaskUiEventBus implements TaskUiEventSource {
  private readonly listeners = new Set<(event: TaskUiEvent) => void>();

  subscribe(listener: (event: TaskUiEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: TaskUiEvent): void {
    this.listeners.forEach(listener => listener(event));
  }
}

const pendingTurns = new Map<string, CompanionTurnViewState>();

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function classifyTranscript(text: string): CompanionTurnViewState['intent'] {
  if (/记住|以后|我叫|我是/.test(text)) {
    return 'preference';
  }
  if (/提醒|交代|记得帮/.test(text)) {
    return 'errand';
  }
  if (/打开|点一下|关掉|设置|微信|支付宝/.test(text)) {
    return 'operate';
  }
  return 'companion';
}

export class RuntimeCompanionPort implements CompanionApplicationPort {
  constructor(private readonly repo: RuntimeConfigRepository) {}

  async getState(): Promise<CompanionViewState> {
    const envelope = await this.repo.load();
    const binding = envelope.active.modelAPI.bindings.find(
      item => item.role === 'companion',
    );
    const profile = binding
      ? envelope.active.modelAPI.profiles.find(item => item.id === binding.profileId)
      : undefined;
    if (!binding || !profile) {
      return {phase: 'error', errorMessage: '请先配置陪伴模型'};
    }
    const modelLabel =
      profile.mode === 'preset'
        ? PROVIDER_PRESET_DISPLAY[profile.preset]?.label ?? binding.modelId
        : profile.label;
    return {phase: 'idle', modelLabel};
  }

  async submitTranscript(text: string): Promise<CompanionTurnViewState> {
    const transcript = text.trim();
    const intent = classifyTranscript(transcript);
    const turn: CompanionTurnViewState = {
      id: newId('turn'),
      transcript,
      reply:
        intent === 'operate'
          ? '准备操作'
          : intent === 'preference'
          ? '要不要记住'
          : intent === 'errand'
          ? '要不要交代'
          : '我听到了',
      intent,
      proposal:
        intent === 'preference'
          ? {kind: 'preference', title: transcript}
          : intent === 'errand'
          ? {kind: 'errand', title: transcript, errandType: 'once'}
          : undefined,
    };
    pendingTurns.set(turn.id, turn);
    return turn;
  }

  async confirmProposal(turnId: string): Promise<void> {
    const turn = pendingTurns.get(turnId);
    pendingTurns.delete(turnId);
    if (!turn?.proposal) {
      return;
    }
    if (turn.proposal.kind === 'preference') {
      const items = await readJson<PreferenceViewState[]>(STORAGE_KEYS.PREFERENCES, []);
      items.push({
        id: newId('pref'),
        kind: 'preference',
        title: turn.proposal.title,
        body: turn.proposal.body,
      });
      await AsyncStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(items));
      return;
    }
    const items = await readJson<ErrandItemViewState[]>(STORAGE_KEYS.ERRANDS, []);
    items.push({
      id: newId('errand'),
      title: turn.proposal.title,
      kind: turn.proposal.errandType,
      status: 'pending',
      scheduleLabel: turn.proposal.when ?? '一次',
    });
    await AsyncStorage.setItem(STORAGE_KEYS.ERRANDS, JSON.stringify(items));
  }

  async dismissTurn(turnId: string): Promise<void> {
    pendingTurns.delete(turnId);
  }
}

export class RuntimeOperatePort implements OperateApplicationPort {
  private current: OperateTaskViewState = {phase: 'idle', steps: []};
  private abort: AbortController | null = null;
  private sequence = 0;

  constructor(
    private readonly repo: RuntimeConfigRepository,
    private readonly events: TaskUiEventBus,
    private readonly registry: ModelProviderRegistry,
    private readonly eligibility: NativeLocalModelEligibilityChecker,
  ) {}

  async getCurrent(): Promise<OperateTaskViewState> {
    return this.current;
  }

  async start(instruction: string): Promise<StartOperateResult> {
    const sessionStore = new OperateSessionStore();
    const visualRegistry = createBuiltInVisualAgentToolRegistry();
    const resolver = new OperateSessionResolver({
      modelProviderRegistry: this.registry,
      visualAgentToolRegistry: visualRegistry,
      localEligibility: {
        check: async () => {
          try {
            const report = await this.eligibility.getCurrent();
            return report.state === 'ready'
              ? {state: 'ready' as const}
              : {state: 'failed' as const, reason: report.state};
          } catch {
            return {state: 'failed' as const, reason: 'unknown'};
          }
        },
      },
    });
    const runtime = new OperateRuntime({
      configRepository: this.repo,
      sessionStore,
      resolver,
    });
    const taskId = newId('task');
    const created = await runtime.createSession({taskId});
    if (!created.ok) {
      const blocker = mapSessionBlocker(created.code);
      this.current = {phase: 'blocked', steps: [], blocker};
      return {kind: 'blocked', blocker};
    }
    const sessionRevision = created.session.sessionRevision;
    this.current = {
      phase: 'running',
      taskId,
      sessionRevision,
      instruction,
      steps: [],
    };
    this.abort = new AbortController();
    this.sequence = 0;
    void this.drive(runtime, sessionStore, visualRegistry, taskId, sessionRevision, instruction);
    return {kind: 'started', taskId, sessionRevision};
  }

  async cancel(taskId: string): Promise<void> {
    if (this.current.taskId === taskId) {
      this.abort?.abort();
      this.current = {phase: 'cancelled', steps: this.current.steps};
    }
  }

  private async drive(
    runtime: OperateRuntime,
    sessionStore: OperateSessionStore,
    visualRegistry: ReturnType<typeof createBuiltInVisualAgentToolRegistry>,
    taskId: string,
    sessionRevision: number,
    instruction: string,
  ): Promise<void> {
    const claim = await runtime.claim(taskId, sessionRevision, 'foreground');
    if (!claim.ok) {
      this.fail('claim_failed', '无法开始这次操作');
      return;
    }
    const emit = (event: OperateTaskEvent) => {
      const mapped = mapOperateEvent(event);
      if (mapped) {
        this.events.emit(mapped);
      }
    };
    const chat = new RegistryModelChatAdapter(this.registry);
    const runner = new OperateTaskRunner({
      instruction: {
        load: async id => (id === taskId ? instruction : null),
      },
      screenshot: {
        capture: async () => accessibilityService.captureScreen(),
      },
      snapshotAgentRuntime: new SnapshotAgentRuntimeAdapter(
        chat,
        () => {
          throw new LocalPerceptionUnavailableError();
        },
        {getDimensions: () => ({width: 1080, height: 1920})},
        () => undefined,
      ),
      visualAgentRegistry: visualRegistry,
      visualAgentImage: {
        capture: async () => ({
          mimeType: 'image/jpeg' as const,
          base64: await accessibilityService.captureScreen(),
          sharingConfirmed: true as const,
        }),
      },
      visualAgentApproval: {
        decide: async () => 'reject',
      },
      action: {
        execute: (action, signal) => executeTaskAction(action, signal),
      },
      confirmation: {
        confirm: async () => true,
      },
      history: taskHistoryService,
      events: {emit},
      now: Date.now,
      delay: (ms, signal) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, ms);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('operate_task_aborted'));
          });
        }),
    });
    try {
      await runner.run(claim.lease);
      this.current = {
        phase: 'success',
        taskId,
        sessionRevision,
        instruction,
        steps: this.current.steps,
      };
    } catch (error) {
      this.fail(
        'operate_failed',
        error instanceof Error ? error.message : '操作失败',
      );
    }
  }

  private fail(code: string, message: string): void {
    const taskId = this.current.taskId;
    const sessionRevision = this.current.sessionRevision;
    this.current = {
      phase: 'failed',
      taskId,
      sessionRevision,
      steps: this.current.steps,
      errorMessage: message,
    };
    if (taskId && sessionRevision != null) {
      this.events.emit({
        type: 'failed',
        taskId,
        sessionRevision,
        sequence: ++this.sequence,
        occurredAtMs: Date.now(),
        code,
        message,
        isCancelled: false,
      });
    }
  }
}

export class RuntimeVisualAgentToolsPort implements VisualAgentToolsApplicationPort {
  constructor(
    private readonly repo: RuntimeConfigRepository,
    private readonly credentials?: CredentialStore,
  ) {}

  async read(): Promise<VisualAgentToolsViewState> {
    const envelope = await this.repo.load();
    const registry = createBuiltInVisualAgentToolRegistry();
    const adapters = registry.list().map(toolId => {
      const {manifest} = registry.require(toolId);
      const configuredProfileCount = envelope.active.visualAgent.profiles.filter(
        profile => profile.toolId === toolId,
      ).length;
      return {
        toolId,
        builtIn: !String(toolId).startsWith('custom:'),
        label: manifest.displayName,
        readiness: (configuredProfileCount > 0
          ? 'ready'
          : 'not_configured') as VisualAgentReadiness,
        maturity: manifest.maturity,
        capabilities: manifest.declaredCapabilities,
        configuredProfileCount,
      };
    });
    const profiles = envelope.active.visualAgent.profiles.map(profile => {
      const {manifest} = registry.require(profile.toolId);
      const runnable =
        envelope.active.visualAgent.enabled &&
        profile.enabled &&
        profile.requestedCapabilities.imageInput &&
        profile.requestedCapabilities.structuredAction;
      return {
        profileId: profile.profileId,
        toolId: profile.toolId,
        displayName: manifest.displayName,
        enabled: profile.enabled,
        endpointLabel: profile.connector.bridgeUrl,
        readiness: (runnable ? 'ready' : 'not_configured') as VisualAgentReadiness,
        maturity: manifest.maturity,
        requestedCapabilities: profile.requestedCapabilities,
        capabilities: profile.requestedCapabilities,
        runnable,
        blockers: runnable
          ? []
          : [
              {
                code: 'visual_agent_not_ready' as const,
                message: '视觉工具还未就绪',
              },
            ],
      };
    });
    const canOperate =
      envelope.active.visualAgent.enabled && profiles.some(item => item.runnable);
    return {
      status: 'ready',
      revision: envelope.revision,
      enabled: envelope.active.visualAgent.enabled,
      activeProfileId: envelope.active.visualAgent.activeProfileId ?? undefined,
      adapters,
      profiles,
      canOperate,
      blocker: canOperate
        ? undefined
        : {code: 'visual_agent_not_ready', message: '视觉工具还未就绪'},
    };
  }

  async setEnabled(
    enabled: boolean,
    expectedRevision: number,
  ): Promise<VisualAgentToolsViewState> {
    await this.repo.compareAndActivate(expectedRevision, current => ({
      ...current,
      visualAgent: {...current.visualAgent, enabled},
    }));
    return this.read();
  }

  async saveProfile(
    draft: VisualAgentProfileDraftInput,
    expectedRevision: number,
  ): Promise<VisualAgentToolsViewState> {
    const profileId = draft.profileId ?? newId('vap');
    const envelope = await this.repo.load();
    const existing = envelope.active.visualAgent.profiles.find(
      item => item.profileId === profileId,
    );
    let secretRef: string | null = existing?.connector.secretRef ?? null;
    if (draft.credential.action === 'replace' && this.credentials) {
      secretRef = `visual:${profileId}`;
      await this.credentials.put(secretRef, draft.credential.plaintext);
    } else if (draft.credential.action === 'remove') {
      secretRef = null;
    }
    const profile: VisualAgentProfileV1 = {
      schemaVersion: 1,
      profileId,
      toolId: draft.toolId,
      enabled: draft.enabled,
      connector: {
        kind: 'connector_bridge',
        bridgeUrl: draft.bridgeUrl,
        bindingId: draft.bindingId,
        secretRef,
      },
      requestedCapabilities: draft.requestedCapabilities,
    };
    await this.repo.compareAndActivate(expectedRevision, current => {
      const rest = current.visualAgent.profiles.filter(item => item.profileId !== profileId);
      return {
        ...current,
        visualAgent: {
          ...current.visualAgent,
          profiles: [...rest, profile],
          activeProfileId: current.visualAgent.activeProfileId ?? profileId,
        },
      };
    });
    return this.read();
  }

  async deleteProfile(
    profileId: string,
    expectedRevision: number,
  ): Promise<VisualAgentToolsViewState> {
    await this.repo.compareAndActivate(expectedRevision, current => ({
      ...current,
      visualAgent: {
        ...current.visualAgent,
        profiles: current.visualAgent.profiles.filter(item => item.profileId !== profileId),
        activeProfileId:
          current.visualAgent.activeProfileId === profileId
            ? null
            : current.visualAgent.activeProfileId,
      },
    }));
    return this.read();
  }

  async setActiveProfile(
    profileId: string,
    expectedRevision: number,
  ): Promise<VisualAgentToolsViewState> {
    await this.repo.compareAndActivate(expectedRevision, current => ({
      ...current,
      visualAgent: {...current.visualAgent, activeProfileId: profileId},
    }));
    return this.read();
  }

  async refreshProfile(_profileId: string): Promise<VisualAgentToolsViewState> {
    return this.read();
  }
}

export class RuntimeErrandPort implements ErrandApplicationPort {
  constructor(private readonly repo: RuntimeConfigRepository) {}

  async read(): Promise<ErrandsViewState> {
    const envelope = await this.repo.load();
    const items = await readJson<ErrandItemViewState[]>(STORAGE_KEYS.ERRANDS, []);
    return {
      status: 'ready',
      enabled: envelope.active.capabilities.errands,
      pendingCount: items.filter(item => item.status === 'pending').length,
      items,
    };
  }

  async setEnabled(enabled: boolean): Promise<ErrandsViewState> {
    const envelope = await this.repo.load();
    await this.repo.compareAndActivate(envelope.revision, current => ({
      ...current,
      capabilities: {...current.capabilities, errands: enabled},
    }));
    return this.read();
  }

  async create(proposal: {title: string; errandType: 'once' | 'schedule'; when?: string}): Promise<string> {
    const id = newId('errand');
    const items = await readJson<ErrandItemViewState[]>(STORAGE_KEYS.ERRANDS, []);
    items.push({
      id,
      title: proposal.title,
      kind: proposal.errandType,
      status: 'pending',
      scheduleLabel: proposal.when ?? '一次',
    });
    await AsyncStorage.setItem(STORAGE_KEYS.ERRANDS, JSON.stringify(items));
    return id;
  }

  async update(item: ErrandItemViewState): Promise<ErrandItemViewState> {
    const items = await readJson<ErrandItemViewState[]>(STORAGE_KEYS.ERRANDS, []);
    const next = items.map(current => (current.id === item.id ? item : current));
    await AsyncStorage.setItem(STORAGE_KEYS.ERRANDS, JSON.stringify(next));
    return item;
  }

  async cancel(id: string): Promise<void> {
    const items = await readJson<ErrandItemViewState[]>(STORAGE_KEYS.ERRANDS, []);
    await AsyncStorage.setItem(
      STORAGE_KEYS.ERRANDS,
      JSON.stringify(
        items.map(item => (item.id === id ? {...item, status: 'cancelled' as const} : item)),
      ),
    );
  }
}

export class RuntimePrivacyPort implements PrivacyApplicationPort {
  constructor(private readonly repo: RuntimeConfigRepository) {}

  async read(): Promise<PrivacyViewState> {
    const envelope = await this.repo.load();
    const canUseVisualAgentMemory =
      envelope.active.visualAgent.enabled &&
      envelope.active.visualAgent.profiles.some(profile => profile.enabled);
    return {
      status: 'ready',
      memoryEnabled: envelope.active.privacy.memoryEnabled,
      memoryLocation: envelope.active.privacy.memoryLocation,
      canUseVisualAgentMemory,
      channels: [
        {
          id: 'companion',
          state: 'remote',
          destinationLabel: '陪伴模型',
          fields: ['说话原文', '回复'],
        },
        {
          id: 'cloud_direct',
          state: envelope.active.modelAPI.agentConfig.activeMode === 'cloud_direct' ? 'remote' : 'blocked',
          destinationLabel: '云端一体',
          fields: ['截图', '指令'],
        },
        {
          id: 'visual_agent',
          state: canUseVisualAgentMemory ? 'remote' : 'blocked',
          destinationLabel: '视觉工具',
          fields: ['截图', '结构化动作'],
        },
      ],
      persistedDiagnosticFields: ['taskId', 'status', 'stepCount'],
    };
  }

  async setMemoryEnabled(enabled: boolean): Promise<PrivacyViewState> {
    const envelope = await this.repo.load();
    await this.repo.compareAndActivate(envelope.revision, current => ({
      ...current,
      privacy: {...current.privacy, memoryEnabled: enabled},
    }));
    return this.read();
  }

  async setMemoryLocation(location: 'device' | 'visual_agent'): Promise<PrivacyViewState> {
    const envelope = await this.repo.load();
    await this.repo.compareAndActivate(envelope.revision, current => ({
      ...current,
      privacy: {...current.privacy, memoryLocation: location},
    }));
    return this.read();
  }

  async forgetAllPreferences(): Promise<PrivacyViewState> {
    await AsyncStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify([]));
    return this.read();
  }
}

export class RuntimeActivityPort implements ActivityApplicationPort {
  constructor(
    private readonly repo: RuntimeConfigRepository,
    private readonly errands: RuntimeErrandPort,
  ) {}

  async read(): Promise<ActivityViewState> {
    const envelope = await this.repo.load();
    const preferences = await readJson<PreferenceViewState[]>(STORAGE_KEYS.PREFERENCES, []);
    const errands = await this.errands.read();
    const tasks = await taskHistoryService.getAllTasks();
    return {
      status: 'ready',
      memoryEnabled: envelope.active.privacy.memoryEnabled,
      memoryLocationLabel:
        envelope.active.privacy.memoryLocation === 'visual_agent' ? '视觉工具' : '仅这台手机',
      preferences,
      errands: errands.items,
      tasks: tasks.map(task => ({
        id: task.id,
        title: task.instruction || task.id,
        status:
          task.status === 'success' || task.status === 'failed' || task.status === 'running'
            ? task.status
            : 'failed',
        createdAtMs: task.createdAt,
        completedAtMs: task.completedAt,
        stepCount: task.output?.steps.length ?? 0,
      })),
    };
  }

  async forgetPreference(id: string): Promise<ActivityViewState> {
    const items = await readJson<PreferenceViewState[]>(STORAGE_KEYS.PREFERENCES, []);
    await AsyncStorage.setItem(
      STORAGE_KEYS.PREFERENCES,
      JSON.stringify(items.filter(item => item.id !== id)),
    );
    return this.read();
  }

  async deleteTask(id: string): Promise<ActivityViewState> {
    await taskHistoryService.deleteTask(id);
    return this.read();
  }
}

export function wireHeadlessOperate(operate: RuntimeOperatePort): void {
  setHeadlessOperateEntry(async identity => {
    await operate.cancel(identity.taskId);
  });
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapSessionBlocker(code: string): UiBlocker {
  if (code.startsWith('visual_agent')) {
    return {code: 'visual_agent_not_ready', message: '视觉工具还未就绪，不能开始操作。'};
  }
  if (code === 'model_profile_secret_missing') {
    return {code: 'credential_unavailable', message: '模型密钥不可用。'};
  }
  if (code.includes('local')) {
    return {code: 'local_model_not_ready', message: '本地视觉模型未就绪。'};
  }
  if (code === 'model_binding_missing') {
    return {code: 'missing_unified_model', message: '尚未配置这次操作要用的模型。'};
  }
  return {code: 'missing_unified_model', message: '现在还不能开始操作。'};
}

function mapOperateEvent(event: OperateTaskEvent): TaskUiEvent | null {
  const base = {
    taskId: event.taskId,
    sessionRevision: event.sessionRevision,
    sequence: event.sequence,
    occurredAtMs: Date.now(),
  };
  switch (event.type) {
    case 'taskStarted':
      return {...base, type: 'started', maxSteps: 1};
    case 'stepStarted':
      return {...base, type: 'step_started', step: event.step, maxSteps: event.maxSteps};
    case 'stepCompleted':
      return {...base, type: 'step_completed', step: event.step, actionLabel: `步骤 ${event.step}`};
    case 'taskCompleted':
      return {...base, type: 'completed', summary: '完成'};
    case 'taskFailed':
      return {
        ...base,
        type: 'failed',
        code: 'operate_failed',
        message: event.error,
        isCancelled: event.isCancelled,
      };
    default:
      return null;
  }
}

async function executeTaskAction(action: TaskAction, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw new Error('operate_task_aborted');
  }
  switch (action.type) {
    case 'click':
      if (action.x != null && action.y != null) {
        await accessibilityService.performClick(action.x, action.y);
      }
      return;
    case 'back':
      await accessibilityService.performBack();
      return;
    case 'home':
      await accessibilityService.performHome();
      return;
    case 'wait':
      return;
    default:
      throw new Error(`unsupported_action:${action.type}`);
  }
}
