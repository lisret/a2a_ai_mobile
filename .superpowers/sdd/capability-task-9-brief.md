### Task 9: Worker A — OpenClaw Gateway WebSocket Adapter

**Files:**

- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/openclaw/OpenClawAdapter.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/openclaw/OpenClawBinding.ts`
- Create: `AwesomeProject/src/connectorBridge/visualAgent/adapters/openclaw/conformanceFixture.ts`
- Test: `AwesomeProject/src/__tests__/connectorBridge/visualAgent/openclaw/OpenClawAdapter.test.ts`

**Interfaces:**

- Consumes: frozen `VisualAgentToolAdapter`/`VisualAgentExecutionPort`、`VisualAgentUpstreamPort` mode `gateway_ws`、sanitized binding `{gatewayUrl, deviceId, cluster, secretRef}`。
- Produces: adapter `toolId='openclaw'`, Gateway WS message mapping, capability mapping, and conformance fixture。

```ts
export interface OpenClawBindingV1 {
  readonly schemaVersion: 1;
  readonly toolId: 'openclaw';
  readonly protocol: 'gateway_ws';
  readonly gatewayUrl: string;
  readonly deviceId: string;
  readonly cluster: string;
  readonly secretRef: string | null;
}

export class OpenClawAdapter implements VisualAgentToolAdapter {
  readonly toolId = 'openclaw' as const;
  readonly manifest = openClawManifest;
  constructor(bindings: VisualAgentBindingPort, upstream: VisualAgentUpstreamPort, timer: TimerPort);
  create(profile: VisualAgentProfileV1): VisualAgentExecutionPort;
}
```

- [ ] **Step 1: Write failing mapping/correlation tests**

```ts
it('maps one normalized task to one Gateway task and correlates cancellation', async () => {
  await execution.execute(envelope, signal);
  expect(upstreamSession.send).toHaveBeenCalledWith(expect.objectContaining({type: 'task.start', taskId: 't1', sessionRevision: 3}));
  await execution.cancel({taskId: 't1', sessionRevision: 3}, signal);
  expect(upstreamSession.send).toHaveBeenCalledWith(expect.objectContaining({type: 'task.cancel', taskId: 't1', sessionRevision: 3}));
});

it('never connects when Gateway capabilities omit requested image input', async () => {
  upstreamSession.negotiate.mockResolvedValue({...allCapabilities, imageInput: false});
  await expect(execution.connect(profile, signal)).rejects.toThrow('visual_agent_capability_unsupported');
});

defineVisualAgentAdapterConformance(openClawConformanceFixture, requiredConformance);
```

- [ ] **Step 2: Run test and verify red**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/openclaw/OpenClawAdapter.test.ts`

Expected: FAIL with missing OpenClaw adapter.

- [ ] **Step 3: Implement strict Gateway mapping**

Validate only `wss:` URL, nonempty device/cluster and opaque ref. Authenticate before ready, map Gateway accepted/event/completed/failed/cancelled into normalized status/event/terminal messages, require heartbeat acknowledgment, reject all pending requests on disconnect, and map all public failures to generic codes. Preference and steer operations are enabled only if Gateway negotiation explicitly returns the corresponding capability; otherwise each fails before sending. No local pipeline or HTTP fallback exists.

- [ ] **Step 4: Run targeted tests and type checking**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/openclaw/OpenClawAdapter.test.ts && npx tsc --noEmit`

Expected: `1 passed`; OpenClaw mapping assertions pass; TypeScript exits 0.

- [ ] **Step 5: Commit Worker A files**

```bash
git add AwesomeProject/src/connectorBridge/visualAgent/adapters/openclaw AwesomeProject/src/__tests__/connectorBridge/visualAgent/openclaw
git commit -m "feat: add openclaw visual agent adapter"
```

