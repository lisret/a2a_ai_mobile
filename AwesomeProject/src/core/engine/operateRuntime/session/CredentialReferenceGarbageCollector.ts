// Cross-package join owned by the integration coordinator (runtime-foundation Task 6).
// Runs only during production cold-start composition, after RuntimeConfig
// migration/load and session recovery, before any `createSession` is admitted.
// It never deletes a credential ref held by active/draft config or any
// nonterminal immutable session. Logs carry only a reason code and a count.
import type {CredentialStore} from '../contracts/CredentialStore';
import type {
  CredentialRetirementRecordV1,
  CredentialRetirementRepository,
  RuntimeConfigRepository,
  RuntimeRouteConfigV1,
} from '../contracts/RuntimeConfigContracts';
import type {ResolvedOperateSessionV1} from '../contracts/OperateSessionContracts';
import type {OperateSessionStore} from './OperateSessionStore';

const CLEANUP_REQUIRED = 'credential_cleanup_required';

/** Stable, ref-free failure that must block admitting a new operation task. */
export class CredentialCleanupError extends Error {
  readonly code = CLEANUP_REQUIRED;
  constructor() {
    super(CLEANUP_REQUIRED);
    this.name = 'CredentialCleanupError';
  }
}

type ConfigLoader = Pick<RuntimeConfigRepository, 'load'>;
type NonterminalSessionScan = Pick<OperateSessionStore, 'listNonterminal'>;

export class CredentialReferenceGarbageCollector {
  constructor(
    private readonly runtimeConfig: ConfigLoader,
    private readonly sessions: NonterminalSessionScan,
    private readonly retirements: CredentialRetirementRepository,
    private readonly credentials: CredentialStore,
  ) {}

  async reconcileBeforeAcceptingTasks(): Promise<void> {
    const {configRefs, allRefs} = await this.collectReferences();
    const records = await this.retirements.list();

    let failures = 0;
    for (const record of records) {
      try {
        await this.reconcileRecord(record, configRefs, allRefs);
      } catch {
        failures += 1;
      }
    }

    if (failures > 0) {
      // Ref-free diagnostic: reason code and count only, never a credential ref.
      console.warn(`[credential-gc] ${CLEANUP_REQUIRED} count=${failures}`);
      throw new CredentialCleanupError();
    }
  }

  private async reconcileRecord(
    record: CredentialRetirementRecordV1,
    configRefs: ReadonlySet<string>,
    allRefs: ReadonlySet<string>,
  ): Promise<void> {
    const {retirementId, state, oldSecretRef, replacementSecretRef} = record;

    if (state === 'committed') {
      await this.reconcileCommittedOldRef(retirementId, oldSecretRef, allRefs);
      return;
    }

    if (replacementSecretRef !== null) {
      // Staged replacement: a referenced replacement proves the CAS committed;
      // an unreferenced replacement is a CAS/crash orphan.
      if (allRefs.has(replacementSecretRef)) {
        await this.reconcileCommittedOldRef(retirementId, oldSecretRef, allRefs);
      } else {
        await this.deleteAndVerify(replacementSecretRef);
        await this.retirements.rollback(retirementId);
      }
      return;
    }

    // Staged removal. `(null, null)` is invalid and never staged.
    if (oldSecretRef === null) {
      return;
    }
    if (configRefs.has(oldSecretRef)) {
      // Still live in config: the CAS never committed, so the removal rolls back.
      await this.retirements.rollback(retirementId);
    } else if (allRefs.has(oldSecretRef)) {
      // Pinned only by a nonterminal session: commit and wait for a later start.
      await this.retirements.commit(retirementId);
    } else {
      await this.deleteAndVerify(oldSecretRef);
      await this.retirements.complete(retirementId);
    }
  }

  private async reconcileCommittedOldRef(
    retirementId: string,
    oldSecretRef: string | null,
    allRefs: ReadonlySet<string>,
  ): Promise<void> {
    if (oldSecretRef === null) {
      await this.retirements.complete(retirementId);
      return;
    }
    if (allRefs.has(oldSecretRef)) {
      // Held by active/draft config or a nonterminal session: keep and wait.
      return;
    }
    await this.deleteAndVerify(oldSecretRef);
    await this.retirements.complete(retirementId);
  }

  private async deleteAndVerify(secretRef: string): Promise<void> {
    await this.credentials.delete(secretRef);
    const remaining = await this.credentials.get(secretRef);
    if (remaining != null) {
      throw new CredentialCleanupError();
    }
  }

  private async collectReferences(): Promise<{
    configRefs: ReadonlySet<string>;
    allRefs: ReadonlySet<string>;
  }> {
    const envelope = await this.runtimeConfig.load();
    const configRefs = new Set<string>();
    this.addRouteRefs(envelope.active, configRefs);
    this.addRouteRefs(envelope.draft, configRefs);

    const allRefs = new Set(configRefs);
    const nonterminal = await this.sessions.listNonterminal();
    for (const session of nonterminal) {
      this.addSessionRefs(session, allRefs);
    }
    return {configRefs, allRefs};
  }

  private addRouteRefs(route: RuntimeRouteConfigV1, into: Set<string>): void {
    for (const profile of route.modelAPI.profiles) {
      if (profile.secretRef !== null) {
        into.add(profile.secretRef);
      }
    }
    for (const profile of route.visualAgent.profiles) {
      if (profile.connector.secretRef !== null) {
        into.add(profile.connector.secretRef);
      }
    }
  }

  private addSessionRefs(session: ResolvedOperateSessionV1, into: Set<string>): void {
    const {direct, vision, planner} = session.modelBindings;
    for (const binding of [direct, vision, planner]) {
      if (binding && binding.secretRef !== null) {
        into.add(binding.secretRef);
      }
    }
    const visualRef = session.visualAgent?.connector.secretRef;
    if (visualRef != null) {
      into.add(visualRef);
    }
  }
}
