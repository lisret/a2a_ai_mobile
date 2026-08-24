### Task 9: Connect Visual Agent Tools, Errand, Privacy, Capabilities, and Activity Screens to Real ViewState

**Mode:** Wave 2；集成 Agent 串行。

**Files:**

- Modify: `AwesomeProject/src/features/capability/screens/CapabilitiesScreen.tsx`
- Modify: `AwesomeProject/src/shared/types/navigation.ts`
- Modify: `AwesomeProject/src/navigation/AppNavigator.tsx`
- Create: `AwesomeProject/src/features/capability/screens/VisualAgentToolsScreen.tsx`
- Modify: `AwesomeProject/src/features/capability/screens/OpenClawScreen.tsx`
- Modify: `AwesomeProject/src/features/capability/screens/ErrandsScreen.tsx`
- Modify: `AwesomeProject/src/features/capability/screens/ErrandDetailScreen.tsx`
- Modify: `AwesomeProject/src/features/capability/screens/PrivacyScreen.tsx`
- Modify: `AwesomeProject/src/features/task/screens/TaskHistoryScreenTab.tsx`
- Test: `AwesomeProject/src/__tests__/features/capability/CapabilityViewStates.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/task/ActivityViewState.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/capability/CapabilityArchitectureGuard.test.ts`

**Interfaces:**

- Consumes: Task 1 ViewState 和 `useAppFacades()`；Screen 不再 import `NonoConfigService`、`ModelService`、`TaskHistoryService`、`MemoryItem`。canonical route 为 `VisualAgentTools`，`OpenClaw` route 只保留一版 alias。
- Produces: 每个页面有明确 loading/ready/error；显示值和可操作性都来自 Facade 返回值，空仓储显示真实 empty state，不注入 seed。

- [ ] **Step 1: Write RED architecture and rendering tests**

```ts
import fs from 'node:fs';
import path from 'node:path';

test('capability and activity screens have no direct storage/repository access', () => {
  const files = [
    'src/features/capability/screens/CapabilitiesScreen.tsx',
    'src/features/capability/screens/VisualAgentToolsScreen.tsx',
    'src/features/capability/screens/OpenClawScreen.tsx',
    'src/features/capability/screens/ErrandsScreen.tsx',
    'src/features/capability/screens/ErrandDetailScreen.tsx',
    'src/features/capability/screens/PrivacyScreen.tsx',
    'src/features/task/screens/TaskHistoryScreenTab.tsx',
  ];
  const source = files.map(file => fs.readFileSync(path.resolve(file), 'utf8')).join('\n');
  expect(source).not.toMatch(/NonoConfigService|nonoConfigService|ModelService|modelService|TaskHistoryService|taskHistoryService|MemoryItem|SEED_MEMORIES|AsyncStorage/);
  expect(source).toMatch(/useAppFacades/);
});
```

