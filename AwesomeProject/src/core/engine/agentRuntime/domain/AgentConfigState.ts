import {AgentConfigV2, EligibilityReport, ModelConnection} from './AgentTypes';

export interface AgentTaskConfigSnapshot {
  readonly config: Readonly<AgentConfigV2>;
  readonly connections: Readonly<Record<string, ModelConnection>>;
  readonly eligibility?: Readonly<EligibilityReport>;
}

const cloneAndFreeze = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(item => cloneAndFreeze(item))) as T;
  }
  if (value !== null && typeof value === 'object') {
    const copy = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        cloneAndFreeze(item),
      ]),
    );
    return Object.freeze(copy) as T;
  }
  return value;
};

export class AgentConfigState {
  private config: AgentConfigV2;
  private connections: ModelConnection[];
  private eligibility?: EligibilityReport;

  constructor(
    config: AgentConfigV2,
    connections: readonly ModelConnection[],
    eligibility?: EligibilityReport,
  ) {
    this.config = cloneAndFreeze(config) as AgentConfigV2;
    this.connections = cloneAndFreeze(connections) as ModelConnection[];
    this.eligibility = eligibility
      ? (cloneAndFreeze(eligibility) as EligibilityReport)
      : undefined;
  }

  replaceConfig(config: AgentConfigV2): void {
    this.config = cloneAndFreeze(config) as AgentConfigV2;
  }

  replaceConnections(connections: readonly ModelConnection[]): void {
    this.connections = cloneAndFreeze(connections) as ModelConnection[];
  }

  replaceEligibility(eligibility?: EligibilityReport): void {
    this.eligibility = eligibility
      ? (cloneAndFreeze(eligibility) as EligibilityReport)
      : undefined;
  }

  createTaskSnapshot(): AgentTaskConfigSnapshot {
    const connections = Object.fromEntries(
      this.connections.map(connection => [
        connection.id,
        cloneAndFreeze(connection),
      ]),
    ) as Record<string, ModelConnection>;
    return Object.freeze({
      config: cloneAndFreeze(this.config),
      connections: cloneAndFreeze(connections),
      ...(this.eligibility
        ? {eligibility: cloneAndFreeze(this.eligibility)}
        : {}),
    });
  }
}
