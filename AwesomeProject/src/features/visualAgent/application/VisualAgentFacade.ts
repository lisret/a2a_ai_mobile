// UI-narrow Visual Agent facade (capability-domain Task 12). It is a thin
// adapter seam over the frozen `VisualAgentProfileController` (reads the current
// safe projection — never a legacy key or reconstructed legacy profile) and the
// single `VisualAgentExecutionPort`. It delegates every task action without a
// fallback and is not a second execution contract.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {
  VisualAgentExecutionPort,
  VisualAgentProfileV1,
  VisualAgentTaskEnvelopeV1,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import type {VisualAgentProfileController} from './VisualAgentProfileController';
import type {VisualAgentViewState} from './VisualAgentViewState';

export class VisualAgentFacade {
  constructor(
    private readonly profiles: VisualAgentProfileController,
    private readonly execution: VisualAgentExecutionPort,
  ) {}

  read(): Promise<VisualAgentViewState> {
    return this.project();
  }

  async setEnabled(enabled: boolean, expectedRevision: number): Promise<VisualAgentViewState> {
    await this.profiles.setEnabled(enabled, expectedRevision);
    return this.project();
  }

  async setActive(
    profileId: string | null,
    expectedRevision: number,
  ): Promise<VisualAgentViewState> {
    await this.profiles.setActive(profileId, expectedRevision);
    return this.project();
  }

  async connect(signal: AbortSignal): Promise<VisualAgentViewState> {
    const profile = await this.activeProfile();
    if (!profile) {
      throw new CapabilityError('visual_agent_invalid_profile');
    }
    await this.execution.connect(profile, signal);
    return this.project();
  }

  async disconnect(): Promise<VisualAgentViewState> {
    await this.execution.disconnect();
    return this.project();
  }

  execute(
    envelope: VisualAgentTaskEnvelopeV1,
    signal: AbortSignal,
  ): Promise<{taskId: string}> {
    return this.execution.execute(envelope, signal);
  }

  cancel(
    input: {taskId: string; sessionRevision: number},
    signal: AbortSignal,
  ): Promise<void> {
    return this.execution.cancel(input, signal);
  }

  resolveApproval(
    input: {
      taskId: string;
      sessionRevision: number;
      approvalId: string;
      decision: 'approve' | 'reject';
    },
    signal: AbortSignal,
  ): Promise<void> {
    return this.execution.resolveApproval(input, signal);
  }

  resume(
    input: {taskId: string; sessionRevision: number; resumeToken: string},
    signal: AbortSignal,
  ): Promise<void> {
    return this.execution.resume(input, signal);
  }

  steer(
    input: {taskId: string; sessionRevision: number; instruction: string},
    signal: AbortSignal,
  ): Promise<void> {
    return this.execution.steer(input, signal);
  }

  private async activeProfile(): Promise<VisualAgentProfileV1 | null> {
    const projection = await this.profiles.readActiveProjection();
    if (!projection) {
      return null;
    }
    const profiles = await this.profiles.list();
    return profiles.find(profile => profile.profileId === projection.profileId) ?? null;
  }

  private async project(): Promise<VisualAgentViewState> {
    let projection: Awaited<ReturnType<VisualAgentProfileController['readActiveProjection']>>;
    let enabled: boolean;
    try {
      [enabled, projection] = await Promise.all([
        this.profiles.readEnabled(),
        this.profiles.readActiveProjection(),
      ]);
    } catch {
      return {
        status: 'error',
        enabled: false,
        activeProfile: null,
        activeProfileId: null,
        activeToolId: null,
        connection: this.execution.getConnectionState().status,
        negotiatedCapabilities: null,
        canExecute: false,
      };
    }

    const connection = this.execution.getConnectionState();
    const negotiatedCapabilities =
      connection.status === 'ready' ? connection.negotiatedCapabilities : null;
    const canExecute =
      enabled && connection.status === 'ready' && projection !== null;

    return {
      status: 'ready',
      enabled,
      activeProfile: projection,
      activeProfileId: projection?.profileId ?? null,
      activeToolId: projection?.toolId ?? null,
      connection: connection.status,
      negotiatedCapabilities,
      canExecute,
      ...(connection.status === 'failed'
        ? {blocker: {code: connection.errorCode, message: connection.errorCode}}
        : {}),
    };
  }
}
