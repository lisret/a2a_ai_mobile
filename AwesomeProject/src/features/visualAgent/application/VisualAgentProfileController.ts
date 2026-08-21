// Generic Visual Agent profile controller (Wave 2A Task 8). Reads the
// already-migrated current-schema `RuntimeConfigEnvelopeV1`; owns no
// migration, legacy key reader, binding port, or retry logic of its own.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {IdGenerator} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {CredentialStore} from '@core/engine/operateRuntime/contracts/CredentialStore';
import type {
  CredentialRetirementRepository,
  RuntimeConfigEnvelopeV1,
  RuntimeConfigRepository,
} from '@core/engine/operateRuntime/contracts/RuntimeConfigContracts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentProfileV1,
  VisualAgentToolId,
  VisualAgentToolRegistry,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

export interface VisualAgentProfileDraftV1 {
  readonly expectedRevision: number;
  readonly profileId?: string;
  readonly toolId: VisualAgentToolId;
  readonly enabled: boolean;
  readonly bridgeUrl: string;
  readonly bindingId: string;
  readonly credential:
    | {readonly action: 'keep'}
    | {readonly action: 'replace'; readonly plaintext: string}
    | {readonly action: 'remove'};
  readonly requestedCapabilities: VisualAgentCapabilitySet;
}

export interface VisualAgentProfileProjectionV1 {
  readonly profileId: string;
  readonly toolId: VisualAgentToolId;
  readonly connectorRef: {
    readonly kind: 'connector_bridge';
    readonly bindingId: string;
  };
}

const CAPABILITY_KEYS = [
  'imageInput',
  'structuredAction',
  'stream',
  'cancel',
  'approval',
  'resume',
  'steer',
  'preferences',
] as const;

const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;
const SECRET_REF_PREFIX = 'visual-agent:';

function invalidProfile(): never {
  throw new CapabilityError('visual_agent_invalid_profile');
}

function assertCapabilitySet(value: VisualAgentCapabilitySet): void {
  for (const key of CAPABILITY_KEYS) {
    if (typeof value[key] !== 'boolean') {
      invalidProfile();
    }
  }
}

function assertBridgeUrl(value: string): void {
  if (typeof value !== 'string') {
    invalidProfile();
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalidProfile();
  }
  if (url.username || url.password || url.hash) {
    invalidProfile();
  }
  if (url.protocol !== 'https:' && url.protocol !== 'wss:') {
    invalidProfile();
  }
}

function normalizeId(value: string): string {
  if (typeof value !== 'string') {
    invalidProfile();
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 128 || CONTROL_CHAR_PATTERN.test(trimmed)) {
    invalidProfile();
  }
  return trimmed;
}

function upsertProfile(
  profiles: readonly VisualAgentProfileV1[],
  next: VisualAgentProfileV1,
): readonly VisualAgentProfileV1[] {
  const index = profiles.findIndex(item => item.profileId === next.profileId);
  if (index === -1) {
    return [...profiles, next];
  }
  const copy = [...profiles];
  copy[index] = next;
  return copy;
}

export class VisualAgentProfileController {
  constructor(
    private readonly runtimeConfig: RuntimeConfigRepository,
    private readonly credentials: CredentialStore,
    private readonly retirements: CredentialRetirementRepository,
    private readonly registry: VisualAgentToolRegistry,
    private readonly ids: IdGenerator,
  ) {}

  async list(): Promise<readonly VisualAgentProfileV1[]> {
    const envelope = await this.runtimeConfig.load();
    return envelope.active.visualAgent.profiles;
  }

  async readActiveProjection(): Promise<VisualAgentProfileProjectionV1 | null> {
    const envelope = await this.runtimeConfig.load();
    const activeProfileId = envelope.active.visualAgent.activeProfileId;
    if (activeProfileId === null) {
      return null;
    }
    const profile = envelope.active.visualAgent.profiles.find(
      item => item.profileId === activeProfileId,
    );
    if (!profile) {
      return null;
    }
    return {
      profileId: profile.profileId,
      toolId: profile.toolId,
      connectorRef: {kind: 'connector_bridge', bindingId: profile.connector.bindingId},
    };
  }

