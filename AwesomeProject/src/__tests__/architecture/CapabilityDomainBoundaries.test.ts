// Task 12 architecture guard for the capability domains. It scans the
// capability-owned core/feature/bridge production files for boundary
// violations: React Native/domain imports and Screen wiring in mobile modules,
// product transport names or bridge adapter imports in mobile code, legacy
// OpenClaw migration symbols anywhere in the capability wave, and re-declared
// primary Visual Agent contracts. It also proves the adapter directories,
// manifests, conformance fixtures, and built-in registry agree on exactly the
// five canonical tool ids.
import fs from 'node:fs';
import path from 'node:path';

import {createBuiltInVisualAgentToolRegistry} from '../../connectorBridge/visualAgent/BuiltInVisualAgentToolRegistry';
import {openClawManifest} from '../../connectorBridge/visualAgent/adapters/openclaw/OpenClawAdapter';
import {codexManifest} from '../../connectorBridge/visualAgent/adapters/codex/CodexAdapter';
import {cursorManifest} from '../../connectorBridge/visualAgent/adapters/cursor/CursorAdapter';
import {dshManifest} from '../../connectorBridge/visualAgent/adapters/dsh/DshAdapter';
import {hermesManifest} from '../../connectorBridge/visualAgent/adapters/hermes/HermesAdapter';
import {createOpenClawConformanceFixture} from '../../connectorBridge/visualAgent/adapters/openclaw/conformanceFixture';
import {createCodexConformanceFixture} from '../../connectorBridge/visualAgent/adapters/codex/conformanceFixture';
import {createCursorConformanceFixture} from '../../connectorBridge/visualAgent/adapters/cursor/conformanceFixture';
import {dshConformanceFixture} from '../../connectorBridge/visualAgent/adapters/dsh/conformanceFixture';
import {hermesConformanceFixture} from '../../connectorBridge/visualAgent/adapters/hermes/conformanceFixture';

const SRC_ROOT = path.resolve(__dirname, '../../');

const read = (relative: string): string =>
  fs.readFileSync(path.join(SRC_ROOT, relative), 'utf8');

function walkTs(relativeDir: string): string[] {
  const abs = path.join(SRC_ROOT, relativeDir);
  if (!fs.existsSync(abs)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, {withFileTypes: true})) {
    const relative = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') {
        continue;
      }
      out.push(...walkTs(relative));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(relative);
    }
  }
  return out;
}

const MOBILE_FEATURE_DIRS = [
  'features/visualAgent',
  'features/preference',
  'features/companion',
  'features/errand',
];

const mobileFiles = MOBILE_FEATURE_DIRS.flatMap(walkTs).map(file => ({
  file,
  text: read(file),
}));

const capabilityOwnedProductionFiles = [
  ...MOBILE_FEATURE_DIRS,
  'connectorBridge/visualAgent',
  'core/engine/operateRuntime/visualAgent',
]
  .flatMap(walkTs)
  .map(file => ({file, text: read(file)}));

const PRIMARY_CONTRACTS = [
  'VisualAgentToolId',
  'VisualAgentProfileV1',
  'VisualAgentCapabilitySet',
  'VisualAgentTaskEnvelopeV1',
  'VisualAgentConnectionState',
  'VisualAgentProtocolV1',
  'VisualAgentToolAdapter',
  'VisualAgentExecutionPort',
  'VisualAgentToolRegistry',
  'VisualAgentToolManifestV1',
  'VisualAgentRunStatus',
];

const CONTRACTS_FILE = 'core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts';

