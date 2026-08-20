import type {AgentModeId, ModelListKey} from '../../shared/types/Model';
import type {
  ProviderAuthV1,
  ProviderCapabilityDeclarationV1,
  ProviderPresetV1,
  ProviderProtocolV1,
} from '../../core/engine/operateRuntime/model/ModelProviderContracts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentToolId,
} from '../../core/engine/operateRuntime/visualAgent/VisualAgentContracts';

export type Unsubscribe = () => void;

export type UiBlockerCode =
  | 'phone_operate_disabled'
  | 'missing_unified_model'
  | 'missing_split_vision_model'
  | 'missing_split_planner_model'
  | 'missing_local_planner_model'
  | 'local_model_not_ready'
  | 'credential_unavailable'
  | 'accessibility_disabled'
  | 'visual_agent_not_ready'
  | 'visual_agent_capability_missing'
  | 'config_revision_conflict'
  | 'companion_model_missing';

export interface UiBlocker {
  code: UiBlockerCode;
  message: string;
}

export interface ModeOptionViewState {
  id: AgentModeId;
  label: string;
  nodes: readonly string[];
  caption: string;
  runnable: boolean;
  blockers: readonly UiBlocker[];
}

export interface PhoneOperateViewState {
  status: 'loading' | 'ready' | 'error';
  revision: number;
  activeMode: AgentModeId;
  draftMode: AgentModeId;
  modes: Record<AgentModeId, ModeOptionViewState>;
  adbFallbackEnabled: boolean;
  errorMessage?: string;
}

export type BuiltInVisualAgentToolId = Exclude<VisualAgentToolId, `custom:${string}`>;
export type VisualAgentReadiness =
  | 'not_configured'
  | 'connecting'
  | 'ready'
  | 'disconnected'
  | 'unsupported'
  | 'error';
export type VisualAgentMaturity = 'stable' | 'beta' | 'experimental';

export interface VisualAgentProfileViewState {
  profileId: string;
  toolId: VisualAgentToolId;
  displayName: string;
  enabled: boolean;
  endpointLabel: string;
  readiness: VisualAgentReadiness;
  maturity: VisualAgentMaturity;
  requestedCapabilities: Readonly<VisualAgentCapabilitySet>;
  capabilities: Readonly<VisualAgentCapabilitySet>;
  runnable: boolean;
  blockers: readonly UiBlocker[];
}

export interface VisualAgentToolOptionViewState {
  toolId: VisualAgentToolId;
  builtIn: boolean;
  label: string;
  readiness: VisualAgentReadiness;
  maturity: VisualAgentMaturity;
  capabilities: Readonly<VisualAgentCapabilitySet>;
  configuredProfileCount: number;
}

export interface VisualAgentToolsViewState {
  status: 'loading' | 'ready' | 'error';
  revision: number;
  enabled: boolean;
  activeProfileId?: string;
  adapters: readonly VisualAgentToolOptionViewState[];
  profiles: readonly VisualAgentProfileViewState[];
  canOperate: boolean;
  blocker?: UiBlocker;
  errorMessage?: string;
}

export type ModelConfigMode = 'preset' | 'custom';
export type ProviderPresetId = ProviderPresetV1;
export type ModelCatalogStatus =
  | 'loading'
  | 'ready'
  | 'unsupported'
  | 'auth_failed'
  | 'network_failed'
  | 'empty'
  | 'stale';
export type CredentialEditIntent =
  | {action: 'keep'}
  | {action: 'replace'; plaintext: string}
  | {action: 'remove'};

export interface VisualAgentProfileDraftInput {
  profileId?: string;
  toolId: VisualAgentToolId;
  enabled: boolean;
  bridgeUrl: string;
  bindingId: string;
  credential: CredentialEditIntent;
  requestedCapabilities: VisualAgentCapabilitySet;
}

export interface ProviderPresetViewState {
  id: ProviderPresetId;
  label: string;
  maturity: 'stable' | 'beta' | 'compatibility';
  catalogSupported: boolean;
}

export interface ModelCatalogViewState {
  requestGeneration: number;
  status: ModelCatalogStatus;
  models: readonly {id: string; label: string}[];
  fetchedAtMs?: number;
  message?: string;
}

export interface CustomProviderConfigViewState {
  providerLabel: string;
  baseUrl: string;
  protocol: ProviderProtocolV1;
  auth: ProviderAuthV1;
  chatPath: string;
  modelListPath: string | null;
  declaredCapabilities: ProviderCapabilityDeclarationV1;
  capabilityTrust: 'user_declared_unverified';
}

