### Task 10: Worker B — Codex and Cursor Adapters

**Files:**

- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/codex/CodexAdapter.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/codex/CodexBinding.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/codex/conformanceFixture.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/cursor/CursorAdapter.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/cursor/CursorBinding.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/cursor/conformanceFixture.ts`
- Test: `AwesomeProject/src/__tests__/connectorBridge/visualAgent/codex/CodexAdapter.test.ts`
- Test: `AwesomeProject/src/__tests__/connectorBridge/visualAgent/cursor/CursorAdapter.test.ts`

**Interfaces:**

- Consumes: frozen adapter contract; upstream modes `cli_exec_jsonl | app_server_json_rpc_stdio` for Codex and `agent_cli_ndjson | acp_json_rpc_stdio | cloud_agents_http` for Cursor.
- Produces: `codex` and `cursor` adapters plus independent conformance fixtures。

```ts
export type CodexBindingV1 = {
  readonly schemaVersion: 1;
  readonly toolId: 'codex';
  readonly protocol: 'cli_exec_jsonl' | 'app_server_json_rpc_stdio';
  readonly executable: 'codex';
  readonly cwd: string;
  readonly args: readonly string[];
  readonly secretRef: string | null;
};

export type CursorBindingV1 = {
  readonly schemaVersion: 1;
  readonly toolId: 'cursor';
  readonly protocol: 'agent_cli_ndjson' | 'acp_json_rpc_stdio' | 'cloud_agents_http';
  readonly endpointOrExecutable: string;
  readonly cwd: string | null;
  readonly args: readonly string[];
  readonly secretRef: string | null;
};

export class CodexAdapter implements VisualAgentToolAdapter {
  readonly toolId = 'codex' as const;
  readonly manifest = codexManifest;
  constructor(bindings: VisualAgentBindingPort, upstream: VisualAgentUpstreamPort);
  create(profile: VisualAgentProfileV1): VisualAgentExecutionPort;
}
export class CursorAdapter implements VisualAgentToolAdapter {
  readonly toolId = 'cursor' as const;
  readonly manifest = cursorManifest;
  constructor(bindings: VisualAgentBindingPort, upstream: VisualAgentUpstreamPort);
  create(profile: VisualAgentProfileV1): VisualAgentExecutionPort;
}
```

- [ ] **Step 1: Write failing Codex transport-selection and approval tests**

```ts
it.each(['cli_exec_jsonl', 'app_server_json_rpc_stdio'] as const)('uses one configured Codex mode: %s', async protocol => {
  const execution = createCodex(protocol);
  await execution.execute(envelope, signal);
  expect(upstream.open).toHaveBeenCalledWith(expect.objectContaining({protocol}));
  expect(upstream.open).toHaveBeenCalledTimes(1);
});

it('maps App Server approval without auto-approving', async () => {
  upstreamSession.emit({method: 'approval/request', params: {id: 'a1'}});
  expect(events.at(-1)).toEqual(expect.objectContaining({status: 'waiting_approval', approvalId: 'a1'}));
  expect(upstreamSession.send).not.toHaveBeenCalledWith(expect.objectContaining({decision: 'approve'}));
});
```

- [ ] **Step 2: Write failing Cursor mode/capability tests**

```ts
it.each(['agent_cli_ndjson', 'acp_json_rpc_stdio', 'cloud_agents_http'] as const)('maps the configured Cursor mode: %s', async protocol => {
  await createCursor(protocol).execute(envelope, signal);
  expect(upstream.open).toHaveBeenCalledWith(expect.objectContaining({protocol}));
});

it('does not claim cancel for a CLI profile that cannot acknowledge it', async () => {
  await expect(createCursor('agent_cli_ndjson').connect(profileRequiringCancel, signal))
    .rejects.toThrow('visual_agent_capability_unsupported');
});

defineVisualAgentAdapterConformance(codexConformanceFixture, requiredConformance);
defineVisualAgentAdapterConformance(cursorConformanceFixture, requiredConformance);
```

- [ ] **Step 3: Run tests and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/codex/CodexAdapter.test.ts src/__tests__/connectorBridge/visualAgent/cursor/CursorAdapter.test.ts`

Expected: FAIL with missing Codex/Cursor adapters.

- [ ] **Step 4: Implement Codex mappings**

`cli_exec_jsonl` spawns exactly one bridge-owned child session through `VisualAgentUpstreamPort`, parses JSONL only, closes stdin/process on cancellation, and advertises only observed capabilities. `app_server_json_rpc_stdio` maps request IDs, thread/turn events, approval requests, cancellation and in-flight steer only when the fixture demonstrates correlated input for the same task/session. Do not enable experimental App Server WebSocket in this plan. `codex mcp-server` is excluded from binding modes because it does not provide the complete normalized lifecycle.

- [ ] **Step 5: Implement Cursor mappings**

`agent_cli_ndjson` parses stream-json/NDJSON; `acp_json_rpc_stdio` maps ACP session/prompt/update/cancel; `cloud_agents_http` maps REST create/status/stop plus server stream only when present. The binding chooses one mode. Cloud auth and local CLI auth are separate secret refs. Cursor MCP configuration is not exposed as a transport. Unsupported image/cancel/approval/resume/steer/preferences fail before sending; steer is true only for a mode with a correlated in-flight input primitive.

- [ ] **Step 6: Run targeted tests and type checking**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/codex/CodexAdapter.test.ts src/__tests__/connectorBridge/visualAgent/cursor/CursorAdapter.test.ts && npx tsc --noEmit`

Expected: `2 passed`; Codex/Cursor assertions pass; TypeScript exits 0.

- [ ] **Step 7: Commit Worker B files**

```bash
git add AwesomeProject/src/connectorBridge/visualAgent/adapters/codex AwesomeProject/src/connectorBridge/visualAgent/adapters/cursor AwesomeProject/src/__tests__/connectorBridge/visualAgent/codex AwesomeProject/src/__tests__/connectorBridge/visualAgent/cursor
git commit -m "feat: add codex and cursor visual agent adapters"
```

