import {
  AgentConfigV2,
  AgentMode,
  EligibilityReport,
  ModelConnection,
} from '../domain/AgentTypes';
import {validateAgentConfig} from '../domain/AgentConfigValidation';

export interface CredentialStoreLike {
  put(secretRef: string, plaintext: string): Promise<void>;
  get(secretRef: string): Promise<string | null | undefined>;
  delete(secretRef: string): Promise<void>;
}

export type ConnectionTestStatus = 'untested' | 'testing' | 'ready' | 'error';

export interface ModelConnectionEditorInput {
  /** Present only when editing an existing connection. */
  readonly id?: string;
  readonly providerId: string;
  readonly baseUrl: string;
  readonly modelName: string;
  readonly capabilities: ModelConnection['capabilities'];
  readonly metadata?: ModelConnection['metadata'];
  /** Transient input. It is written to CredentialStore and never retained. */
  readonly apiKey?: string;
}

export interface AgentConfigIdGenerator {
  nextConnectionId(): string;
  /** Must return a new, versioned ref on every call. */
  nextSecretRef(connectionId: string): string;
}

export type AgentModeConnectionSlot =
  | {readonly mode: 'cloud_direct'; readonly slot: 'direct'}
  | {readonly mode: 'cloud_split'; readonly slot: 'vision' | 'planner'}
  | {
      readonly mode: 'local_vision_cloud_planner';
      readonly slot: 'planner';
    };

export interface AgentConfigRepositorySnapshot {
  config: AgentConfigV2;
  connections: ModelConnection[];
  eligibility: EligibilityReport;
}

export interface AgentConfigRepository {
  load(): Promise<AgentConfigRepositorySnapshot>;
  save(
    config: AgentConfigV2,
    connections: readonly ModelConnection[],
    eligibility: EligibilityReport,
  ): Promise<void>;
}

export interface AgentConfigControllerDependencies {
  repository: AgentConfigRepository;
  credentialStore: CredentialStoreLike;
  taskState: {
    isTaskRunning(): boolean;
    tryAcquireActivationLease(): (() => void) | null;
  };
  connectionTester: {
    test(
      connection: ModelConnection,
      resolveSecret: () => Promise<string | null | undefined>,
    ): Promise<void>;
  };
  eligibilityChecker: {check(): Promise<EligibilityReport>};
  idGenerator?: AgentConfigIdGenerator;
}

export interface AgentConfigControllerSnapshot {
  readonly draft: AgentConfigV2;
  readonly connections: readonly ModelConnection[];
  readonly connectionStatuses: Readonly<Record<string, ConnectionTestStatus>>;
  readonly eligibility: EligibilityReport;
  readonly isTaskRunning: boolean;
  readonly isRunnable: boolean;
  readonly saveState:
    | 'idle'
    | 'dirty'
    | 'checking'
    | 'saving'
    | 'saved'
    | 'error';
  readonly fieldErrors: Readonly<Record<string, string>>;
}

export interface AgentConfigController {
  getSnapshot(): AgentConfigControllerSnapshot;
  subscribe(
    listener: (snapshot: AgentConfigControllerSnapshot) => void,
  ): () => void;
  selectMode(mode: AgentMode): void;
  setMaxSteps(maxSteps: number): void;
  setModeConnection(slot: AgentModeConnectionSlot, connectionId?: string): void;
  upsertConnection(input: ModelConnectionEditorInput): Promise<string>;
  deleteConnection(id: string): void;
  patchConnection(
    id: string,
    patch: Partial<
      Omit<ModelConnection, 'id' | 'secretRef' | 'credentialDisplay'>
    > & {apiKey?: string},
  ): Promise<void>;
  testConnection(id: string): Promise<void>;
  runEligibilityCheck(): Promise<EligibilityReport>;
  saveAndActivate(): Promise<void>;
}

const cloneAndFreeze = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(item => cloneAndFreeze(item))) as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          cloneAndFreeze(item),
        ]),
      ),
    ) as T;
  }
  return value;
};

const clone = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(item => clone(item)) as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        clone(item),
      ]),
    ) as T;
  }
  return value;
};

const activeConnectionIds = (
  config: AgentConfigV2,
): Array<string | undefined> => {
  switch (config.activeMode) {
    case 'cloud_direct':
      return [config.modeDrafts.cloudDirect.modelConnectionId];
    case 'cloud_split':
      return [
        config.modeDrafts.cloudSplit.visionConnectionId,
        config.modeDrafts.cloudSplit.plannerConnectionId,
      ];
    case 'local_vision_cloud_planner':
      return [config.modeDrafts.localVisionCloudPlanner.plannerConnectionId];
  }
};