export interface ModelConfigViewState {
  status: 'loading' | 'ready' | 'error';
  revision: number;
  mode: ModelConfigMode;
  selectedPresetId?: ProviderPresetId;
  presets: readonly ProviderPresetViewState[];
  providerLabel: string;
  baseUrl: string;
  custom?: CustomProviderConfigViewState;
  modelId: string;
  credential: {state: 'ready' | 'missing' | 'unavailable'; maskedLabel?: string};
  catalog: ModelCatalogViewState;
  errorMessage?: string;
}

export interface ModelConfigListItemViewState {
  bindingId: string;
  endpointProfileId: string;
  displayName: string;
  providerLabel: string;
  modelId: string;
  mode: ModelConfigMode;
  selected: boolean;
}

export interface ModelConfigListViewState {
  status: 'loading' | 'ready' | 'error';
  revision: number;
  list: ModelListKey;
  items: readonly ModelConfigListItemViewState[];
  errorMessage?: string;
}

interface ModelConfigCommandBase {
  list: ModelListKey;
  bindingId?: string;
  selectedModelId: string;
  credential: CredentialEditIntent;
}

export type ModelConfigSaveInput =
  | (ModelConfigCommandBase & {
      expectedRevision: number;
      mode: 'preset';
      presetId: ProviderPresetId;
      baseUrlOverride: string | null;
    })
  | (ModelConfigCommandBase & {
      expectedRevision: number;
      mode: 'custom';
      customProviderLabel: string;
      baseUrl: string;
      protocol: ProviderProtocolV1;
      auth: ProviderAuthV1;
      chatPath: string;
      modelListPath: string | null;
      declaredCapabilities: ProviderCapabilityDeclarationV1;
    });

interface ModelCatalogRefreshBase {
  list: ModelListKey;
  bindingId?: string;
  requestGeneration: number;
  credential: Extract<CredentialEditIntent, {action: 'keep' | 'replace'}>;
}

export type ModelCatalogRefreshInput =
  | (ModelCatalogRefreshBase & {
      mode: 'preset';
      presetId: ProviderPresetId;
      baseUrlOverride: string | null;
    })
  | (ModelCatalogRefreshBase & {
      mode: 'custom';
      customProviderLabel: string;
      baseUrl: string;
      protocol: ProviderProtocolV1;
      auth: ProviderAuthV1;
      chatPath: string;
      modelListPath: string | null;
      declaredCapabilities: ProviderCapabilityDeclarationV1;
    });

export interface ErrandItemViewState {
  id: string;
  title: string;
  kind: 'once' | 'schedule';
  status: 'pending' | 'leased' | 'failed' | 'completed' | 'cancelled';
  scheduleLabel: string;
  nextDueAtMs?: number;
  lastRunAtMs?: number;
  errorMessage?: string;
}

export interface ErrandsViewState {
  status: 'loading' | 'ready' | 'error';
  enabled: boolean;
  pendingCount: number;
  items: readonly ErrandItemViewState[];
  errorMessage?: string;
}

export interface PrivacyChannelViewState {
  id: 'companion' | 'cloud_direct' | 'cloud_split' | 'local_vision' | 'visual_agent';
  state: 'local' | 'remote' | 'blocked';
  destinationLabel: string;
  fields: readonly string[];
}

export interface PrivacyViewState {
  status: 'loading' | 'ready' | 'error';
  memoryEnabled: boolean;
  memoryLocation: 'device' | 'visual_agent';
  canUseVisualAgentMemory: boolean;
  channels: readonly PrivacyChannelViewState[];
  persistedDiagnosticFields: readonly string[];
  errorMessage?: string;
}

export interface PreferenceViewState {
  id: string;
  kind: 'name' | 'preference';
  title: string;
  body?: string;
}

export interface ActivityTaskViewState {
  id: string;
  title: string;
  status: 'running' | 'success' | 'failed';
  createdAtMs: number;
  completedAtMs?: number;
  stepCount: number;
}

export interface ActivityViewState {
  status: 'loading' | 'ready' | 'error';
  memoryEnabled: boolean;
  memoryLocationLabel: string;
  preferences: readonly PreferenceViewState[];
  errands: readonly ErrandItemViewState[];
  tasks: readonly ActivityTaskViewState[];
  errorMessage?: string;
}

export type CompanionProposal =
  | {kind: 'preference'; title: string; body?: string}
  | {kind: 'errand'; title: string; errandType: 'once' | 'schedule'; when?: string};

