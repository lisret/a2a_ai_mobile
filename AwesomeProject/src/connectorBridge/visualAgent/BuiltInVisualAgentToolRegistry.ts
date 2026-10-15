// The single built-in Visual Agent tool registry (capability-domain Task 12).
// It composes exactly the five canonical adapters into the frozen, immutable
// `VisualAgentToolRegistry` from Runtime Wave 1 Task 4B. There is no public
// mutable register and no mutable adapter-registry type: registering a new
// `custom:<name>` requires adding its adapter directory, fixture, shared-suite
// invocation, and an entry here in one change. The real upstream transport is
// bound by the Connector Bridge/Orchestrator composition; these adapters are
// constructed here with an "unavailable" transport by default so the registry
// stays a pure catalog until that composition injects live ports.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {TimerPort} from '@core/engine/capabilities/shared/CapabilityPorts';
import {createVisualAgentToolRegistry} from '@core/engine/operateRuntime/visualAgent/VisualAgentToolRegistry';
import type {VisualAgentToolRegistry} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import {CodexAdapter} from './adapters/codex/CodexAdapter';
import {CursorAdapter} from './adapters/cursor/CursorAdapter';
import {DshAdapter} from './adapters/dsh/DshAdapter';
import {HermesAdapter} from './adapters/hermes/HermesAdapter';
import {OpenClawAdapter} from './adapters/openclaw/OpenClawAdapter';
import type {
  VisualAgentBindingPort,
  VisualAgentUpstreamPort,
} from './ports/VisualAgentUpstreamPort';

export interface BuiltInVisualAgentAdapterDeps {
  readonly bindings: VisualAgentBindingPort;
  readonly upstream: VisualAgentUpstreamPort;
  readonly timer: TimerPort;
}

const unavailable = (): never => {
  throw new CapabilityError('visual_agent_not_ready');
};

const UNAVAILABLE_BINDINGS: VisualAgentBindingPort = {
  read: async () => unavailable(),
};

const UNAVAILABLE_UPSTREAM: VisualAgentUpstreamPort = {
  open: async () => unavailable(),
};

const NOOP_TIMER: TimerPort = {
  schedule: () => () => undefined,
};

/**
 * Builds the immutable registry of the five built-in adapters in canonical
 * order. `deps` are only used when an adapter's `create()` is later invoked by
 * the Connector Bridge composition; the registry's `list()`/`require()` catalog
 * is independent of them.
 */
export function createBuiltInVisualAgentToolRegistry(
  deps: BuiltInVisualAgentAdapterDeps = {
    bindings: UNAVAILABLE_BINDINGS,
    upstream: UNAVAILABLE_UPSTREAM,
    timer: NOOP_TIMER,
  },
): VisualAgentToolRegistry {
  const {bindings, upstream, timer} = deps;
  return createVisualAgentToolRegistry([
    new OpenClawAdapter(bindings, upstream, timer),
    new CodexAdapter(bindings, upstream),
    new CursorAdapter(bindings, upstream),
    new DshAdapter(bindings, upstream),
    new HermesAdapter(bindings, upstream),
  ]);
}
