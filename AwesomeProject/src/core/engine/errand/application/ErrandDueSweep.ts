// Single lifecycle owner for one due-sweep tick. One run claims at most one
// lease and executes it through one injected port; there is no local or
// Visual-Agent fallback branch here.
import type {CapabilityConfigPort, Clock, IdGenerator} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {ErrandRepository} from '../ports/ErrandRepository';

export interface ErrandExecutionRequest {
  readonly errandId: string;
  readonly title: string;
}

// Supplied by later runtime composition; this task only defines the seam.
export interface ErrandExecutionPort {
  execute(request: ErrandExecutionRequest): Promise<void>;
}

export interface SweepResult {
  readonly claimed: number;
  readonly succeeded: number;
  readonly failed: number;
}

const GENERIC_ERROR_CODE = /^[a-z][a-z_]*$/;

function errorCodeOf(error: unknown): string {
  if (error instanceof Error && GENERIC_ERROR_CODE.test(error.message)) {
    return error.message;
  }
  return 'capability_invalid_input';
}

export class ErrandDueSweep {
  constructor(
    private readonly repository: ErrandRepository,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly capabilityConfig: CapabilityConfigPort,
    private readonly executor: ErrandExecutionPort,
  ) {}

  async run(): Promise<SweepResult> {
    const snapshot = await this.capabilityConfig.read();
    if (!snapshot.capabilities.errands) {
      return {claimed: 0, succeeded: 0, failed: 0};
    }

    const workerId = this.idGenerator.next();
    const claims = await this.repository.claimDue(workerId, this.clock.now());
    if (claims.length === 0) {
      return {claimed: 0, succeeded: 0, failed: 0};
    }

    const [claim] = claims;
    try {
      await this.executor.execute({errandId: claim.errand.id, title: claim.errand.title});
      await this.repository.complete({
        errandId: claim.errand.id,
        leaseId: claim.lease.leaseId,
        completedAtMs: this.clock.now(),
      });
      return {claimed: 1, succeeded: 1, failed: 0};
    } catch (error) {
      await this.repository.fail({
        errandId: claim.errand.id,
        leaseId: claim.lease.leaseId,
        errorCode: errorCodeOf(error),
        failedAtMs: this.clock.now(),
      });
      return {claimed: 1, succeeded: 0, failed: 1};
    }
  }
}