const maskCredential = (apiKey: string): {masked: string; lastFour: string} => {
  const normalizedApiKey = apiKey.trim();
  const lastFour =
    normalizedApiKey.length > 4 ? normalizedApiKey.slice(-4) : '';
  return {masked: `••••••••${lastFour}`, lastFour};
};

let generatedConnectionSequence = 0;
let generatedSecretSequence = 0;

const defaultIdGenerator: AgentConfigIdGenerator = {
  nextConnectionId: () => {
    generatedConnectionSequence += 1;
    return `connection-${Date.now().toString(
      36,
    )}-${generatedConnectionSequence.toString(36)}`;
  },
  nextSecretRef: connectionId => {
    generatedSecretSequence += 1;
    return `model:${connectionId}:${Date.now().toString(
      36,
    )}-${generatedSecretSequence.toString(36)}`;
  },
};

const isValidMaxSteps = (maxSteps: number): boolean =>
  Number.isSafeInteger(maxSteps) && maxSteps >= 1;

interface ActivationCandidate {
  readonly config: AgentConfigV2;
  readonly connections: readonly ModelConnection[];
  readonly eligibility: EligibilityReport;
}

class AgentConfigControllerImpl implements AgentConfigController {
  private draft: AgentConfigV2;
  private connections: ModelConnection[];
  private eligibility: EligibilityReport;
  private activeConfig: AgentConfigV2;
  private activeConnections: readonly ModelConnection[];
  private activeEligibility: EligibilityReport;
  private activeRunnable: boolean;
  private saveState: AgentConfigControllerSnapshot['saveState'] = 'idle';
  private fieldErrors: Record<string, string> = {};
  private connectionStatuses: Record<string, ConnectionTestStatus>;
  private readonly connectionTestGenerations = new Map<string, number>();
  private readonly connectionMutationGenerations = new Map<string, number>();
  private readonly pendingCredentialCleanup = new Set<string>();
  private readonly reservedSecretRefs = new Set<string>();
  private readonly listeners = new Set<
    (snapshot: AgentConfigControllerSnapshot) => void
  >();
  private draftRevision = 0;
  private eligibilityGeneration = 0;
  private saveInFlight = false;

  constructor(
    private readonly deps: AgentConfigControllerDependencies,
    initial: AgentConfigRepositorySnapshot,
    initialRunnable: boolean,
  ) {
    this.draft = clone(initial.config);
    this.connections = clone(initial.connections);
    this.eligibility = clone(initial.eligibility);
    this.activeConfig = clone(initial.config);
    this.activeConnections = clone(initial.connections);
    this.activeEligibility = clone(initial.eligibility);
    this.activeRunnable = initialRunnable;
    this.connectionStatuses = Object.fromEntries(
      initial.connections.map(connection => [connection.id, 'untested']),
    ) as Record<string, ConnectionTestStatus>;
    this.fieldErrors = this.deriveDraftFieldErrors();
  }

  getSnapshot(): AgentConfigControllerSnapshot {
    return cloneAndFreeze({
      draft: this.draft,
      connections: this.connections,
      connectionStatuses: this.connectionStatuses,
      eligibility: this.eligibility,
      isTaskRunning: this.deps.taskState.isTaskRunning(),
      isRunnable: this.activeRunnable,
      saveState: this.saveState,
      fieldErrors: this.fieldErrors,
    });
  }

  subscribe(
    listener: (snapshot: AgentConfigControllerSnapshot) => void,
  ): () => void {
    this.listeners.add(listener);
    try {
      listener(this.getSnapshot());
    } catch {
      this.listeners.delete(listener);
    }
    return () => this.listeners.delete(listener);
  }

  selectMode(mode: AgentMode): void {
    this.draft = {...this.draft, activeMode: mode};
    this.markDirty();
  }

  setMaxSteps(maxSteps: number): void {
    this.draft = {...this.draft, maxSteps};
    this.markDirty();
  }

