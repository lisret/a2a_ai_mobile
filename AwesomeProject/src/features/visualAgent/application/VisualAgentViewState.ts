// UI-neutral Visual Agent view state (capability-domain Task 12). It exposes
// only generic tool/profile/capability/connection data and a generic blocker.
// It deliberately excludes the bridge URL, secret ref, upstream protocol/config,
// image, frame, and raw error — nothing here can leak a credential or a product
// transport detail to the UI.
import type {
  VisualAgentCapabilitySet,
  VisualAgentConnectionState,
  VisualAgentErrorCode,
  VisualAgentToolId,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import type {VisualAgentProfileProjectionV1} from './VisualAgentProfileController';

export interface VisualAgentViewState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly enabled: boolean;
  readonly activeProfile: VisualAgentProfileProjectionV1 | null;
  readonly activeProfileId: string | null;
  readonly activeToolId: VisualAgentToolId | null;
  readonly connection: VisualAgentConnectionState['status'];
  readonly negotiatedCapabilities: VisualAgentCapabilitySet | null;
  readonly canExecute: boolean;
  readonly blocker?: {readonly code: VisualAgentErrorCode; readonly message: string};
}
