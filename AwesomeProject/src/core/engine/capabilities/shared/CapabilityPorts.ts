import type {VisualAgentProfileV1} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

// Injected ambient dependencies. Domain code never touches wall-clock time,
// randomness, timers, or storage directly.
export interface Clock {
  now(): number;
}

export interface IdGenerator {
  next(): string;
}

export interface TimerPort {
  schedule(handler: () => void, delayMs: number): () => void;
}

// Capability-wave narrow runtime projection; not a second runtime store.
export interface CapabilityConfigSnapshot {
  readonly revision: number;
  readonly capabilities: {readonly errands: boolean};
  readonly privacy: {
    readonly memoryEnabled: boolean;
    readonly memoryLocation: 'device' | 'visual_agent';
    readonly memoryProfileId: string | null;
  };
  readonly visualAgent: {
    readonly enabled: boolean;
    readonly activeProfileId: string | null;
    readonly profiles: readonly VisualAgentProfileV1[];
  };
}

export interface CapabilityConfigPort {
  read(): Promise<CapabilityConfigSnapshot>;
  compareAndSet(
    expectedRevision: number,
    next: Omit<CapabilityConfigSnapshot, 'revision'>,
  ): Promise<CapabilityConfigSnapshot>;
}
