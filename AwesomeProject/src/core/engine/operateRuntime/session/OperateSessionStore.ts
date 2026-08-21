// Runtime-foundation Task 6 repository: durable, serialized create/claim/terminal/
// release mutations over one immutable session record per taskId.
// Wave 1B Agent B scope: session contracts/resolver/store/runtime façade only.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  OperateSessionLease,
  OperateSessionOwner,
  ResolvedOperateSessionV1,
} from '../contracts/OperateSessionContracts';

const OPERATE_SESSIONS_STORAGE_KEY = '@nono:operate_sessions:v1';
const MAX_TOMBSTONES = 100;

type TerminalKind = 'success' | 'failed' | 'cancelled';

interface StoredClaim {
  readonly owner: OperateSessionOwner;
  readonly claimedAtMs: number;
  releasedAtMs: number | null;
}

interface StoredTerminal {
  readonly kind: TerminalKind;
  readonly terminalAtMs: number;
}

interface StoredRecord {
  readonly session: ResolvedOperateSessionV1;
  claim: StoredClaim | null;
  terminal: StoredTerminal | null;
}

interface StoredTombstone {
  readonly taskId: string;
  readonly sessionRevision: number;
  readonly terminal: StoredTerminal;
}

interface StoredEnvelope {
  readonly schemaVersion: 1;
  nextSessionRevision: number;
  records: Record<string, StoredRecord>;
  tombstones: StoredTombstone[];
}

export interface OperateSessionRecordView {
  readonly session: ResolvedOperateSessionV1;
  readonly claim: Readonly<StoredClaim> | null;
  readonly terminal: Readonly<StoredTerminal> | null;
}

export type OperateSessionCreateResult =
  | {readonly ok: true}
  | {readonly ok: false; readonly code: string};

export type OperateSessionClaimResult =
  | {readonly ok: true; readonly lease: OperateSessionLease}
  | {readonly ok: false; readonly code: string};

function emptyEnvelope(): StoredEnvelope {
  return {schemaVersion: 1, nextSessionRevision: 1, records: {}, tombstones: []};
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

class OperateSessionLeaseImpl implements OperateSessionLease {
  readonly signal: AbortSignal;
  private readonly controller = new AbortController();
  private released = false;

  constructor(
    readonly session: ResolvedOperateSessionV1,
    readonly owner: OperateSessionOwner,
    private readonly store: OperateSessionStore,
  ) {
    this.signal = this.controller.signal;
  }

  cancel(_reason?: string): boolean {
    if (this.controller.signal.aborted) {
      return false;
    }
    this.controller.abort();
    return true;
  }

  markTerminal(kind: TerminalKind): Promise<boolean> {
    return this.store.markTerminal(this.session.taskId, this.session.sessionRevision, kind);
  }

  async release(): Promise<void> {
    if (this.released) {
      return;
    }
    this.released = true;
    await this.store.release(this.session.taskId, this.session.sessionRevision, this.owner);
  }
}

export class OperateSessionStore {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private async readEnvelope(): Promise<StoredEnvelope> {
    const raw = await AsyncStorage.getItem(OPERATE_SESSIONS_STORAGE_KEY);
    return raw != null ? (JSON.parse(raw) as StoredEnvelope) : emptyEnvelope();
  }

  private async writeEnvelope(envelope: StoredEnvelope): Promise<void> {
    await AsyncStorage.setItem(OPERATE_SESSIONS_STORAGE_KEY, JSON.stringify(envelope));
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private pushTombstone(envelope: StoredEnvelope, tombstone: StoredTombstone): void {
    envelope.tombstones.push(tombstone);
    if (envelope.tombstones.length > MAX_TOMBSTONES) {
      envelope.tombstones.splice(0, envelope.tombstones.length - MAX_TOMBSTONES);
    }
  }

  nextSessionRevision(): Promise<number> {
    return this.enqueue(async () => {
      const envelope = await this.readEnvelope();
      const revision = envelope.nextSessionRevision;
      envelope.nextSessionRevision = revision + 1;
      await this.writeEnvelope(envelope);
      return revision;
    });
  }

  create(session: ResolvedOperateSessionV1): Promise<OperateSessionCreateResult> {
    return this.enqueue(async () => {
      const envelope = await this.readEnvelope();
      const alreadyBound =
        envelope.records[session.taskId] !== undefined ||
        envelope.tombstones.some(tombstone => tombstone.taskId === session.taskId);
      if (alreadyBound) {
        return {ok: false, code: 'operate_session_task_already_bound'};
      }
      envelope.records[session.taskId] = {session, claim: null, terminal: null};
      await this.writeEnvelope(envelope);
      return {ok: true};
    });
  }

  claim(
    taskId: string,
    sessionRevision: number,
    owner: OperateSessionOwner,
  ): Promise<OperateSessionClaimResult> {
    return this.enqueue(async () => {
      const envelope = await this.readEnvelope();
      const record = envelope.records[taskId];
      if (!record) {
        const tombstoned = envelope.tombstones.some(
          tombstone => tombstone.taskId === taskId && tombstone.sessionRevision === sessionRevision,
        );
        return {ok: false, code: tombstoned ? 'operate_session_already_terminal' : 'operate_session_not_found'};
      }
      if (record.session.sessionRevision !== sessionRevision) {
        return {ok: false, code: 'operate_session_stale_revision'};
      }
      if (record.terminal !== null) {
        return {ok: false, code: 'operate_session_already_terminal'};
      }
      if (record.claim !== null && record.claim.releasedAtMs === null) {
        return {ok: false, code: 'operate_session_already_claimed'};
      }

      record.claim = {owner, claimedAtMs: this.now(), releasedAtMs: null};
      await this.writeEnvelope(envelope);
      return {ok: true, lease: new OperateSessionLeaseImpl(record.session, owner, this)};
    });
  }

  markTerminal(taskId: string, sessionRevision: number, kind: TerminalKind): Promise<boolean> {
    return this.enqueue(async () => {
      const envelope = await this.readEnvelope();
      const record = envelope.records[taskId];
      if (!record || record.session.sessionRevision !== sessionRevision) {
        return false;
      }
      if (record.terminal !== null) {
        return false;
      }
      record.terminal = {kind, terminalAtMs: this.now()};
      await this.writeEnvelope(envelope);
      return true;
    });
  }

  release(taskId: string, sessionRevision: number, owner: OperateSessionOwner): Promise<void> {
    return this.enqueue(async () => {
      const envelope = await this.readEnvelope();
      const record = envelope.records[taskId];
      if (!record || record.session.sessionRevision !== sessionRevision) {
        return;
      }
      if (record.claim !== null && record.claim.owner === owner && record.claim.releasedAtMs === null) {
        record.claim.releasedAtMs = this.now();
      }
      if (record.terminal !== null) {
        this.pushTombstone(envelope, {
          taskId,
          sessionRevision: record.session.sessionRevision,
          terminal: record.terminal,
        });
        delete envelope.records[taskId];
      }
      await this.writeEnvelope(envelope);
    });
  }

  async load(taskId: string): Promise<OperateSessionRecordView | null> {
    const envelope = await this.readEnvelope();
    const record = envelope.records[taskId];
    if (!record) {
      return null;
    }
    return {
      session: deepFreeze(record.session),
      claim: record.claim,
      terminal: record.terminal,
    };
  }

  async listNonterminal(): Promise<readonly ResolvedOperateSessionV1[]> {
    const envelope = await this.readEnvelope();
    return Object.values(envelope.records)
      .filter(record => record.terminal === null)
      .map(record => deepFreeze(record.session));
  }
}