```tsx
import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import {VisualAgentToolsScreen} from '../../../features/capability/screens/VisualAgentToolsScreen';
import {PrivacyScreen} from '../../../features/capability/screens/PrivacyScreen';
import {TaskHistoryScreenTab} from '../../../features/task/screens/TaskHistoryScreenTab';
import {AppFacadesProvider} from '../../../application/facades/AppFacadesContext';
import type {AppFacades, VisualAgentToolOptionViewState} from '../../../application/facades/UiRuntimeContracts';

const canonicalAdapters: readonly VisualAgentToolOptionViewState[] = [
  {toolId: 'openclaw', builtIn: true, label: 'OpenClaw', readiness: 'disconnected', maturity: 'stable', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: true}, configuredProfileCount: 1},
  {toolId: 'codex', builtIn: true, label: 'Codex', readiness: 'not_configured', maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: false}, configuredProfileCount: 0},
  {toolId: 'cursor', builtIn: true, label: 'Cursor', readiness: 'not_configured', maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: false, preferences: false}, configuredProfileCount: 0},
  {toolId: 'dsh', builtIn: true, label: 'DSH (DeepSeek Harness)', readiness: 'not_configured', maturity: 'experimental', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: false, resume: false, steer: false, preferences: false}, configuredProfileCount: 0},
  {toolId: 'hermes', builtIn: true, label: 'Hermes', readiness: 'not_configured', maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: false}, configuredProfileCount: 0},
];

test('renders actual tool readiness/capabilities, privacy-channel, and empty activity states', async () => {
  const facades = {
    visualAgentTools: {getViewState: jest.fn().mockResolvedValue({
      status: 'ready', revision: 4, enabled: true, activeProfileId: 'openclaw-1',
      adapters: canonicalAdapters,
      profiles: [{profileId: 'openclaw-1', toolId: 'openclaw', displayName: 'OpenClaw', enabled: true, endpointLabel: 'bridge.example', readiness: 'disconnected', maturity: 'stable', requestedCapabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: true, resume: true, preferences: true}, capabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: true, resume: true, preferences: true}, runnable: false, blockers: [{code: 'visual_agent_not_ready', message: 'OpenClaw 未连接，操作会暂停'}]}],
      canOperate: false, blocker: {code: 'visual_agent_not_ready', message: 'OpenClaw 未连接，操作会暂停'},
    }), setEnabled: jest.fn(), saveProfile: jest.fn(), deleteProfile: jest.fn(), setActiveProfile: jest.fn(), refreshProfile: jest.fn()},
    privacy: {getViewState: jest.fn().mockResolvedValue({
      status: 'ready', memoryEnabled: true, memoryLocation: 'device', canUseVisualAgentMemory: false,
      channels: [{id: 'local_vision', state: 'local', destinationLabel: '仅这台手机', fields: ['结构化观察']}],
      persistedDiagnosticFields: ['错误码', '耗时'],
    }), setMemoryEnabled: jest.fn(), setMemoryLocation: jest.fn(), forgetAllPreferences: jest.fn()},
    activity: {getViewState: jest.fn().mockResolvedValue({
      status: 'ready', memoryEnabled: true, memoryLocationLabel: '仅这台手机', preferences: [], errands: [], tasks: [],
    }), forgetPreference: jest.fn(), deleteTask: jest.fn()},
  } as unknown as AppFacades;

  const tools = render(<AppFacadesProvider value={facades}><VisualAgentToolsScreen /></AppFacadesProvider>);
  await waitFor(() => expect(tools.getByText('OpenClaw 未连接，操作会暂停')).toBeTruthy());
  expect(tools.getByText('审批：支持')).toBeTruthy();
  const privacy = render(<AppFacadesProvider value={facades}><PrivacyScreen /></AppFacadesProvider>);
  await waitFor(() => expect(privacy.getByText('结构化观察')).toBeTruthy());
  const activity = render(<AppFacadesProvider value={facades}><TaskHistoryScreenTab /></AppFacadesProvider>);
  await waitFor(() => expect(activity.getByText('还没有称呼或偏好')).toBeTruthy());
  expect(activity.queryByText('咖啡少糖')).toBeNull();
});
```

- [ ] **Step 2: Run RED**

```bash
cd AwesomeProject
npx jest src/__tests__/features/capability/CapabilityArchitectureGuard.test.ts src/__tests__/features/capability/CapabilityViewStates.test.tsx src/__tests__/features/task/ActivityViewState.test.tsx --runInBand
```

Expected: FAIL because V1 Screens directly read config/model/history and Activity seeds memories.

- [ ] **Step 3: Apply one shared load pattern to every Screen**

每个 Screen 使用该 exact lifecycle；命令返回的新 ViewState 直接覆盖旧 state：

```ts
useFocusEffect(useCallback(() => {
  let active = true;
  setViewState(current => current ?? LOADING_STATE);
  facade.getViewState()
    .then(next => active && setViewState(next))
    .catch(() => active && setViewState(ERROR_STATE));
  return () => { active = false; };
}, [facade]));
```

`LOADING_STATE` 和 `ERROR_STATE` 使用该页面的 exact ViewState shape；error UI 显示固定安全文案和“重试”，不显示 raw Error。

- [ ] **Step 4: Render generic Visual Agent Tools and Capabilities from actual state**

`VisualAgentToolsScreen`：先固定渲染 `adapters` 中 OpenClaw/Codex/Cursor/dsh/Hermes 五个 built-in 卡，即使尚未配置也显示 `not_configured` readiness、maturity 与完整 canonical `VisualAgentCapabilitySet` 八项能力；再渲染 registry 返回且 `builtIn:false` 的已验收 `custom:<name>` 卡，然后列出所有已保存 profiles，可新增/编辑/删除并以 expected revision 选择唯一 active profile。新增/编辑表单精确包含 profile enabled、tool preset（custom 只能从 registry 提供的 adapter 选择，禁止自由输入一个未注册 ID）、Connector Bridge HTTPS/WSS URL、Bridge-owned binding ID、八项 requested capability 和 credential keep/replace/remove；编辑时从 `enabled/requestedCapabilities` 初始化，不得用 negotiated `capabilities` 反写配置；不得要求或展示 OpenClaw gateway、Codex/Cursor CLI、ACP、DSH/Hermes 上游私有参数。编辑默认 keep 且 secret 字段永远为空；replace/remove 必须二次确认；保存只提交 `VisualAgentProfileDraftInput`，响应 state 不回显明文。其他 adapter 使用同一 `VisualAgentToolId + VisualAgentCapabilitySet` contract。active profile 的 readiness 不是 ready 或缺 imageInput/structuredAction 时显示 exact blocker并禁用操作入口；stream/approval/cancel/steer/resume/preferences 不支持时仅禁用对应控件，不伪装支持。

