// Frozen V1 runtime configuration contracts (runtime-foundation Task 4B `Produces`).
// Independent model and visual-agent groups; atomic `compareAndActivate`; opaque retirement refs only.
import type {AgentConfigV2} from '../../agentRuntime/domain';
import type {
  ModelBindingV1,
  ModelEndpointProfileRepository,
  ModelEndpointProfileV1,
} from '../model/ModelProviderContracts';
import type {VisualAgentProfileV1} from '../visualAgent/VisualAgentContracts';

export interface RuntimeRouteConfigV1 {
  readonly capabilities: Readonly<{
    phoneOperate: boolean;
    errands: boolean;
  }>;
  readonly privacy: Readonly<{
    memoryEnabled: boolean;
    memoryLocation: 'device' | 'visual_agent';
    memoryProfileId: string | null;
  }>;
  readonly modelAPI: Readonly<{
    agentConfig: Readonly<AgentConfigV2>;
    profiles: readonly ModelEndpointProfileV1[];
    bindings: readonly ModelBindingV1[];
  }>;
  readonly visualAgent: Readonly<{
    enabled: boolean;
    activeProfileId: string | null;
    profiles: readonly VisualAgentProfileV1[];
  }>;
}

export interface RuntimeConfigEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly active: RuntimeRouteConfigV1;
  readonly draft: RuntimeRouteConfigV1;
}

export interface RuntimeConfigRepository extends ModelEndpointProfileRepository {
  load(): Promise<RuntimeConfigEnvelopeV1>;
  mutateDraft(
    mutation: (draft: RuntimeRouteConfigV1) => RuntimeRouteConfigV1,
  ): Promise<RuntimeConfigEnvelopeV1>;
  activateDraft(expectedRevision: number): Promise<RuntimeConfigEnvelopeV1>;
  compareAndActivate(
    expectedRevision: number,
    mutation: (active: RuntimeRouteConfigV1) => RuntimeRouteConfigV1,
  ): Promise<RuntimeConfigEnvelopeV1>;
}

export interface CredentialRetirementRecordV1 {
  readonly schemaVersion: 1;
  readonly retirementId: string;
  readonly state: 'staged' | 'committed';
  readonly oldSecretRef: string | null;
  readonly replacementSecretRef: string | null;
  readonly createdAtMs: number;
}

export interface CredentialRetirementRepository {
  stage(
    input: Omit<CredentialRetirementRecordV1, 'schemaVersion' | 'state'>,
  ): Promise<void>;
  commit(retirementId: string): Promise<void>;
  rollback(retirementId: string): Promise<void>;
  list(): Promise<readonly CredentialRetirementRecordV1[]>;
  complete(retirementId: string): Promise<void>;
}
