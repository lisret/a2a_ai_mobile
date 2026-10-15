// Shared ports for the two operate entry points (runtime-foundation Tasks 8–9).
// Foreground and Headless both acquire one immutable session from the same
// `OperateRuntime` and drive it through the same `OperateTaskRunner.run(lease)`.
// Neither entry point constructs an `AIModel`, calls `modelInferenceModule`,
// reads current RuntimeConfig, or owns a second execution loop.
import type {OperateSessionLease} from '@core/engine/operateRuntime/contracts/OperateSessionContracts';
import type {OperateTaskOutcome} from '@core/engine/operateRuntime/runner/OperateTaskPorts';

export type OperateSessionCreateOutcome =
  | {
      readonly ok: true;
      readonly session: {
        readonly taskId: string;
        readonly sessionRevision: number;
      };
    }
  | {readonly ok: false; readonly code: string};

export type OperateSessionClaimOutcome =
  | {readonly ok: true; readonly lease: OperateSessionLease}
  | {readonly ok: false; readonly code: string};

/** The subset of `OperateRuntime`/cold-start gate the entry adapters consume. */
export interface OperateSessionProvider {
  createSession(
    input: {readonly taskId: string},
    signal?: AbortSignal,
  ): Promise<OperateSessionCreateOutcome>;
  claim(
    taskId: string,
    sessionRevision: number,
    owner: 'foreground' | 'headless',
  ): Promise<OperateSessionClaimOutcome>;
}

/** The single shared task runner (`OperateTaskRunner`). */
export interface OperateTaskRunnerPort {
  run(lease: OperateSessionLease): Promise<OperateTaskOutcome>;
}

export function terminalKindFromOutcome(
  outcome: OperateTaskOutcome,
): 'success' | 'failed' | 'cancelled' {
  switch (outcome.kind) {
    case 'success':
      return 'success';
    case 'cancelled':
      return 'cancelled';
    case 'failed':
      return 'failed';
  }
}
