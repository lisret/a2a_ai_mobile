// The only Visual Agent tool-registry constructor. Immutable, no default selection,
// no OpenClaw branch, no mutable register. Validates manifest truthfulness.
import {
  VisualAgentContractError,
  type VisualAgentToolAdapter,
  type VisualAgentToolId,
  type VisualAgentToolRegistry,
} from './VisualAgentContracts';

const CAPABILITY_KEYS = [
  'imageInput',
  'structuredAction',
  'stream',
  'cancel',
  'approval',
  'resume',
  'steer',
  'preferences',
] as const;

const BUILT_IN_TOOL_IDS: readonly string[] = [
  'openclaw',
  'codex',
  'cursor',
  'dsh',
  'hermes',
];

const isValidToolId = (toolId: VisualAgentToolId): boolean => {
  if (BUILT_IN_TOOL_IDS.includes(toolId)) {
    return true;
  }
  return toolId.startsWith('custom:') && toolId.length > 'custom:'.length;
};

const assertAdapterConformance = (adapter: VisualAgentToolAdapter): void => {
  if (!isValidToolId(adapter.toolId)) {
    throw new VisualAgentContractError('visual_agent_invalid_profile');
  }
  const manifest = adapter.manifest;
  if (manifest.toolId !== adapter.toolId) {
    throw new VisualAgentContractError('visual_agent_invalid_profile');
  }
  if (
    typeof manifest.displayName !== 'string' ||
    manifest.displayName.trim().length === 0 ||
    typeof manifest.adapterVersion !== 'string' ||
    manifest.adapterVersion.trim().length === 0
  ) {
    throw new VisualAgentContractError('visual_agent_invalid_profile');
  }
  if (
    !Array.isArray(manifest.protocolVersions) ||
    manifest.protocolVersions.length !== 1 ||
    manifest.protocolVersions[0] !== 1
  ) {
    throw new VisualAgentContractError('visual_agent_protocol_error');
  }
  for (const key of CAPABILITY_KEYS) {
    if (typeof manifest.declaredCapabilities[key] !== 'boolean') {
      throw new VisualAgentContractError('visual_agent_capability_unsupported');
    }
  }
};

class ImmutableVisualAgentToolRegistry implements VisualAgentToolRegistry {
  private readonly byId: ReadonlyMap<VisualAgentToolId, VisualAgentToolAdapter>;
  private readonly order: readonly VisualAgentToolId[];

  constructor(adapters: readonly VisualAgentToolAdapter[]) {
    const map = new Map<VisualAgentToolId, VisualAgentToolAdapter>();
    const order: VisualAgentToolId[] = [];
    for (const adapter of adapters) {
      assertAdapterConformance(adapter);
      if (map.has(adapter.toolId)) {
        throw new VisualAgentContractError('visual_agent_adapter_duplicate');
      }
      map.set(adapter.toolId, adapter);
      order.push(adapter.toolId);
    }
    this.byId = map;
    this.order = Object.freeze([...order]);
  }

  require(toolId: VisualAgentToolId): VisualAgentToolAdapter {
    const adapter = this.byId.get(toolId);
    if (!adapter) {
      throw new VisualAgentContractError('visual_agent_adapter_not_found');
    }
    return adapter;
  }

  list(): readonly VisualAgentToolId[] {
    return this.order;
  }
}

export function createVisualAgentToolRegistry(
  adapters: readonly VisualAgentToolAdapter[],
): VisualAgentToolRegistry {
  return new ImmutableVisualAgentToolRegistry(adapters);
}