`OpenClawScreen` 不再读取 Facade，只返回/渲染 `VisualAgentToolsScreen initialPreset="openclaw"`；`RootStackParamList.OpenClaw` 与旧 deep link 在这一版导航层 alias 到 canonical `VisualAgentTools`，埋点和状态 key 只用 canonical route，下一 major 删除 alias。严禁复制一套 OpenClaw state 或 adapter 特判。

`CapabilitiesScreen`：PhoneOperate meta 使用 `PhoneOperateViewState.activeMode` 对应 label 和 runnable；Errand meta 使用 `pendingCount`；视觉工具 meta 使用 active profile 的 displayName/readiness/canOperate；Privacy meta 使用 `memoryEnabled/memoryLocation`。视觉工具 toggle 调 `visualAgentTools.setEnabled(next, visualAgentToolsState.revision)`；其他 toggle 分别调用对应 Facade，不能写同一 `CapabilityFlags` object。

- [ ] **Step 5: Render Errand list/detail from ErrandRepository projection**

`ErrandsScreen` 展示真实 `pendingCount` 和 `items`；item badge 映射 pending/leased/failed/completed/cancelled。`ErrandDetailScreen` 用 route `errandId` 从 `errands.getViewState()` exact match；保存调用 `errands.update(item)`，取消调用 `errands.cancel(id)`。leased/terminal 项 disable 编辑并显示 state，不把它复制回 memory。

- [ ] **Step 6: Render Privacy and Activity from independent sources**

`PrivacyScreen` channels 逐项显示 `destinationLabel` 与 `fields.join('、')`；visual-agent profile memory 选项在 `canUseVisualAgentMemory === false` 时 disabled 并显示原因。忘记偏好调用 `privacy.forgetAllPreferences()`；不影响 errands。

`TaskHistoryScreenTab` 的“它还记得”来自 `ActivityViewState.preferences + errands`；“做过的事”来自 `tasks`；删除/忘记命令调用 Activity Facade 并使用返回 state。移除按 selected model 隐式过滤；空 state 不创建样例。

- [ ] **Step 7: Verify GREEN**

```bash
cd AwesomeProject
npx jest src/__tests__/features/capability/CapabilityArchitectureGuard.test.ts src/__tests__/features/capability/CapabilityViewStates.test.tsx src/__tests__/features/task/ActivityViewState.test.tsx --runInBand
npx tsc --noEmit --pretty false
if rg -n "NonoConfigService|nonoConfigService|ModelService|modelService|TaskHistoryService|taskHistoryService|MemoryItem|SEED_MEMORIES|远程会话尚未接通" src/features/capability/screens src/features/task/screens/TaskHistoryScreenTab.tsx; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
if rg -n "facades\.openClaw|OpenClawViewState|OpenClawFacade" src; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: tests/TypeScript PASS；`rg` 无输出。

- [ ] **Step 8: Commit**

```bash
git add AwesomeProject/src/features/capability/screens/CapabilitiesScreen.tsx \
  AwesomeProject/src/shared/types/navigation.ts \
  AwesomeProject/src/navigation/AppNavigator.tsx \
  AwesomeProject/src/features/capability/screens/VisualAgentToolsScreen.tsx \
  AwesomeProject/src/features/capability/screens/OpenClawScreen.tsx \
  AwesomeProject/src/features/capability/screens/ErrandsScreen.tsx \
  AwesomeProject/src/features/capability/screens/ErrandDetailScreen.tsx \
  AwesomeProject/src/features/capability/screens/PrivacyScreen.tsx \
  AwesomeProject/src/features/task/screens/TaskHistoryScreenTab.tsx \
  AwesomeProject/src/__tests__/features/capability/CapabilityViewStates.test.tsx \
  AwesomeProject/src/__tests__/features/task/ActivityViewState.test.tsx \
  AwesomeProject/src/__tests__/features/capability/CapabilityArchitectureGuard.test.ts
git commit -m "refactor: render generic tool and capability view states"
```

---

