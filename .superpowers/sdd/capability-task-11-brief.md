### Task 11: Worker C — DSH and Hermes Adapters

**Files:**

- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/dsh/DshAdapter.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/dsh/DshBinding.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/dsh/conformanceFixture.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/hermes/HermesAdapter.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/hermes/HermesBinding.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/hermes/conformanceFixture.ts`
- Test: `AwesomeProject/src/__tests__/connectorBridge/visualAgent/dsh/DshAdapter.test.ts`
- Test: `AwesomeProject/src/__tests__/connectorBridge/visualAgent/hermes/HermesAdapter.test.ts`

**Interfaces:**

- Consumes: frozen adapter contract; `dsh_cli | custom_bridge` for DSH and `acp_json_rpc_stdio | gateway_json_rpc_stdio | gateway_json_rpc_ws | runs_http_sse` for Hermes.
- Produces: disabled-by-default `dsh` adapter, `hermes` adapter, and conformance fixtures。

```ts
export type DshBindingV1 = {
  readonly schemaVersion: 1;
  readonly toolId: 'dsh';
  readonly product: 'deepseek-harness';
  readonly protocol: 'dsh_cli' | 'custom_bridge';
  readonly version: string;
  readonly endpointOrExecutable: string;
  readonly cwd: string | null;
  readonly args: readonly string[];
  readonly secretRef: string | null;
  readonly enabled: boolean;
  readonly declaredCapabilities: VisualAgentCapabilitySet;
};

export type HermesBindingV1 = {
  readonly schemaVersion: 1;
  readonly toolId: 'hermes';
  readonly protocol: 'acp_json_rpc_stdio' | 'gateway_json_rpc_stdio' | 'gateway_json_rpc_ws' | 'runs_http_sse';
  readonly endpointOrExecutable: string;
  readonly cwd: string | null;
  readonly args: readonly string[];
  readonly secretRef: string | null;
};

export class DshAdapter implements VisualAgentToolAdapter {
  readonly toolId = 'dsh' as const;
  readonly manifest = dshManifest;
  constructor(bindings: VisualAgentBindingPort, upstream: VisualAgentUpstreamPort);
  create(profile: VisualAgentProfileV1): VisualAgentExecutionPort;
}
export class HermesAdapter implements VisualAgentToolAdapter {
  readonly toolId = 'hermes' as const;
  readonly manifest = hermesManifest;
  constructor(bindings: VisualAgentBindingPort, upstream: VisualAgentUpstreamPort);
  create(profile: VisualAgentProfileV1): VisualAgentExecutionPort;
}
```

- [ ] **Step 1: Write failing DSH identity/default-disable tests**

```ts
it('binds dsh only to an explicit DeepSeek Harness binding and remains disabled by default', () => {
  expect(() => adapter.validateBinding({product: 'dify', protocol: 'custom_bridge'}))
    .toThrow('visual_agent_invalid_profile');
  expect(adapter.validateBinding({product: 'deepseek-harness', protocol: 'dsh_cli', enabled: false}))
    .toEqual(expect.objectContaining({enabled: false}));
});

it('does not infer unsupported capabilities from unstructured CLI text', async () => {
  upstreamSession.negotiate.mockResolvedValue(noCapabilities);
  await expect(execution.connect(profileRequiringStream, signal))
    .rejects.toThrow('visual_agent_capability_unsupported');
});
```

- [ ] **Step 2: Write failing Hermes lifecycle tests**

```ts
it.each(['acp_json_rpc_stdio', 'gateway_json_rpc_stdio', 'gateway_json_rpc_ws', 'runs_http_sse'] as const)
('maps one Hermes mode: %s', async protocol => {
  await createHermes(protocol).execute(envelope, signal);
  expect(upstream.open).toHaveBeenCalledWith(expect.objectContaining({protocol}));
});

it('maps run approval, steer/cancel, resume, and inline images only when negotiated', async () => {
  await execution.connect(profile, signal);
  expect(negotiated).toEqual(expect.objectContaining({imageInput: true, approval: true, resume: true}));
});

defineVisualAgentAdapterConformance(dshConformanceFixture, requiredConformance);
defineVisualAgentAdapterConformance(hermesConformanceFixture, requiredConformance);
```

- [ ] **Step 3: Run tests and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/dsh/DshAdapter.test.ts src/__tests__/connectorBridge/visualAgent/hermes/HermesAdapter.test.ts`

Expected: FAIL with missing DSH/Hermes adapters.

- [ ] **Step 4: Implement conservative DSH mapping**

Accept `product='deepseek-harness'` only. `dsh_cli` and `custom_bridge` each require an explicit version and a fixture-declared capability set. Unknown versions and unstructured output fail closed. Default binding `enabled=false`. Do not claim ACP/MCP/HTTP or steer support unless the selected bridge fixture demonstrates it with task/session correlation. Never use Dify as an alias.

- [ ] **Step 5: Implement Hermes mappings**

Map ACP/stdin, TUI Gateway JSON-RPC over stdio or WS, and Runs HTTP+SSE as separate bindings. Runs endpoints map status/events/approval/steer/stop/resume and inline image input only when reported. `hermes mcp serve` is excluded because its messaging bridge is not a complete Visual Agent lifecycle. No binding mode fallback is allowed.

- [ ] **Step 6: Run targeted tests and type checking**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/dsh/DshAdapter.test.ts src/__tests__/connectorBridge/visualAgent/hermes/HermesAdapter.test.ts && npx tsc --noEmit`

Expected: `2 passed`; DSH/Hermes assertions pass; TypeScript exits 0.

- [ ] **Step 7: Commit Worker C files**

```bash
git add AwesomeProject/src/connectorBridge/visualAgent/adapters/dsh AwesomeProject/src/connectorBridge/visualAgent/adapters/hermes AwesomeProject/src/__tests__/connectorBridge/visualAgent/dsh AwesomeProject/src/__tests__/connectorBridge/visualAgent/hermes
git commit -m "feat: add dsh and hermes visual agent adapters"
```