  async save(input: VisualAgentProfileDraftV1): Promise<VisualAgentProfileV1> {
    assertBridgeUrl(input.bridgeUrl);
    const bindingId = normalizeId(input.bindingId);
    assertCapabilitySet(input.requestedCapabilities);
    this.registry.require(input.toolId);

    const isCreate = input.profileId === undefined;
    if (isCreate && input.credential.action === 'keep') {
      invalidProfile();
    }
    if (input.credential.action === 'replace' && input.credential.plaintext.trim().length === 0) {
      invalidProfile();
    }

    const envelope = await this.runtimeConfig.load();
    let profileId: string;
    let existing: VisualAgentProfileV1 | undefined;
    if (isCreate) {
      profileId = this.ids.next();
    } else {
      profileId = normalizeId(input.profileId as string);
      existing = envelope.active.visualAgent.profiles.find(item => item.profileId === profileId);
      if (!existing) {
        invalidProfile();
      }
    }

    const oldSecretRef = existing?.connector.secretRef ?? null;
    let secretRef: string | null;
    let retirementId: string | null = null;

    if (input.credential.action === 'keep') {
      secretRef = oldSecretRef;
    } else if (input.credential.action === 'remove') {
      secretRef = null;
      if (oldSecretRef !== null) {
        retirementId = this.ids.next();
        await this.retirements.stage({
          retirementId,
          oldSecretRef,
          replacementSecretRef: null,
          createdAtMs: Date.now(),
        });
      }
    } else {
      const newSecretRef = `${SECRET_REF_PREFIX}${this.ids.next()}`;
      retirementId = this.ids.next();
      await this.retirements.stage({
        retirementId,
        oldSecretRef,
        replacementSecretRef: newSecretRef,
        createdAtMs: Date.now(),
      });
      try {
        await this.credentials.put(newSecretRef, input.credential.plaintext);
        const readback = await this.credentials.get(newSecretRef);
        if (readback !== input.credential.plaintext) {
          throw new CapabilityError('visual_agent_execution_failed');
        }
      } catch (error) {
        await this.rollbackNewSecret(newSecretRef, retirementId);
        throw error;
      }
      secretRef = newSecretRef;
    }

    const nextProfile: VisualAgentProfileV1 = {
      schemaVersion: 1,
      profileId,
      toolId: input.toolId,
      enabled: input.enabled,
      connector: {kind: 'connector_bridge', bridgeUrl: input.bridgeUrl, bindingId, secretRef},
      requestedCapabilities: input.requestedCapabilities,
    };

    try {
      await this.runtimeConfig.compareAndActivate(input.expectedRevision, active => ({
        ...active,
        visualAgent: {
          ...active.visualAgent,
          profiles: upsertProfile(active.visualAgent.profiles, nextProfile),
        },
      }));
    } catch (error) {
      if (retirementId) {
        if (input.credential.action === 'replace') {
          await this.rollbackNewSecret(secretRef as string, retirementId);
        } else {
          await this.retirements.rollback(retirementId);
        }
      }
      throw error;
    }

    if (retirementId) {
      await this.retirements.commit(retirementId);
    }

    return nextProfile;
  }

  async remove(profileId: string, expectedRevision: number): Promise<RuntimeConfigEnvelopeV1> {
    const envelope = await this.runtimeConfig.load();
    const existing = envelope.active.visualAgent.profiles.find(
      item => item.profileId === profileId,
    );
    if (!existing) {
      invalidProfile();
    }

    const oldSecretRef = existing.connector.secretRef;
    let retirementId: string | null = null;
    if (oldSecretRef !== null) {
      retirementId = this.ids.next();
      await this.retirements.stage({
        retirementId,
        oldSecretRef,
        replacementSecretRef: null,
        createdAtMs: Date.now(),
      });
    }

    try {
      const next = await this.runtimeConfig.compareAndActivate(expectedRevision, active => ({
        ...active,
        visualAgent: {
          ...active.visualAgent,
          activeProfileId:
            active.visualAgent.activeProfileId === profileId
              ? null
              : active.visualAgent.activeProfileId,
          profiles: active.visualAgent.profiles.filter(item => item.profileId !== profileId),
        },
      }));
      if (retirementId) {
        await this.retirements.commit(retirementId);
      }
      return next;
    } catch (error) {
      if (retirementId) {
        await this.retirements.rollback(retirementId);
      }
      throw error;
    }
  }

  setActive(profileId: string | null, expectedRevision: number): Promise<RuntimeConfigEnvelopeV1> {
    return this.runtimeConfig.compareAndActivate(expectedRevision, active => {
      if (profileId !== null && !active.visualAgent.profiles.some(item => item.profileId === profileId)) {
        invalidProfile();
      }
      return {
        ...active,
        visualAgent: {...active.visualAgent, activeProfileId: profileId},
      };
    });
  }

  setEnabled(enabled: boolean, expectedRevision: number): Promise<RuntimeConfigEnvelopeV1> {
    return this.runtimeConfig.compareAndActivate(expectedRevision, active => ({
      ...active,
      visualAgent: {...active.visualAgent, enabled},
    }));
  }

  private async rollbackNewSecret(newSecretRef: string, retirementId: string): Promise<void> {
    try {
      await this.credentials.delete(newSecretRef);
      const gone = await this.credentials.get(newSecretRef);
      if (gone === null) {
        await this.retirements.rollback(retirementId);
      }
      // If deletion/readback failed, leave the staged record for cold-start GC.
    } catch {
      // Leave the staged record for cold-start GC.
    }
  }
}