describe('CapabilityDomainBoundaries', () => {
  it('keeps mobile modules away from product transports and bridge adapters', () => {
    const forbidden =
      /child_process|acp_json_rpc|gateway_ws|runs_http_sse|connectorBridge\/visualAgent\/adapters/;
    for (const {file, text} of mobileFiles) {
      expect({file, text}).not.toEqual(
        expect.objectContaining({text: expect.stringMatching(forbidden)}),
      );
    }
  });

  it('keeps React Native, storage, navigation, and Screen wiring out of mobile modules', () => {
    const forbidden =
      /from '(react|react-native|@react-native-async-storage[^']*|@react-navigation[^']*|[^']*NativeModules[^']*|[^']*Screen[^']*)'|require\(['"]react/;
    for (const {file, text} of mobileFiles) {
      expect({file}).toEqual({file});
      expect(text).not.toMatch(forbidden);
    }
  });

  it('keeps legacy OpenClaw migration exclusively in Runtime Task 4B', () => {
    const capabilityProduction = capabilityOwnedProductionFiles
      .map(({text}) => text)
      .join('\n');
    expect(capabilityProduction).not.toMatch(
      /RuntimeConfigMigrationV1|LegacyOpenClawBindingPort|migrateLegacyOpenClawConfig|@nono:openclaw/,
    );
  });

  it('declares the primary Visual Agent contracts only in the runtime contracts file', () => {
    const contractsText = read(CONTRACTS_FILE);
    for (const name of PRIMARY_CONTRACTS) {
      expect(contractsText).toMatch(new RegExp(`export (interface|type) ${name}\\b`));
    }
    for (const {file, text} of capabilityOwnedProductionFiles) {
      if (file === CONTRACTS_FILE) {
        continue;
      }
      for (const name of PRIMARY_CONTRACTS) {
        expect(text).not.toMatch(new RegExp(`export (interface|type) ${name}\\b`));
      }
    }
  });

  it('re-exports the frozen contracts type-only from the visual agent barrel', () => {
    const barrel = read('features/visualAgent/index.ts');
    expect(barrel).toMatch(/export \{VisualAgentFacade\}/);
    expect(barrel).toMatch(/export type \{VisualAgentViewState\}/);
    expect(barrel).toMatch(/VisualAgentContracts/);
    for (const name of PRIMARY_CONTRACTS) {
      expect(barrel).toMatch(new RegExp(`\\b${name}\\b`));
      // No barrel-local declaration; only re-exports are allowed.
      expect(barrel).not.toMatch(new RegExp(`export (interface|type) ${name}\\b`));
    }
    expect(barrel).not.toMatch(/export interface |export class /);
  });

  it('agrees on exactly the five canonical tool ids across dirs, manifests, fixtures, and registry', () => {
    const canonical = ['codex', 'cursor', 'dsh', 'hermes', 'openclaw'];

    const adapterDirs = fs
      .readdirSync(path.join(SRC_ROOT, 'connectorBridge/visualAgent/adapters'), {
        withFileTypes: true,
      })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();

    const registryIds = [...createBuiltInVisualAgentToolRegistry().list()].sort();

    const manifestIds = [
      openClawManifest,
      codexManifest,
      cursorManifest,
      dshManifest,
      hermesManifest,
    ]
      .map(manifest => manifest.toolId)
      .sort();

    const fixtureIds = [
      createOpenClawConformanceFixture().toolId,
      createCodexConformanceFixture().toolId,
      createCursorConformanceFixture().toolId,
      dshConformanceFixture.toolId,
      hermesConformanceFixture.toolId,
    ].sort();

    expect(adapterDirs).toEqual(canonical);
    expect(registryIds).toEqual(canonical);
    expect(manifestIds).toEqual(canonical);
    expect(fixtureIds).toEqual(canonical);
  });

  it('exposes no OpenClawFacade or VisualAgentAdapterRegistry public symbol and no features/openclaw barrel', () => {
    const capabilityProduction = capabilityOwnedProductionFiles
      .map(({text}) => text)
      .join('\n');
    expect(capabilityProduction).not.toMatch(/OpenClawFacade|VisualAgentAdapterRegistry/);
    expect(fs.existsSync(path.join(SRC_ROOT, 'features/openclaw'))).toBe(false);
  });
});