export interface CompanionTurnViewState {
  id: string;
  transcript: string;
  reply: string;
  intent: 'companion' | 'operate' | 'preference' | 'errand' | 'ambiguous';
  proposal?: CompanionProposal;
}

export interface CompanionViewState {
  phase: 'idle' | 'listening' | 'thinking' | 'ready' | 'error';
  modelLabel?: string;
  partialText?: string;
  turn?: CompanionTurnViewState;
  errorMessage?: string;
}

export interface TaskStepViewState {
  step: number;
  actionLabel: string;
  occurredAtMs: number;
}

export interface OperateTaskViewState {
  phase: 'idle' | 'starting' | 'running' | 'success' | 'failed' | 'cancelled' | 'blocked';
  taskId?: string;
  sessionRevision?: number;
  instruction?: string;
  currentStep?: number;
  maxSteps?: number;
  steps: readonly TaskStepViewState[];
  visualAgentProfileSnapshot?: {
    profileId: string;
    sourceConfigRevision: number;
    toolId: VisualAgentToolId;
    capabilities: Readonly<VisualAgentCapabilitySet>;
  };
  blocker?: UiBlocker;
  errorMessage?: string;
}

interface TaskUiEventBase {
  taskId: string;
  sessionRevision: number;
  sequence: number;
  occurredAtMs: number;
}

export type TaskUiEvent =
  | (TaskUiEventBase & {type: 'started'; maxSteps: number})
  | (TaskUiEventBase & {type: 'step_started'; step: number; maxSteps: number})
  | (TaskUiEventBase & {type: 'step_completed'; step: number; actionLabel: string})
  | (TaskUiEventBase & {type: 'completed'; summary: string})
  | (TaskUiEventBase & {type: 'failed'; code: string; message: string; isCancelled: boolean});

export type StartOperateResult =
  | {
      kind: 'started';
      taskId: string;
      sessionRevision: number;
      visualAgentProfileSnapshot?: OperateTaskViewState['visualAgentProfileSnapshot'];
    }
  | {kind: 'blocked'; blocker: UiBlocker};

export interface OperateFacade {
  getViewState(): Promise<OperateTaskViewState>;
  start(instruction: string): Promise<StartOperateResult>;
  cancel(taskId: string): Promise<void>;
  subscribeTask(
    taskId: string,
    sessionRevision: number,
    listener: (event: TaskUiEvent) => void,
  ): Unsubscribe;
}

export interface CompanionFacade {
  getViewState(): Promise<CompanionViewState>;
  submitTranscript(text: string): Promise<CompanionTurnViewState>;
  confirmProposal(turnId: string): Promise<void>;
  dismissTurn(turnId: string): Promise<void>;
}

export interface PhoneOperateFacade {
  getViewState(): Promise<PhoneOperateViewState>;
  selectDraftMode(mode: AgentModeId): Promise<PhoneOperateViewState>;
  activateDraftMode(expectedRevision: number): Promise<PhoneOperateViewState>;
  setAdbFallbackEnabled(enabled: boolean): Promise<PhoneOperateViewState>;
}

export interface VisualAgentToolsFacade {
  getViewState(): Promise<VisualAgentToolsViewState>;
  setEnabled(enabled: boolean, expectedRevision: number): Promise<VisualAgentToolsViewState>;
  saveProfile(
    profile: VisualAgentProfileDraftInput,
    expectedRevision: number,
  ): Promise<VisualAgentToolsViewState>;
  deleteProfile(profileId: string, expectedRevision: number): Promise<VisualAgentToolsViewState>;
  setActiveProfile(profileId: string, expectedRevision: number): Promise<VisualAgentToolsViewState>;
  refreshProfile(profileId: string): Promise<VisualAgentToolsViewState>;
}

export interface ModelConfigFacade {
  getListViewState(list: ModelListKey): Promise<ModelConfigListViewState>;
  getViewState(input: {list: ModelListKey; bindingId?: string}): Promise<ModelConfigViewState>;
  refreshCatalog(input: ModelCatalogRefreshInput): Promise<ModelCatalogViewState>;
  save(input: ModelConfigSaveInput): Promise<ModelConfigViewState>;
  selectBinding(input: {list: ModelListKey; bindingId: string; expectedRevision: number}): Promise<ModelConfigListViewState>;
  deleteBinding(input: {list: ModelListKey; bindingId: string; expectedRevision: number}): Promise<ModelConfigListViewState>;
}

