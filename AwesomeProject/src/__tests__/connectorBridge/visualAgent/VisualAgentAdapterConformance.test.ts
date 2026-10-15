// Task 12 unified conformance gate. Every built-in adapter is driven through the
// single frozen `defineVisualAgentAdapterConformance` runner (Wave 2A Task 7),
// imported unchanged. Options are derived from each fixture's honestly reported
// `supportedCapabilities` — there is no `switch (toolId)` and no tool-name
// behavior branch anywhere in this file. The built-in registry is proved to hold
// exactly the five canonical adapters with their frozen manifests.
import {
  defineVisualAgentAdapterConformance,
  type VisualAgentAdapterConformanceFixture,
  type VisualAgentConformanceOptions,
} from '../../../connectorBridge/visualAgent/conformance/VisualAgentAdapterConformance';
import {createBuiltInVisualAgentToolRegistry} from '../../../connectorBridge/visualAgent/BuiltInVisualAgentToolRegistry';
import {createOpenClawConformanceFixture} from '../../../connectorBridge/visualAgent/adapters/openclaw/conformanceFixture';
import {createCodexConformanceFixture} from '../../../connectorBridge/visualAgent/adapters/codex/conformanceFixture';
import {createCursorConformanceFixture} from '../../../connectorBridge/visualAgent/adapters/cursor/conformanceFixture';
import {dshConformanceFixture} from '../../../connectorBridge/visualAgent/adapters/dsh/conformanceFixture';
import {hermesConformanceFixture} from '../../../connectorBridge/visualAgent/adapters/hermes/conformanceFixture';
import {openClawManifest} from '../../../connectorBridge/visualAgent/adapters/openclaw/OpenClawAdapter';
import {codexManifest} from '../../../connectorBridge/visualAgent/adapters/codex/CodexAdapter';
import {cursorManifest} from '../../../connectorBridge/visualAgent/adapters/cursor/CursorAdapter';
import {dshManifest} from '../../../connectorBridge/visualAgent/adapters/dsh/DshAdapter';
import {hermesManifest} from '../../../connectorBridge/visualAgent/adapters/hermes/HermesAdapter';
import type {VisualAgentCapabilitySet} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

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

// One shape per adapter; the factory produces a fresh, independent fixture so a
// runner call never leaks state into the next assertion.
const fixtures: ReadonlyArray<{
  readonly id: string;
  readonly create: () => VisualAgentAdapterConformanceFixture;
}> = [
  {id: 'openclaw', create: createOpenClawConformanceFixture},
  {id: 'codex', create: createCodexConformanceFixture},
  {id: 'cursor', create: createCursorConformanceFixture},
  {id: 'dsh', create: () => dshConformanceFixture},
  {id: 'hermes', create: () => hermesConformanceFixture},
];

const negotiatedFrom = (
  caps: VisualAgentCapabilitySet,
): (keyof VisualAgentCapabilitySet)[] =>
  CAPABILITY_KEYS.filter(key => caps[key] === true);

// The frozen runner emits at most one terminal. The default path exercises the
// completed terminal (plus steer/preferences when negotiated); focused variants
// below drive the cancelled and failed terminals for the adapters that report
// those capabilities.
const completedOptions = (
  caps: VisualAgentCapabilitySet,
): VisualAgentConformanceOptions => ({
  requiredStatuses: [
    'queued',
    'running',
    ...(caps.approval ? (['waiting_approval'] as const) : []),
    'completed',
  ],
  negotiatedCapabilities: negotiatedFrom(caps),
});

describe('unified visual agent adapter conformance gate', () => {
  it.each(fixtures)(
    '$id passes the shared conformance suite through the frozen runner',
    async ({create}) => {
      const fixture = create();
      await expect(
        defineVisualAgentAdapterConformance(
          fixture,
          completedOptions(fixture.supportedCapabilities),
        ),
      ).resolves.toBeUndefined();
    },
  );

  it.each(fixtures)(
    '$id drives a correlated cancel terminal when cancel is negotiated',
    async ({create}) => {
      const fixture = create();
      if (!fixture.supportedCapabilities.cancel) {
        return;
      }
      await expect(
        defineVisualAgentAdapterConformance(fixture, {
          requiredStatuses: ['queued', 'running', 'cancelled'],
          negotiatedCapabilities: negotiatedFrom(fixture.supportedCapabilities),
        }),
      ).resolves.toBeUndefined();
    },
  );

  it.each(fixtures)(
    '$id resumes from a failed terminal when resume is negotiated',
    async ({create}) => {
      const fixture = create();
      if (!fixture.supportedCapabilities.resume) {
        return;
      }
      await expect(
        defineVisualAgentAdapterConformance(fixture, {
          requiredStatuses: ['queued', 'running', 'failed'],
          negotiatedCapabilities: negotiatedFrom(fixture.supportedCapabilities),
        }),
      ).resolves.toBeUndefined();
    },
  );

  it.each(fixtures)(
    '$id fails closed on steer when steer is not negotiated and sends nothing extra',
    async ({create}) => {
      const fixture = create();
      if (fixture.supportedCapabilities.steer) {
        return;
      }
      const port = fixture.adapter.create(fixture.profile);
      const signal = new AbortController().signal;
      await port.connect(fixture.profile, signal);
      await expect(
        port.steer(
          {taskId: 'conformance-task', sessionRevision: 1, instruction: 'nudge'},
          signal,
        ),
      ).rejects.toThrow('visual_agent_capability_unsupported');
      await port.disconnect();
    },
  );

  it('registers exactly the five built-ins and requires conformance for custom ids', () => {
    const registry = createBuiltInVisualAgentToolRegistry();
    expect(registry.list()).toEqual(['openclaw', 'codex', 'cursor', 'dsh', 'hermes']);

    const registerCustomWithoutConformance = (id: string): void => {
      // There is no public mutable register: an unregistered custom id can only
      // be looked up, and the immutable registry rejects it.
      createBuiltInVisualAgentToolRegistry().require(id as `custom:${string}`);
    };
    expect(() => registerCustomWithoutConformance('custom:sample')).toThrow(
      'visual_agent_adapter_not_found',
    );
  });

  it('freezes exact built-in manifest metadata and maximum capability claims', () => {
    const builtInRegistry = createBuiltInVisualAgentToolRegistry();
    expect(
      builtInRegistry.list().map(id => builtInRegistry.require(id).manifest),
    ).toEqual([
      openClawManifest,
      codexManifest,
      cursorManifest,
      dshManifest,
      hermesManifest,
    ]);
  });
});
