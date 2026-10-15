// Cold-start admission gate (runtime-foundation Task 6 / master Task 4 Step 5).
// Production startup must finish RuntimeConfig migration/load, nonterminal
// session recovery, and retired-ref reconciliation BEFORE any `createSession`
// is admitted. A ref held by active/draft config or a nonterminal session is
// never deleted, and a failed cleanup keeps the gate closed.
import type {
  OperateRuntime,
  OperateSessionCreateOutcome,
} from './OperateRuntime';
import type {RuntimeConfigRepository} from './contracts/RuntimeConfigContracts';
import type {OperateSessionStore} from './session/OperateSessionStore';
import type {CredentialReferenceGarbageCollector} from './session/CredentialReferenceGarbageCollector';

export interface OperateRuntimeColdStartDeps {
  readonly configRepository: Pick<RuntimeConfigRepository, 'load'>;
  readonly sessionStore: Pick<OperateSessionStore, 'listNonterminal'>;
  readonly collector: Pick<
    CredentialReferenceGarbageCollector,
    'reconcileBeforeAcceptingTasks'
  >;
  readonly runtime: Pick<OperateRuntime, 'createSession'>;
}

/**
 * Wraps `OperateRuntime` so that `createSession` is refused until the ordered
 * cold-start sequence has completed. Runtime config edits never touch the
 * collector, so an in-flight immutable session cannot lose its credential.
 */
export class OperateRuntimeColdStart {
  private admitted = false;

  constructor(private readonly deps: OperateRuntimeColdStartDeps) {}

  /** Ordered startup: migrate/load config, recover sessions, reconcile refs. */
  async start(): Promise<void> {
    await this.deps.configRepository.load();
    await this.deps.sessionStore.listNonterminal();
    await this.deps.collector.reconcileBeforeAcceptingTasks();
    this.admitted = true;
  }

  isAdmitted(): boolean {
    return this.admitted;
  }

  createSession(
    input: {readonly taskId: string},
    signal?: AbortSignal,
  ): Promise<OperateSessionCreateOutcome> {
    if (!this.admitted) {
      return Promise.resolve({ok: false, code: 'operate_not_admitted'});
    }
    return this.deps.runtime.createSession(input, signal);
  }
}
