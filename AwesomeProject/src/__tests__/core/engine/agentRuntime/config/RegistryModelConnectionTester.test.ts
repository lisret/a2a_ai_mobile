import {RegistryModelConnectionTester} from '../../../../../core/engine/agentRuntime/config/RegistryModelConnectionTester';
import {createModelProviderRegistry} from '../../../../../core/engine/operateRuntime/model/ModelProviderRegistry';
import type {CredentialStore} from '../../../../../core/engine/operateRuntime/contracts/CredentialStore';
import type {ModelCatalogCache} from '../../../../../core/engine/operateRuntime/model/ModelProviderContracts';
import type {ModelConnection} from '../../../../../core/engine/agentRuntime/domain/AgentTypes';

const cache: ModelCatalogCache = {
  read: jest.fn().mockResolvedValue(null),
  write: jest.fn().mockResolvedValue(undefined),
  deleteProfile: jest.fn().mockResolvedValue(undefined),
};

const connection: ModelConnection = {
  id: 'conn-1',
  providerId: 'zhipu',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  modelName: 'glm-4v',
  secretRef: 'model:zhipu',
  capabilities: {vision: true, jsonOutput: true, toolCalls: true, thinking: false},
};

describe('RegistryModelConnectionTester', () => {
  it('normalizes the connection through the registry and sends the exact target', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {get: () => null},
      text: async () => JSON.stringify({choices: [{message: {content: '{"ok":true}'}}]}),
    });
    const credentials: CredentialStore = {
      isAvailable: jest.fn().mockResolvedValue(true),
      put: jest.fn(),
      get: jest.fn().mockResolvedValue('z-secret'),
      delete: jest.fn(),
    };
    const registry = createModelProviderRegistry({
      credentials,
      fetchImpl: fetchImpl as never,
      cache,
      now: () => 1,
    });
    await new RegistryModelConnectionTester(registry).test(connection, async () => 'z-secret');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer z-secret');
    expect(JSON.parse(init.body).model).toBe('glm-4v');
  });

  it('surfaces a sanitized transport failure on auth error', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: {get: () => null},
      text: async () => '{}',
    });
    const credentials: CredentialStore = {
      isAvailable: jest.fn().mockResolvedValue(true),
      put: jest.fn(),
      get: jest.fn().mockResolvedValue('z-secret'),
      delete: jest.fn(),
    };
    const registry = createModelProviderRegistry({
      credentials,
      fetchImpl: fetchImpl as never,
      cache,
      now: () => 1,
    });
    await expect(
      new RegistryModelConnectionTester(registry).test(connection, async () => 'z-secret'),
    ).rejects.toThrow('provider_transport_auth_failed');
  });
});