  setModeConnection(
    slot: AgentModeConnectionSlot,
    connectionId?: string,
  ): void {
    if (
      connectionId !== undefined &&
      !this.connections.some(connection => connection.id === connectionId)
    ) {
      throw new Error('agent_config_connection_not_found');
    }
    switch (slot.mode) {
      case 'cloud_direct':
        this.draft = {
          ...this.draft,
          modeDrafts: {
            ...this.draft.modeDrafts,
            cloudDirect: {modelConnectionId: connectionId},
          },
        };
        break;
      case 'cloud_split':
        this.draft = {
          ...this.draft,
          modeDrafts: {
            ...this.draft.modeDrafts,
            cloudSplit: {
              ...this.draft.modeDrafts.cloudSplit,
              ...(slot.slot === 'vision'
                ? {visionConnectionId: connectionId}
                : {plannerConnectionId: connectionId}),
            },
          },
        };
        break;
      case 'local_vision_cloud_planner':
        this.draft = {
          ...this.draft,
          modeDrafts: {
            ...this.draft.modeDrafts,
            localVisionCloudPlanner: {
              ...this.draft.modeDrafts.localVisionCloudPlanner,
              plannerConnectionId: connectionId,
            },
          },
        };
        break;
    }
    this.markDirty();
  }

  async upsertConnection(input: ModelConnectionEditorInput): Promise<string> {
    const {id, apiKey, ...editableFields} = input;
    const detachedFields = clone(editableFields);
    if (id) {
      const current = this.connections.find(connection => connection.id === id);
      if (!current) {
        throw new Error('agent_config_connection_not_found');
      }
      const mutationGeneration = this.bumpConnectionMutationGeneration(id);
      let credentialDisplay = current.credentialDisplay;
      let secretRef = current.secretRef;
      if (apiKey && apiKey.trim()) {
        const normalizedApiKey = apiKey.trim();
        secretRef = this.reserveVersionedSecretRef(id);
        try {
          await this.deps.credentialStore.put(secretRef, normalizedApiKey);
        } catch {
          await this.discardUncommittedSecretRef(secretRef);
          throw new Error('agent_config_credential_write_failed');
        }
        if (
          !this.isCurrentConnectionMutation(
            id,
            mutationGeneration,
            current.secretRef,
          )
        ) {
          await this.discardUncommittedSecretRef(secretRef);
          throw new Error('agent_config_connection_changed');
        }
        this.reservedSecretRefs.delete(secretRef);
        credentialDisplay = maskCredential(normalizedApiKey);
        this.pendingCredentialCleanup.add(current.secretRef);
      }
      this.connections = this.connections.map(connection =>
        connection.id === id
          ? {...connection, ...detachedFields, secretRef, credentialDisplay}
          : connection,
      );
      this.invalidateConnectionTest(id);
      this.markDirty();
      return id;
    }

    if (!apiKey || !apiKey.trim()) {
      throw new Error('agent_config_api_key_required');
    }
    const idGenerator = this.deps.idGenerator ?? defaultIdGenerator;
    const newId = idGenerator.nextConnectionId();
    if (
      !newId.trim() ||
      this.connections.some(connection => connection.id === newId)
    ) {
      throw new Error('agent_config_connection_id_conflict');
    }
    const normalizedApiKey = apiKey.trim();
    const secretRef = this.reserveVersionedSecretRef(newId);
    try {
      await this.deps.credentialStore.put(secretRef, normalizedApiKey);
    } catch {
      await this.discardUncommittedSecretRef(secretRef);
      throw new Error('agent_config_credential_write_failed');
    }
    this.reservedSecretRefs.delete(secretRef);
    this.connections = [
      ...this.connections,
      {
        id: newId,
        ...detachedFields,
        secretRef,
        credentialDisplay: maskCredential(normalizedApiKey),
      },
    ];
    this.connectionStatuses = {
      ...this.connectionStatuses,
      [newId]: 'untested',
    };
    this.markDirty();
    return newId;
  }

