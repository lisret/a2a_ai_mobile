// Runtime-foundation Task 6 façade: the only place foreground/Headless callers
// ask for a create/claim/release cycle over one immutable operate session.
// Wave 1B Agent B scope: session contracts/resolver/store/runtime façade only.
import type {RuntimeConfigRepository} from './contracts/RuntimeConfigContracts';
import type {OperateSessionOwner, ResolvedOperateSessionV1} from './contracts/OperateSessionContracts';
import {OperateSessionResolver} from './session/OperateSessionResolver';
import {OperateSessionStore, type OperateSessionClaimResult} from './session/OperateSessionStore';

export type OperateSessionCreateOutcome =
  | {readonly ok: true; readonly session: ResolvedOperateSessionV1}
  | {readonly ok: false; readonly code: string};

export interface OperateRuntimeDeps {
  readonly configRepository: Pick<RuntimeConfigRepository, 'load'>;
  readonly sessionStore: OperateSessionStore;
  readonly resolver: OperateSessionResolver;
  readonly now?: () => number;
}

export class OperateRuntime {
  constructor(private readonly deps: OperateRuntimeDeps) {}

  async createSession(
    input: {readonly taskId: string},
    signal: AbortSignal = new AbortController().signal,
  ): Promise<OperateSessionCreateOutcome> {
    const sessionRevision = await this.deps.sessionStore.nextSessionRevision();
    const envelope = await this.deps.configRepository.load();
    const now = this.deps.now ?? Date.now;

    const resolution = await this.deps.resolver.resolve({
      taskId: input.taskId,
      sessionRevision,
      configRevision: envelope.revision,
      active: envelope.active,
      createdAtMs: now(),
      signal,
    });
    if (!resolution.ok) {
      return resolution;
    }

    const created = await this.deps.sessionStore.create(resolution.session);
    if (!created.ok) {
      return created;
    }

    return {ok: true, session: resolution.session};
  }

  claim(
    taskId: string,
    sessionRevision: number,
    owner: OperateSessionOwner,
  ): Promise<OperateSessionClaimResult> {
    return this.deps.sessionStore.claim(taskId, sessionRevision, owner);
  }
}