export interface ErrandFacade {
  getViewState(): Promise<ErrandsViewState>;
  setEnabled(enabled: boolean): Promise<ErrandsViewState>;
  createFromProposal(proposal: Extract<CompanionProposal, {kind: 'errand'}>): Promise<string>;
  update(item: ErrandItemViewState): Promise<ErrandItemViewState>;
  cancel(id: string): Promise<void>;
}

export interface PrivacyFacade {
  getViewState(): Promise<PrivacyViewState>;
  setMemoryEnabled(enabled: boolean): Promise<PrivacyViewState>;
  setMemoryLocation(location: 'device' | 'visual_agent'): Promise<PrivacyViewState>;
  forgetAllPreferences(): Promise<PrivacyViewState>;
}

export interface ActivityFacade {
  getViewState(): Promise<ActivityViewState>;
  forgetPreference(id: string): Promise<ActivityViewState>;
  deleteTask(id: string): Promise<ActivityViewState>;
}

export interface AppFacades {
  operate: OperateFacade;
  companion: CompanionFacade;
  phoneOperate: PhoneOperateFacade;
  visualAgentTools: VisualAgentToolsFacade;
  modelConfig: ModelConfigFacade;
  errands: ErrandFacade;
  privacy: PrivacyFacade;
  activity: ActivityFacade;
}

// Frozen Wave-0 application ports. Later workers implement/consume these names;
// they must not redeclare them beside an individual Facade implementation.
export interface OperateApplicationPort {
  getCurrent(): Promise<OperateTaskViewState>;
  start(instruction: string): Promise<StartOperateResult>;
  cancel(taskId: string): Promise<void>;
}

export interface TaskUiEventSource {
  subscribe(listener: (event: TaskUiEvent) => void): Unsubscribe;
}

export interface CompanionApplicationPort {
  getState(): Promise<CompanionViewState>;
  submitTranscript(text: string): Promise<CompanionTurnViewState>;
  confirmProposal(turnId: string): Promise<void>;
  dismissTurn(turnId: string): Promise<void>;
}

export interface PhoneOperateApplicationPort {
  read(): Promise<PhoneOperateViewState>;
  setDraft(mode: AgentModeId): Promise<PhoneOperateViewState>;
  activate(mode: AgentModeId, expectedRevision: number): Promise<PhoneOperateViewState>;
  setAdbFallback(enabled: boolean): Promise<PhoneOperateViewState>;
}

export interface VisualAgentToolsApplicationPort {
  read(): Promise<VisualAgentToolsViewState>;
  setEnabled(enabled: boolean, expectedRevision: number): Promise<VisualAgentToolsViewState>;
  saveProfile(profile: VisualAgentProfileDraftInput, expectedRevision: number): Promise<VisualAgentToolsViewState>;
  deleteProfile(profileId: string, expectedRevision: number): Promise<VisualAgentToolsViewState>;
  setActiveProfile(profileId: string, expectedRevision: number): Promise<VisualAgentToolsViewState>;
  refreshProfile(profileId: string): Promise<VisualAgentToolsViewState>;
}

export interface ModelConfigApplicationPort {
  read(input: {list: ModelListKey; bindingId?: string}): Promise<ModelConfigViewState>;
  readList(list: ModelListKey): Promise<ModelConfigListViewState>;
  fetchCatalog(input: ModelCatalogRefreshInput): Promise<ModelCatalogViewState>;
  save(input: ModelConfigSaveInput): Promise<ModelConfigViewState>;
  selectBinding(input: {list: ModelListKey; bindingId: string; expectedRevision: number}): Promise<ModelConfigListViewState>;
  deleteBinding(input: {list: ModelListKey; bindingId: string; expectedRevision: number}): Promise<ModelConfigListViewState>;
}

export interface PrivacyApplicationPort {
  read(): Promise<PrivacyViewState>;
  setMemoryEnabled(enabled: boolean): Promise<PrivacyViewState>;
  setMemoryLocation(location: 'device' | 'visual_agent'): Promise<PrivacyViewState>;
  forgetAllPreferences(): Promise<PrivacyViewState>;
}

export interface ErrandApplicationPort {
  read(): Promise<ErrandsViewState>;
  setEnabled(enabled: boolean): Promise<ErrandsViewState>;
  create(proposal: Extract<CompanionProposal, {kind: 'errand'}>): Promise<string>;
  update(item: ErrandItemViewState): Promise<ErrandItemViewState>;
  cancel(id: string): Promise<void>;
}

export interface ActivityApplicationPort {
  read(): Promise<ActivityViewState>;
  forgetPreference(id: string): Promise<ActivityViewState>;
  deleteTask(id: string): Promise<ActivityViewState>;
}