  deleteConnection(id: string): void {
    const current = this.connections.find(connection => connection.id === id);
    if (!current) {
      throw new Error('agent_config_connection_not_found');
    }
    this.bumpConnectionMutationGeneration(id);
    this.connections = this.connections.filter(
      connection => connection.id !== id,
    );
    this.draft = {
      ...this.draft,
      modeDrafts: {
        cloudDirect: {
          modelConnectionId:
            this.draft.modeDrafts.cloudDirect.modelConnectionId === id
              ? undefined
              : this.draft.modeDrafts.cloudDirect.modelConnectionId,
        },
        cloudSplit: {
          visionConnectionId:
            this.draft.modeDrafts.cloudSplit.visionConnectionId === id
              ? undefined
              : this.draft.modeDrafts.cloudSplit.visionConnectionId,
          plannerConnectionId:
            this.draft.modeDrafts.cloudSplit.plannerConnectionId === id
              ? undefined
              : this.draft.modeDrafts.cloudSplit.plannerConnectionId,
        },
        localVisionCloudPlanner: {
          ...this.draft.modeDrafts.localVisionCloudPlanner,
          plannerConnectionId:
            this.draft.modeDrafts.localVisionCloudPlanner
              .plannerConnectionId === id
              ? undefined
              : this.draft.modeDrafts.localVisionCloudPlanner
                  .plannerConnectionId,
        },
      },
    };
    this.pendingCredentialCleanup.add(current.secretRef);
    this.bumpConnectionTestGeneration(id);
    const remainingStatuses = {...this.connectionStatuses};
    delete remainingStatuses[id];
    this.connectionStatuses = remainingStatuses;
    this.markDirty();
  }

  async patchConnection(
    id: string,
    patch: Partial<
      Omit<ModelConnection, 'id' | 'secretRef' | 'credentialDisplay'>
    > & {apiKey?: string},
  ): Promise<void> {
    const current = this.connections.find(connection => connection.id === id);
    if (!current) {
      throw new Error('agent_config_connection_not_found');
    }
    const {apiKey, ...connectionPatch} = patch;
    const detachedPatch = clone(connectionPatch);
    const mutationGeneration = this.bumpConnectionMutationGeneration(id);
    let credentialDisplay = current.credentialDisplay;
    let secretRef = current.secretRef;
    if (apiKey && apiKey.trim()) {
      const normalizedApiKey = apiKey.trim();
      secretRef = this.reserveVersionedSecretRef(id);
      try {
        await this.deps.credentialStore.put(secretRef, normalizedApiKey);
      } catch {
        await this.discardUncommittedSecretRef(secretRef);
        throw new Error('agent_config_credential_write_failed');
      }
      if (
        !this.isCurrentConnectionMutation(
          id,
          mutationGeneration,
          current.secretRef,
        )
      ) {
        await this.discardUncommittedSecretRef(secretRef);
        throw new Error('agent_config_connection_changed');
      }
      this.reservedSecretRefs.delete(secretRef);
      credentialDisplay = maskCredential(normalizedApiKey);
      this.pendingCredentialCleanup.add(current.secretRef);
    }
    this.connections = this.connections.map(connection =>
      connection.id === id
        ? {...connection, ...detachedPatch, secretRef, credentialDisplay}
        : connection,
    );
    this.invalidateConnectionTest(id);
    this.markDirty();
  }

  async testConnection(id: string): Promise<void> {
    const connection = this.connections.find(item => item.id === id);
    if (!connection) {
      throw new Error('agent_config_connection_not_found');
    }
    const generation = this.bumpConnectionTestGeneration(id);
    this.connectionStatuses = {...this.connectionStatuses, [id]: 'testing'};
    this.emit();
    try {
      await this.deps.connectionTester.test(clone(connection), () =>
        this.deps.credentialStore.get(connection.secretRef),
      );
      if (this.isCurrentConnectionTest(id, generation)) {
        this.connectionStatuses = {...this.connectionStatuses, [id]: 'ready'};
        this.emit();
      }
    } catch {
      if (this.isCurrentConnectionTest(id, generation)) {
        this.connectionStatuses = {...this.connectionStatuses, [id]: 'error'};
        this.emit();
      }
      throw new Error('agent_config_connection_test_failed');
    }
  }

  async runEligibilityCheck(): Promise<EligibilityReport> {
    const generation = ++this.eligibilityGeneration;
    const revisionAtStart = this.draftRevision;
    const stateBeforeCheck = this.saveState;
    const ownsCheckingState = !this.saveInFlight;
    if (ownsCheckingState) {
      this.saveState = 'checking';
      this.emit();
    }
    try {
      const report = clone(await this.deps.eligibilityChecker.check());
      if (
        ownsCheckingState &&
        generation === this.eligibilityGeneration &&
        revisionAtStart === this.draftRevision &&
        this.saveState === 'checking'
      ) {
        this.eligibility = clone(report);
        this.markDirty();
      }
      return report;
    } catch (error) {
      if (
        ownsCheckingState &&
        generation === this.eligibilityGeneration &&
        revisionAtStart === this.draftRevision &&
        this.saveState === 'checking'
      ) {
        this.saveState = stateBeforeCheck === 'dirty' ? 'dirty' : 'error';
        this.fieldErrors = this.mergeDraftFieldErrors({
          eligibility: 'eligibility_check_failed',
        });
        this.emit();
      }
      throw error;
    }
  }

