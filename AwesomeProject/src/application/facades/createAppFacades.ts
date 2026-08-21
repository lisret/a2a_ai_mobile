// The single application composition root. It is the only application file that
// is allowed to know the concrete `Default*Facade` classes and the core
// registry types; Screens must consume `AppFacades` through the context and
// never import these implementations directly.
//
// `createAppFacades` builds the frozen `AppFacades` graph from an explicit set
// of application ports. There is no service locator: every dependency is
// injected. `projectVisualAgentToolOptions` is a pure projection over the
// canonical built-in registry manifest — it copies each declared capability
// field verbatim and never widens a capability to `true`.
import type {
  VisualAgentToolId,
  VisualAgentToolRegistry,
} from '../../core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import {DefaultActivityFacade} from './ActivityFacade';
import {DefaultCompanionFacade} from './CompanionFacade';
import {DefaultErrandFacade} from './ErrandFacade';
import {DefaultModelConfigFacade} from './ModelConfigFacade';
import {DefaultOperateFacade} from './OperateFacade';
import {DefaultPhoneOperateFacade} from './PhoneOperateFacade';
import {DefaultPrivacyFacade} from './PrivacyFacade';
import {DefaultVisualAgentToolsFacade} from './VisualAgentToolsFacade';
import type {
  ActivityApplicationPort,
  AppFacades,
  CompanionApplicationPort,
  ErrandApplicationPort,
  ModelConfigApplicationPort,
  OperateApplicationPort,
  PhoneOperateApplicationPort,
  PrivacyApplicationPort,
  TaskUiEventSource,
  VisualAgentReadiness,
  VisualAgentToolOptionViewState,
  VisualAgentToolsApplicationPort,
} from './UiRuntimeContracts';

export interface AppFacadePorts {
  readonly operate: OperateApplicationPort;
  readonly operateEvents: TaskUiEventSource;
  readonly companion: CompanionApplicationPort;
  readonly phoneOperate: PhoneOperateApplicationPort;
  readonly visualAgentTools: VisualAgentToolsApplicationPort;
  readonly modelConfig: ModelConfigApplicationPort;
  readonly errands: ErrandApplicationPort;
  readonly privacy: PrivacyApplicationPort;
  readonly activity: ActivityApplicationPort;
}

export function createAppFacades(ports: AppFacadePorts): AppFacades {
  return {
    operate: new DefaultOperateFacade(ports.operate, ports.operateEvents),
    companion: new DefaultCompanionFacade(ports.companion),
    phoneOperate: new DefaultPhoneOperateFacade(ports.phoneOperate),
    visualAgentTools: new DefaultVisualAgentToolsFacade(ports.visualAgentTools),
    modelConfig: new DefaultModelConfigFacade(ports.modelConfig),
    errands: new DefaultErrandFacade(ports.errands),
    privacy: new DefaultPrivacyFacade(ports.privacy),
    activity: new DefaultActivityFacade(ports.activity),
  };
}

export interface VisualAgentToolStatus {
  readonly readiness: VisualAgentReadiness;
  readonly configuredProfileCount: number;
}

const DEFAULT_TOOL_STATUS: VisualAgentToolStatus = {
  readiness: 'not_configured',
  configuredProfileCount: 0,
};

export function projectVisualAgentToolOptions(
  registry: VisualAgentToolRegistry,
  statusByTool: ReadonlyMap<VisualAgentToolId, VisualAgentToolStatus>,
): readonly VisualAgentToolOptionViewState[] {
  return registry.list().map(toolId => {
    const {manifest} = registry.require(toolId);
    const status = statusByTool.get(toolId) ?? DEFAULT_TOOL_STATUS;
    const declared = manifest.declaredCapabilities;
    return {
      toolId,
      builtIn: !toolId.startsWith('custom:'),
      label: manifest.displayName,
      readiness: status.readiness,
      maturity: manifest.maturity,
      capabilities: {
        imageInput: declared.imageInput,
        structuredAction: declared.structuredAction,
        stream: declared.stream,
        cancel: declared.cancel,
        approval: declared.approval,
        resume: declared.resume,
        steer: declared.steer,
        preferences: declared.preferences,
      },
      configuredProfileCount: status.configuredProfileCount,
    };
  });
}

// Production ports are still unwired at this Wave-1 composition checkpoint: the
// runtime-backed adapters are introduced by the serial Task 6-Task 10 screen
// integration. Until then the sole production graph exposes loud, non-silent
// ports so no Screen accidentally binds to a fake success response.
const PORT_NOT_WIRED = 'app_facade_port_not_wired';

const notWired = (): never => {
  throw new Error(PORT_NOT_WIRED);
};

const productionPorts: AppFacadePorts = {
  operate: {
    getCurrent: notWired,
    start: notWired,
    cancel: notWired,
  },
  operateEvents: {
    subscribe: notWired,
  },
  companion: {
    getState: notWired,
    submitTranscript: notWired,
    confirmProposal: notWired,
    dismissTurn: notWired,
  },
  phoneOperate: {
    read: notWired,
    setDraft: notWired,
    activate: notWired,
    setAdbFallback: notWired,
  },
  visualAgentTools: {
    read: notWired,
    setEnabled: notWired,
    saveProfile: notWired,
    deleteProfile: notWired,
    setActiveProfile: notWired,
    refreshProfile: notWired,
  },
  modelConfig: {
    read: notWired,
    readList: notWired,
    fetchCatalog: notWired,
    save: notWired,
    selectBinding: notWired,
    deleteBinding: notWired,
  },
  errands: {
    read: notWired,
    setEnabled: notWired,
    create: notWired,
    update: notWired,
    cancel: notWired,
  },
  privacy: {
    read: notWired,
    setMemoryEnabled: notWired,
    setMemoryLocation: notWired,
    forgetAllPreferences: notWired,
  },
  activity: {
    read: notWired,
    forgetPreference: notWired,
    deleteTask: notWired,
  },
};

export const appFacades: AppFacades = createAppFacades(productionPorts);
