// Public Visual Agent barrel (capability-domain Task 12). It exposes the
// UI-narrow Facade and its ViewState, and re-exports — type-only — the nine
// frozen primary Visual Agent contracts owned by Runtime Wave 1 Task 4B plus the
// supporting manifest and run-status types. It exports no implementation class,
// mutable register, transport, binding, or conformance fixture, and there is no
// `features/openclaw` barrel.
export {VisualAgentFacade} from './application/VisualAgentFacade';
export type {VisualAgentViewState} from './application/VisualAgentViewState';
export type {
  VisualAgentToolId,
  VisualAgentProfileV1,
  VisualAgentCapabilitySet,
  VisualAgentToolManifestV1,
  VisualAgentTaskEnvelopeV1,
  VisualAgentConnectionState,
  VisualAgentRunStatus,
  VisualAgentProtocolV1,
  VisualAgentToolAdapter,
  VisualAgentExecutionPort,
  VisualAgentToolRegistry,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
