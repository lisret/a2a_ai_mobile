### Task 5: Integrate Wave 1 Commits and Add the Facade Composition Root

**Mode:** Wave 1 integration；集成 Agent 串行。

**Files:**

- Create: `AwesomeProject/src/application/facades/AppFacadesContext.tsx`
- Create: `AwesomeProject/src/application/facades/createAppFacades.ts`
- Modify: `AwesomeProject/App.tsx`
- Modify: `AwesomeProject/jest.setup.js`
- Test: `AwesomeProject/src/__tests__/application/facades/AppFacadesContext.test.tsx`

**Interfaces:**

- Consumes: Task 2-Task 4 commits；runtime checkpoint 中的 `OperateRuntime`、`OperateTaskRunner`、`CompanionPipeline`、`PreferenceRepository`、`ErrandRepository`、`VisualAgentToolRegistry`、`ModelProviderRegistry`、`ProviderModelCatalogPort`、`ModelEndpointProfileRepository`、`CredentialStore`、`RuntimeConfigRepository`、`TaskRepository`、`sanitizeLog`。既有 `ModelService` 保持只读且不进入新 composition；既有 `ModelListService` 在 Task 6 收窄后接到 catalog port。
- Produces: `createAppFacades(ports): AppFacades`、`projectVisualAgentToolOptions(registry,statusByTool)`、`AppFacadesProvider`、`useAppFacades()`、唯一 production `appFacades`。
- Composition 适配是唯一允许知道 core/repository 具体类的 application 文件；Screen 不得 import 这些 core 类型。

```ts
export function projectVisualAgentToolOptions(
  registry: VisualAgentToolRegistry,
  statusByTool: ReadonlyMap<VisualAgentToolId, Readonly<{
    readiness: VisualAgentReadiness;
    configuredProfileCount: number;
  }>>,
): readonly VisualAgentToolOptionViewState[];
```

缺省 status 固定为 `{readiness:'not_configured', configuredProfileCount:0}`；返回顺序必须与 registry 一致，且该函数只投影 canonical manifest，不做 handshake、配置或网络读取。

- [ ] **Step 1: Cherry-pick the three Wave 1 commits in dependency-neutral order**

Run from `.worktrees/v1-ui-integration`，先用各 worker 报告中的 commit SHA 检查文件域，再 cherry-pick：

```bash
git diff --stat codex/checkpoint-v1-wave2..codex/v1-w3-ui-operate-companion
git diff --stat codex/checkpoint-v1-wave2..codex/v1-w3-ui-capability
git diff --stat codex/checkpoint-v1-wave2..codex/v1-w3-ui-errand-activity
git cherry-pick codex/checkpoint-v1-wave2..codex/v1-w3-ui-operate-companion
git cherry-pick codex/checkpoint-v1-wave2..codex/v1-w3-ui-capability
git cherry-pick codex/checkpoint-v1-wave2..codex/v1-w3-ui-errand-activity
```

Expected: 每个 branch range 只含其 Task 列出的新文件；cherry-pick 无冲突。出现热点文件或冲突时 `git cherry-pick --abort`，让原 worker 基于 `codex/checkpoint-v1-wave2` 重放，禁止在集成分支拼接实现。

- [ ] **Step 2: Write the failing injectable-context test**

```tsx
import React from 'react';
import {Text} from 'react-native';
import {render} from '@testing-library/react-native';
import {
  AppFacadesProvider,
  useAppFacades,
} from '../../../application/facades/AppFacadesContext';
import {projectVisualAgentToolOptions} from '../../../application/facades/createAppFacades';
import {createBuiltInVisualAgentToolRegistry} from '../../../connectorBridge/visualAgent/BuiltInVisualAgentToolRegistry';
import type {AppFacades} from '../../../application/facades/UiRuntimeContracts';

const Probe = () => {
  const facades = useAppFacades();
  return <Text>{facades.visualAgentTools && facades.modelConfig ? 'injected' : 'missing'}</Text>;
};

describe('AppFacadesContext', () => {
  it('uses the test-owned facade graph', () => {
    const fake = {visualAgentTools: {}, modelConfig: {}} as AppFacades;
    expect(render(<AppFacadesProvider value={fake}><Probe /></AppFacadesProvider>).getByText('injected')).toBeTruthy();
  });

  it('fails loudly outside the provider', () => {
    expect(() => render(<Probe />)).toThrow('AppFacadesProvider is missing');
  });

  it('projects the exact canonical built-in manifests without widening capabilities', () => {
    const registry = createBuiltInVisualAgentToolRegistry();
    const options = projectVisualAgentToolOptions(registry, new Map());
    expect(options.map(({toolId, builtIn, maturity, capabilities}) => ({toolId, builtIn, maturity, capabilities}))).toEqual([
      {toolId: 'openclaw', builtIn: true, maturity: 'stable', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: true}},
      {toolId: 'codex', builtIn: true, maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: false}},
      {toolId: 'cursor', builtIn: true, maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: false, preferences: false}},
      {toolId: 'dsh', builtIn: true, maturity: 'experimental', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: false, resume: false, steer: false, preferences: false}},
      {toolId: 'hermes', builtIn: true, maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: false}},
    ]);
  });
});
```

