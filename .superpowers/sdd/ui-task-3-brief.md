### Task 3: Phone Operate, Visual Agent Tools, Model Config, and Privacy Facades

**Mode:** Wave 1 worker B；可与 Task 2、Task 4 并行；只新增列出的文件。

**Files:**

- Create: `AwesomeProject/src/application/facades/PhoneOperateFacade.ts`
- Create: `AwesomeProject/src/application/facades/VisualAgentToolsFacade.ts`
- Create: `AwesomeProject/src/application/facades/ModelConfigFacade.ts`
- Create: `AwesomeProject/src/application/facades/PrivacyFacade.ts`
- Test: `AwesomeProject/src/__tests__/application/facades/CapabilityFacades.test.ts`

**Interfaces:**

- Consumes: Task 1 已冻结的 `PhoneOperateApplicationPort`、`VisualAgentToolsApplicationPort`、`ModelConfigApplicationPort`、`PrivacyApplicationPort`，不得在 worker 文件中复制或扩展签名。
- Produces: four default facades；所有 readiness/catalog status 在 Screen 以下计算，profile/config mutation 使用 expected revision；OpenClaw 不再拥有专用 Facade。

- [ ] **Step 1: Write RED tests for fail-closed activation and real status**

```ts
import {DefaultPhoneOperateFacade} from '../../../application/facades/PhoneOperateFacade';
import {DefaultVisualAgentToolsFacade} from '../../../application/facades/VisualAgentToolsFacade';
import {DefaultModelConfigFacade} from '../../../application/facades/ModelConfigFacade';
import type {ModelCatalogViewState} from '../../../application/facades/UiRuntimeContracts';

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(next => { resolve = next; });
  return {promise, resolve};
};

describe('capability facades', () => {
  it('refuses activation when the selected mode is not runnable', async () => {
    const state = {
      status: 'ready' as const,
      revision: 4,
      activeMode: 'cloud_direct' as const,
      draftMode: 'local_vision_cloud_planner' as const,
      adbFallbackEnabled: false,
      modes: {
        cloud_direct: {id: 'cloud_direct' as const, label: '云端一体', nodes: [], caption: '', runnable: true, blockers: []},
        cloud_split: {id: 'cloud_split' as const, label: '双云端', nodes: [], caption: '', runnable: true, blockers: []},
        local_vision_cloud_planner: {
          id: 'local_vision_cloud_planner' as const,
          label: '本地视觉', nodes: [], caption: '', runnable: false,
          blockers: [{code: 'local_model_not_ready' as const, message: '本地视觉模型未就绪'}],
        },
      },
    };
    const port = {read: jest.fn().mockResolvedValue(state), setDraft: jest.fn(), activate: jest.fn(), setAdbFallback: jest.fn()};
    const facade = new DefaultPhoneOperateFacade(port);
    await expect(facade.activateDraftMode(4)).rejects.toThrow('local_model_not_ready');
    expect(port.activate).not.toHaveBeenCalled();
  });

  it('blocks a profile that lacks either mandatory capability', async () => {
    const state = {
      status: 'ready' as const, revision: 8, enabled: true, activeProfileId: 'p-1',
      adapters: [{toolId: 'cursor' as const, builtIn: true, label: 'Cursor', readiness: 'ready' as const, maturity: 'beta' as const, capabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: false, resume: true, preferences: false}, configuredProfileCount: 1}],
      profiles: [{
        profileId: 'p-1', toolId: 'cursor' as const,
        displayName: 'Cursor', enabled: true, endpointLabel: 'local', readiness: 'ready' as const,
        maturity: 'beta' as const,
        requestedCapabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: true, resume: true, preferences: true},
        capabilities: {imageInput: true, structuredAction: false, stream: true, approval: true, cancel: true, steer: false, resume: false, preferences: false},
        runnable: false,
        blockers: [{code: 'visual_agent_capability_missing' as const, message: '缺少 structured_action'}],
      }],
      canOperate: false,
      blocker: {code: 'visual_agent_capability_missing' as const, message: '缺少 structured_action'},
    };
    const facade = new DefaultVisualAgentToolsFacade({read: jest.fn().mockResolvedValue(state)} as never);
    await expect(facade.getViewState()).resolves.toEqual(state);
  });

  it('saves a Connector Bridge profile through an explicit one-shot credential intent', async () => {
    const next = {
      status: 'ready' as const, revision: 9, enabled: true,
      adapters: [], profiles: [], canOperate: false,
    };
    const port = {saveProfile: jest.fn().mockResolvedValue(next)};
    const facade = new DefaultVisualAgentToolsFacade(port as never);
    const input = {
      toolId: 'codex' as const,
      enabled: true,
      bridgeUrl: 'https://bridge.example',
      bindingId: 'codex-main',
      credential: {action: 'replace' as const, plaintext: 'sentinel-bridge-secret'},
      requestedCapabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: true, resume: true, preferences: true},
    };
    const result = await facade.saveProfile(input, 8);
    expect(port.saveProfile).toHaveBeenCalledWith(input, 8);
    expect(JSON.stringify(result)).not.toContain('sentinel-bridge-secret');
  });

  it('marks a superseded model catalog response stale and never exposes replacement plaintext', async () => {
    const pending = deferred<ModelCatalogViewState>();
    const port = {
      read: jest.fn().mockResolvedValue({status: 'ready', credential: {state: 'ready'}}),
      fetchCatalog: jest.fn()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce({requestGeneration: 2, status: 'ready', models: [{id: 'gpt-5', label: 'gpt-5'}]}),
      save: jest.fn(),
    };
    const facade = new DefaultModelConfigFacade(port as never);
    const first = facade.refreshCatalog({list: 'unified', requestGeneration: 1, mode: 'preset', presetId: 'openai', credential: {action: 'replace', plaintext: 'sentinel-secret'}});
    await expect(facade.refreshCatalog({list: 'unified', requestGeneration: 2, mode: 'preset', presetId: 'openai', credential: {action: 'keep'}})).resolves.toMatchObject({requestGeneration: 2, status: 'ready'});
    pending.resolve({requestGeneration: 1, status: 'ready', models: [{id: 'old', label: 'old'}]});
    await expect(first).resolves.toMatchObject({requestGeneration: 1, status: 'stale', models: []});
    expect(JSON.stringify(await facade.getViewState({list: 'unified'}))).not.toContain('sentinel-secret');
  });
});
```

