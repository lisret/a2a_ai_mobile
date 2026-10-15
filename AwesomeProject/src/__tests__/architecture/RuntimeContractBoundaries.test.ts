import fs from 'node:fs';
import path from 'node:path';

import {
  validateModelBindingV1,
  validateModelEndpointProfileV1,
} from '../../core/engine/operateRuntime/model/ModelProviderContracts';
import {
  validateVisualAgentCapabilitySet,
  validateVisualAgentProfileV1,
} from '../../core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import * as contractIndex from '../../core/engine/operateRuntime/contracts';

const SRC_ROOT = path.resolve(__dirname, '../../');

const CONTRACT_FILES = {
  model: 'core/engine/operateRuntime/model/ModelProviderContracts.ts',
  visualAgent: 'core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts',
  runtimeConfig: 'core/engine/operateRuntime/contracts/RuntimeConfigContracts.ts',
  session: 'core/engine/operateRuntime/contracts/OperateSessionContracts.ts',
  credentialStore: 'core/engine/operateRuntime/contracts/CredentialStore.ts',
  taskExecution: 'core/engine/operateRuntime/contracts/TaskExecutionContracts.ts',
  contractsIndex: 'core/engine/operateRuntime/contracts/index.ts',
  uiRuntime: 'application/facades/UiRuntimeContracts.ts',
} as const;

const read = (relative: string): string =>
  fs.readFileSync(path.join(SRC_ROOT, relative), 'utf8');

describe('RuntimeContractBoundaries', () => {
  it('freezes every contract production file with its named exports', () => {
    for (const relative of Object.values(CONTRACT_FILES)) {
      expect(fs.existsSync(path.join(SRC_ROOT, relative))).toBe(true);
    }

    expect(read(CONTRACT_FILES.model)).toMatch(
      /export function validateModelEndpointProfileV1/,
    );
    expect(read(CONTRACT_FILES.model)).toMatch(
      /export function validateModelBindingV1/,
    );
    expect(read(CONTRACT_FILES.model)).toMatch(/export type ProviderPresetV1/);
    expect(read(CONTRACT_FILES.visualAgent)).toMatch(
      /export function validateVisualAgentCapabilitySet/,
    );
    expect(read(CONTRACT_FILES.visualAgent)).toMatch(
      /export function validateVisualAgentProfileV1/,
    );
    expect(read(CONTRACT_FILES.runtimeConfig)).toMatch(
      /export interface RuntimeConfigEnvelopeV1/,
    );
    expect(read(CONTRACT_FILES.runtimeConfig)).toMatch(
      /export interface RuntimeConfigRepository/,
    );
    expect(read(CONTRACT_FILES.session)).toMatch(
      /export interface ResolvedOperateSessionV1/,
    );
    expect(read(CONTRACT_FILES.session)).toMatch(
      /export interface OperateSessionLease/,
    );
    expect(read(CONTRACT_FILES.credentialStore)).toMatch(
      /export interface CredentialStore/,
    );
    expect(read(CONTRACT_FILES.taskExecution)).toMatch(
      /export interface OperateTaskEventBase/,
    );
    expect(read(CONTRACT_FILES.taskExecution)).toMatch(/TaskExecutionEvent/);

    expect(typeof validateModelEndpointProfileV1).toBe('function');
    expect(typeof validateModelBindingV1).toBe('function');
    expect(typeof validateVisualAgentCapabilitySet).toBe('function');
    expect(typeof validateVisualAgentProfileV1).toBe('function');
    expect(typeof contractIndex).toBe('object');
  });

  it('shapes the runtime config envelope around active/draft with a visualAgent group', () => {
    const text = read(CONTRACT_FILES.runtimeConfig);
    for (const field of ['schemaVersion', 'revision', 'active', 'draft']) {
      expect(text).toMatch(new RegExp(`\\b${field}\\b`));
    }
    expect(text).toMatch(/visualAgent/);
  });

  it('never names openClaw as a persisted field, only openclaw as a toolId literal', () => {
    for (const relative of Object.values(CONTRACT_FILES)) {
      expect(read(relative)).not.toMatch(/openClaw/);
    }
    expect(read(CONTRACT_FILES.visualAgent)).toMatch(/'openclaw'/);
  });

  it('keeps compareAndActivate on the runtime config repository', () => {
    expect(read(CONTRACT_FILES.runtimeConfig)).toMatch(
      /compareAndActivate\(\s*expectedRevision: number/,
    );
  });

  it('imports no react, native, storage, or navigation modules', () => {
    const forbidden =
      /from '(react|react-native|@react-native-async-storage[^']*|@react-navigation[^']*|.*NativeModules[^']*)'|require\(['"]react/;
    for (const relative of Object.values(CONTRACT_FILES)) {
      expect(read(relative)).not.toMatch(forbidden);
    }
  });

  it('never lets a credential, profile, or session type carry an apiKey', () => {
    for (const relative of [
      CONTRACT_FILES.credentialStore,
      CONTRACT_FILES.model,
      CONTRACT_FILES.visualAgent,
      CONTRACT_FILES.runtimeConfig,
      CONTRACT_FILES.session,
      CONTRACT_FILES.taskExecution,
    ]) {
      expect(read(relative)).not.toMatch(/apiKey/);
    }
  });
});