- [ ] **Step 3: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/application/facades/AppFacadesContext.test.tsx --runInBand
```

Expected: FAIL because `AppFacadesContext` does not exist.

- [ ] **Step 4: Implement context and composition without hidden fallback**

`AppFacadesContext.tsx` 必须用 `createContext<AppFacades | null>(null)`；`useAppFacades()` 遇到 null 直接 throw。`createAppFacades.ts` 必须通过显式 ports 构造 Task 2-Task 4 的 default facades；不得在 Facade 内调用 service locator。`App.tsx` 在 `SafeAreaProvider` 内、`AppNavigator` 外包一层：

```tsx
<AppFacadesProvider value={appFacades}>
  <AppNavigator />
</AppFacadesProvider>
```

production adapters 必须满足：

```ts
const start = async (instruction: string): Promise<StartOperateResult> => {
  const task = await taskRepository.createRunning(instruction);
  const sessionResult = await operateRuntime.createSession(task.id);
  if (sessionResult.kind === 'blocked') {
    await taskRepository.markBlocked(task.id, sessionResult.blocker.code);
    return sessionResult;
  }
  await foregroundRunner.start({
    taskId: task.id,
    sessionRevision: sessionResult.session.sessionRevision,
  });
  return {
    kind: 'started',
    taskId: task.id,
    sessionRevision: sessionResult.session.sessionRevision,
  };
};
```

`start` 不捕获后台启动失败后调用第二个 runner；启动失败写同一 task/session 的 failed 终态并返回/抛固定安全错误。

视觉工具 adapter 必须从 `RuntimeConfigRepository` 的 `VisualAgentProfileV1[] + activeProfileId` 投影多个 profile；纯函数 `projectVisualAgentToolOptions` 枚举 `VisualAgentToolRegistry.list()` 并解析每个已注册 adapter 的 exact identity/manifest，`capabilities` 只能逐字段复制 `manifest.declaredCapabilities`，`maturity` 只能复制 manifest，且以 `builtIn = !toolId.startsWith('custom:')` 区分五个内置项和通过相同 conformance 注册的 `custom:<name>`；禁止 UI 默认值或全 true 扩宽。再通过其 execution/handshake status 投影 readiness 与 profile negotiated `VisualAgentCapabilitySet`，后者可以是 manifest 的严格子集。未注册或未通过 conformance 的 custom 工具不显示为可选项。OpenClaw 只通过 tool preset 注册，不建立第二套 client 分支。`OperateRuntime.createSession` 在 start 时把 config revision、active profileId、toolId 和 canonical capability set 复制到 session snapshot，之后 composition 不再读取 active profile；profile 删除/切换/编辑都不得改变运行中 task。

模型配置 adapter 直接建立 `ModelConfigApplicationPort` 到 `ModelProviderRegistry`、`ProviderModelCatalogPort`、`ModelEndpointProfileRepository` 与 `CredentialStore` 的窄接缝；Task 6 再把既有 selectors / `ModelListService` 接到这条缝。读取只返回 masked credential state；replace plaintext 立即交给 `CredentialStore` 后清除；remove 只把 profile ref 改为 null 并提交 runtime-owned retirement record；keep 不读取 secret 回 UI。旧 ref 不在 UI/config mutation 中直接删除，由 Runtime Task 6 cold-start GC 在确认 active/draft config 与非终态 sessions 均无引用后删除。catalog typed result 不得被 composition 抹平成 empty，ModelScope 是 registry 中的 compatibility presentation。Screen 永远不直接 import `ModelService`。

在 `jest.setup.js` 仅增加当前 production composition 所需 NativeModule 空 mock；mock 中不得放真实 secret、任务数据或默认成功响应。

- [ ] **Step 5: Run the Wave 1 integration gate**

```bash
cd AwesomeProject
npx jest src/__tests__/application --runInBand
npx tsc --noEmit --pretty false
npx prettier --check src/application App.tsx jest.setup.js
if rg -n "apiKey|Authorization|data:image|modelResponse|screenshotUri" src/application; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: tests/TypeScript/Prettier PASS；privacy `rg` 无输出。

- [ ] **Step 6: Commit the composition root**

```bash
git add AwesomeProject/src/application/facades/AppFacadesContext.tsx \
  AwesomeProject/src/application/facades/createAppFacades.ts \
  AwesomeProject/App.tsx \
  AwesomeProject/jest.setup.js \
  AwesomeProject/src/__tests__/application/facades/AppFacadesContext.test.tsx
git commit -m "feat: compose injectable V1 application facades"
```

把该 commit 的完整 SHA 写入 Wave 3 evidence 作为 `UI Facade checkpoint`。从此步骤开始停止所有编码 worker；共享热点按 Task 6-Task 10 严格串行。

---