- [ ] **Step 2: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/CapabilityFacades.test.ts --runInBand
```

Expected: FAIL with missing Facade modules.

- [ ] **Step 3: Implement exact delegation and guard rules**

`DefaultPhoneOperateFacade.activateDraftMode(expectedRevision)` 必须先 `read()`：revision 不同抛 `config_revision_conflict`；draft option `runnable === false` 时抛第一个 blocker code；仅 runnable 时调用 `port.activate(draftMode, expectedRevision)`。

`DefaultVisualAgentToolsFacade` 必须允许保存多个 profile，并只用 `profileId + expectedRevision` 切 active；`adapters` 无论是否已有 profile都至少包含五个 built-ins，并追加已经同一 conformance gate 注册的 `custom:<name>`。adapter option 的 identity、maturity 与八项 `capabilities` 只来自 `VisualAgentToolRegistry` manifest maximum，readiness/configured count 来自 status projection，绝不把 handshake 子集写回 adapter option；`profiles` 只含用户保存的实例，并分别投影 runtime-stored `enabled/requestedCapabilities` 与该 profile handshake 的 negotiated `capabilities`，不得用协商结果覆盖用户请求值。`displayName` 由 registry label + safe binding ID 投影，`endpointLabel` 只显示已验证 Bridge URL 的 origin/host，不含 path/query/userinfo。active profile 不是 `ready`，或 profile negotiated `imageInput/structuredAction` 任一为 false 时 `canOperate=false`；approval/cancel/steer/resume/preferences 只控制对应动作，任何 disconnected/error 都是 `visual_agent_not_ready` 且 zero fallback。

`DefaultVisualAgentToolsFacade.saveProfile` 只接受 `VisualAgentProfileDraftInput`：create 必须省略 `profileId`，edit 必须带 canonical `profileId`，两者都提交 Bridge URL、Bridge-owned binding ID、八项 requested capability 与 `keep|replace|remove` credential intent。Facade/Application Port 把它一对一映射到 capability `VisualAgentProfileController.save`；edit 初始为 `keep` 且密钥输入为空，`replace.plaintext` 只在一次调用栈内存在，任何成功/失败返回值、日志或 ViewState 都不得包含明文。Create 只允许 replace（创建 Bridge secret）或 remove（明确创建 null-ref/no-auth profile），keep/空 replace/stale revision 必须 fail closed；edit 在旧 ref 已为 null 时仍可 keep null、replace 为新 ref，remove 则是无 retirement record 的幂等 null mutation。`setEnabled`、`saveProfile`、`deleteProfile`、`setActiveProfile` 都必须携带当前 ViewState revision，revision 冲突统一刷新后由用户重试，禁止 last-write-wins。

`DefaultModelConfigFacade` 维护每个 `{list, bindingId}` 最新 `requestGeneration`：完成时若不是最新请求，强制返回 `{status:'stale', models:[]}`，不得让旧 provider/credential 响应覆盖新选择。目录保持 `loading | ready | unsupported | auth_failed | network_failed | empty | stale` 原因差异；save 顶层只接受 `preset | custom`，model ID 始终非空且可来自手输。`selectBinding/deleteBinding` 用 canonical binding ID + expected revision，返回刷新后的 list ViewState。credential 只接受 keep/replace/remove command intent，replace 明文绝不写入 `ModelConfigViewState`。`DefaultPrivacyFacade` 不生成静态说明；`setMemoryLocation('visual_agent')` 在 `canUseVisualAgentMemory === false` 时抛 `visual_agent_not_ready`。

- [ ] **Step 4: Verify green and no storage/provider imports**

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/CapabilityFacades.test.ts --runInBand
npx tsc --noEmit --pretty false
if rg -n "AsyncStorage|ModelService|NonoConfigService|providers/|react-native" src/application/facades/PhoneOperateFacade.ts src/application/facades/VisualAgentToolsFacade.ts src/application/facades/ModelConfigFacade.ts src/application/facades/PrivacyFacade.ts; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: Jest/TypeScript PASS；`rg` 无输出。

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/application/facades/PhoneOperateFacade.ts \
  AwesomeProject/src/application/facades/VisualAgentToolsFacade.ts \
  AwesomeProject/src/application/facades/ModelConfigFacade.ts \
  AwesomeProject/src/application/facades/PrivacyFacade.ts \
  AwesomeProject/src/__tests__/application/facades/CapabilityFacades.test.ts
git commit -m "feat: expose tool and model configuration view states"
```

---

