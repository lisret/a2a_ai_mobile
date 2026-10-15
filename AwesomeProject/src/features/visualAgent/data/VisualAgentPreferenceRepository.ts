// Remote Visual Agent preference adapter (capability-domain Task 12). It is a
// `PreferenceRepository` whose only backend is the negotiated Connector Bridge
// preference command carried by the mobile execution port. It fails closed with
// `preference_remote_unavailable` whenever preferences were not negotiated or a
// remote command fails or returns an unexpected shape, and it never caches
// remote data on the device.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {IdGenerator} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {
  ConfirmedPreferenceDraft,
  Preference,
} from '@core/engine/preference/domain/Preference';
import type {PreferenceRepository} from '@core/engine/preference/ports/PreferenceRepository';
import type {
  VisualAgentExecutionPort,
  VisualAgentPreferenceCommand,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

function unavailable(): never {
  throw new CapabilityError('preference_remote_unavailable');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function projectRecord(value: unknown): Preference {
  if (!isObject(value)) {
    unavailable();
  }
  const {id, kind, title, summary, createdAtEpochMs, updatedAtEpochMs} = value;
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    (kind !== 'name' && kind !== 'preference') ||
    typeof title !== 'string' ||
    typeof summary !== 'string' ||
    typeof createdAtEpochMs !== 'number' ||
    typeof updatedAtEpochMs !== 'number'
  ) {
    unavailable();
  }
  return {id, kind, title, summary, createdAtEpochMs, updatedAtEpochMs};
}

export class VisualAgentPreferenceRepository implements PreferenceRepository {
  constructor(
    private readonly execution: VisualAgentExecutionPort,
    private readonly ids: IdGenerator,
  ) {}

  async list(): Promise<readonly Preference[]> {
    const result = await this.send({type: 'list'});
    if (!isObject(result) || result.type !== 'list' || !Array.isArray(result.preferences)) {
      unavailable();
    }
    return result.preferences.map(projectRecord);
  }

  async upsertConfirmed(draft: ConfirmedPreferenceDraft): Promise<Preference> {
    const result = await this.send({
      type: 'upsert',
      preference: {
        id: this.ids.next(),
        kind: draft.kind,
        title: draft.title,
        summary: draft.summary,
      },
    });
    if (!isObject(result) || result.type !== 'upsert') {
      unavailable();
    }
    return projectRecord(result.preference);
  }

  async delete(id: string): Promise<void> {
    await this.send({type: 'delete', preferenceId: id});
  }

  async forgetAll(): Promise<void> {
    await this.send({type: 'clear'});
  }

  private async send(command: VisualAgentPreferenceCommand): Promise<unknown> {
    const state = this.execution.getConnectionState();
    if (state.status !== 'ready' || state.negotiatedCapabilities.preferences !== true) {
      unavailable();
    }
    try {
      return await this.execution.requestPreferences(
        command,
        new AbortController().signal,
      );
    } catch {
      return unavailable();
    }
  }
}