  async saveAndActivate(): Promise<void> {
    if (this.saveInFlight) {
      throw new Error('agent_config_save_in_progress');
    }
    const releaseLease = this.deps.taskState.tryAcquireActivationLease();
    if (!releaseLease) {
      throw new Error(
        this.deps.taskState.isTaskRunning()
          ? 'agent_config_task_running'
          : 'agent_config_activation_busy',
      );
    }
    this.saveInFlight = true;
    const candidateRevision = this.draftRevision;
    const candidate: ActivationCandidate = cloneAndFreeze({
      config: this.draft,
      connections: this.connections,
      eligibility: this.eligibility,
    });
    this.eligibilityGeneration += 1;
    try {
      this.saveState = 'saving';
      this.fieldErrors = this.deriveDraftFieldErrors();
      this.emit();
      const validation = validateAgentConfig(
        candidate.config,
        candidate.connections,
        candidate.eligibility,
      );
      const validationErrors = validation.ok ? [] : [...validation.errors];
      if (
        !isValidMaxSteps(candidate.config.maxSteps) &&
        !validationErrors.includes('max_steps_invalid')
      ) {
        validationErrors.push('max_steps_invalid');
      }
      if (validationErrors.length > 0) {
        this.fieldErrors = this.deriveDraftFieldErrors();
        throw new Error('agent_config_invalid');
      }
      const credentialsPresent = await this.resolveActiveCredentials(
        candidate.config,
        candidate.connections,
      );
      if (!credentialsPresent) {
        this.fieldErrors =
          candidateRevision === this.draftRevision
            ? this.mergeDraftFieldErrors({
                credential: 'connection_secret_unavailable',
              })
            : this.deriveDraftFieldErrors();
        throw new Error('agent_config_secret_unresolvable');
      }
      await this.deps.repository.save(
        candidate.config,
        candidate.connections,
        candidate.eligibility,
      );
      this.activeConfig = clone(candidate.config);
      this.activeConnections = clone(candidate.connections);
      this.activeEligibility = clone(candidate.eligibility);
      this.activeRunnable = true;
      this.saveState =
        candidateRevision === this.draftRevision ? 'saved' : 'dirty';
      this.fieldErrors = this.deriveDraftFieldErrors();
      this.emit();
      await this.cleanupOrphanedCredentials(candidate.connections);
    } catch (error) {
      const draftChanged = candidateRevision !== this.draftRevision;
      this.saveState = draftChanged ? 'dirty' : 'error';
      if (draftChanged) {
        this.fieldErrors = this.deriveDraftFieldErrors();
      } else if (Object.keys(this.fieldErrors).length === 0) {
        this.fieldErrors = this.mergeDraftFieldErrors({
          save: 'agent_config_save_failed',
        });
      }
      this.emit();
      throw error;
    } finally {
      this.saveInFlight = false;
      releaseLease();
    }
  }

  async initializeActiveRunnable(): Promise<void> {
    this.activeRunnable = await this.isRunnable(
      this.activeConfig,
      this.activeConnections,
      this.activeEligibility,
    );
  }

  private markDirty(): void {
    this.draftRevision += 1;
    this.saveState = 'dirty';
    this.fieldErrors = this.deriveDraftFieldErrors();
    this.emit();
  }

  private async isRunnable(
    config: AgentConfigV2,
    connections: readonly ModelConnection[],
    eligibility: EligibilityReport,
  ): Promise<boolean> {
    if (
      !isValidMaxSteps(config.maxSteps) ||
      !validateAgentConfig(config, connections, eligibility).ok
    ) {
      return false;
    }
    return this.resolveActiveCredentials(config, connections);
  }

  private deriveDraftFieldErrors(): Record<string, string> {
    const validation = validateAgentConfig(
      this.draft,
      this.connections,
      this.eligibility,
    );
    const errors = validation.ok ? [] : [...validation.errors];
    if (
      !isValidMaxSteps(this.draft.maxSteps) &&
      !errors.includes('max_steps_invalid')
    ) {
      errors.push('max_steps_invalid');
    }
    return Object.fromEntries(
      errors.map(error => [
        error === 'max_steps_invalid' ? 'maxSteps' : error,
        error,
      ]),
    );
  }

