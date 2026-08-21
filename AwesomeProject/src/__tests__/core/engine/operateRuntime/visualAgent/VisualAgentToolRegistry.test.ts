import {createVisualAgentToolRegistry} from '../../../../../core/engine/operateRuntime/visualAgent/VisualAgentToolRegistry';
import type {
  VisualAgentCapabilitySet,
  VisualAgentExecutionPort,
  VisualAgentToolAdapter,
  VisualAgentToolId,
} from '../../../../../core/engine/operateRuntime/visualAgent/VisualAgentContracts';

const caps: VisualAgentCapabilitySet = {
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
};

const adapter = (toolId: VisualAgentToolId): VisualAgentToolAdapter => ({
  toolId,
  manifest: {
    toolId,
    displayName: `Tool ${toolId}`,
    maturity: 'stable',
    adapterVersion: '1.0.0',
    protocolVersions: [1],
    declaredCapabilities: caps,
  },
  create: () => ({}) as VisualAgentExecutionPort,
});

const builtIns = (['openclaw', 'codex', 'cursor', 'dsh', 'hermes'] as const).map(adapter);

describe('createVisualAgentToolRegistry', () => {
  it('keeps one immutable registry contract with canonical tool ids', () => {
    const registry = createVisualAgentToolRegistry(builtIns);
    expect(registry.list()).toEqual(['openclaw', 'codex', 'cursor', 'dsh', 'hermes']);
    expect(() => registry.require('custom:missing')).toThrow(
      'visual_agent_adapter_not_found',
    );
    expect(() => createVisualAgentToolRegistry([...builtIns, builtIns[0]])).toThrow(
      'visual_agent_adapter_duplicate',
    );
  });

  it('rejects an adapter whose manifest toolId disagrees', () => {
    const broken = {...adapter('codex'), toolId: 'cursor' as VisualAgentToolId};
    expect(() => createVisualAgentToolRegistry([broken])).toThrow(
      'visual_agent_invalid_profile',
    );
  });

  it('rejects an adapter that does not declare protocol version [1]', () => {
    const broken: VisualAgentToolAdapter = {
      ...adapter('codex'),
      manifest: {...adapter('codex').manifest, protocolVersions: [1, 1] as unknown as readonly [1]},
    };
    expect(() => createVisualAgentToolRegistry([broken])).toThrow(
      'visual_agent_protocol_error',
    );
  });

  it('accepts a valid custom tool id', () => {
    const registry = createVisualAgentToolRegistry([adapter('custom:acme')]);
    expect(registry.require('custom:acme').toolId).toBe('custom:acme');
  });
});
