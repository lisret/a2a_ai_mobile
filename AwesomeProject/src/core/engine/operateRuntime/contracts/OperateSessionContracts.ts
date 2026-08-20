// Frozen V1 immutable operate-session contracts (runtime-foundation Task 6 `Produces`).
// Resolved snapshot types plus the session lease. No garbage-collector implementation here.
import type {
  ModelRole,
  ProviderExecutionTargetV1,
} from '../model/ModelProviderContracts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentProfileV1,
  VisualAgentToolId,
} from '../visualAgent/VisualAgentContracts';

export interface ResolvedModelBindingSnapshotV1 extends ProviderExecutionTargetV1 {
  readonly role: ModelRole;
  readonly bindingId: string;
  readonly profileId: string;
  readonly modelId: string;
  readonly maxSteps: number;
}

export interface ResolvedVisualAgentSnapshotV1 {
  readonly profileId: string;
  readonly toolId: VisualAgentToolId;
  readonly connector: Readonly<VisualAgentProfileV1['connector']>;
  readonly negotiatedCapabilities: Readonly<VisualAgentCapabilitySet>;
}

export interface ResolvedOperateSessionV1 {
  readonly schemaVersion: 1;
  readonly taskId: string;
  readonly sessionRevision: number;
  readonly configRevision: number;
  readonly channel:
    | 'cloud_direct'
    | 'cloud_split'
    | 'local_vision_cloud_planner'
    | 'visual_agent';
  readonly modelBindings: Readonly<{
    direct?: ResolvedModelBindingSnapshotV1;
    vision?: ResolvedModelBindingSnapshotV1;
    planner?: ResolvedModelBindingSnapshotV1;
  }>;
  readonly localModelId?: 'minicpm-v-4.6-q4';
  readonly visualAgent?: ResolvedVisualAgentSnapshotV1;
  readonly createdAtMs: number;
}

export type OperateSessionOwner = 'foreground' | 'headless';

export interface OperateSessionLease {
  readonly session: ResolvedOperateSessionV1;
  readonly owner: OperateSessionOwner;
  readonly signal: AbortSignal;
  cancel(reason?: string): boolean;
  markTerminal(kind: 'success' | 'failed' | 'cancelled'): Promise<boolean>;
  release(): Promise<void>;
}