  private mergeDraftFieldErrors(
    extra: Record<string, string>,
  ): Record<string, string> {
    return {...this.deriveDraftFieldErrors(), ...extra};
  }

  private bumpConnectionMutationGeneration(id: string): number {
    const nextGeneration =
      (this.connectionMutationGenerations.get(id) ?? 0) + 1;
    this.connectionMutationGenerations.set(id, nextGeneration);
    return nextGeneration;
  }

  private isCurrentConnectionMutation(
    id: string,
    generation: number,
    expectedSecretRef: string,
  ): boolean {
    return (
      this.connectionMutationGenerations.get(id) === generation &&
      this.connections.some(
        connection =>
          connection.id === id && connection.secretRef === expectedSecretRef,
      )
    );
  }

  private invalidateConnectionTest(id: string): void {
    this.bumpConnectionTestGeneration(id);
    this.connectionStatuses = {
      ...this.connectionStatuses,
      [id]: 'untested',
    };
  }

  private reserveVersionedSecretRef(connectionId: string): string {
    const idGenerator = this.deps.idGenerator ?? defaultIdGenerator;
    const secretRef = idGenerator.nextSecretRef(connectionId);
    const conflicts =
      !secretRef.trim() ||
      this.connections.some(connection => connection.secretRef === secretRef) ||
      this.activeConnections.some(
        connection => connection.secretRef === secretRef,
      ) ||
      this.pendingCredentialCleanup.has(secretRef) ||
      this.reservedSecretRefs.has(secretRef);
    if (conflicts) {
      throw new Error('agent_config_secret_ref_conflict');
    }
    this.reservedSecretRefs.add(secretRef);
    return secretRef;
  }

  private async discardUncommittedSecretRef(secretRef: string): Promise<void> {
    this.reservedSecretRefs.delete(secretRef);
    const isReferenced =
      this.connections.some(connection => connection.secretRef === secretRef) ||
      this.activeConnections.some(
        connection => connection.secretRef === secretRef,
      );
    if (isReferenced) {
      return;
    }
    this.pendingCredentialCleanup.add(secretRef);
    try {
      await this.deps.credentialStore.delete(secretRef);
      this.pendingCredentialCleanup.delete(secretRef);
    } catch {
      // Retry after the next successful durable save in this session.
    }
  }

  private bumpConnectionTestGeneration(id: string): number {
    const nextGeneration = (this.connectionTestGenerations.get(id) ?? 0) + 1;
    this.connectionTestGenerations.set(id, nextGeneration);
    return nextGeneration;
  }

  private isCurrentConnectionTest(id: string, generation: number): boolean {
    return (
      this.connectionTestGenerations.get(id) === generation &&
      this.connections.some(connection => connection.id === id)
    );
  }

  private async cleanupOrphanedCredentials(
    persistedConnections: readonly ModelConnection[],
  ): Promise<void> {
    const referencedSecretRefs = new Set(
      persistedConnections.map(connection => connection.secretRef),
    );
    const orphanedSecretRefs = [...this.pendingCredentialCleanup].filter(
      secretRef =>
        !referencedSecretRefs.has(secretRef) &&
        !this.connections.some(
          connection => connection.secretRef === secretRef,
        ),
    );
    await Promise.all(
      orphanedSecretRefs.map(async secretRef => {
        try {
          await this.deps.credentialStore.delete(secretRef);
          this.pendingCredentialCleanup.delete(secretRef);
        } catch {
          // Persistence already succeeded. Retain this ref for the next save.
        }
      }),
    );
  }

  private async resolveActiveCredentials(
    config: AgentConfigV2,
    connections: readonly ModelConnection[],
  ): Promise<boolean> {
    const connectionById = new Map(
      connections.map(connection => [connection.id, connection]),
    );
    try {
      const secrets = await Promise.all(
        activeConnectionIds(config).map(id => {
          const connection = id ? connectionById.get(id) : undefined;
          return connection
            ? this.deps.credentialStore.get(connection.secretRef)
            : undefined;
        }),
      );
      return secrets.every(
        secret => typeof secret === 'string' && secret.trim().length > 0,
      );
    } catch {
      return false;
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch {
        // Subscribers are observers and cannot interrupt the controller state machine.
      }
    });
  }
}

export async function createAgentConfigController(
  deps: AgentConfigControllerDependencies,
): Promise<AgentConfigController> {
  const initial = await deps.repository.load();
  const controller = new AgentConfigControllerImpl(deps, initial, false);
  await controller.initializeActiveRunnable();
  return controller;
}
