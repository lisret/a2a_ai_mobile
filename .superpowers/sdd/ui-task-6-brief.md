### Task 6: Wire Model Configuration, Fix Navigation Typing, and Render Phone Operate Readiness

**Mode:** Wave 2；集成 Agent 串行。

**Files:**

- Modify: `AwesomeProject/src/shared/types/navigation.ts`
- Modify: `AwesomeProject/src/navigation/AppNavigator.tsx`
- Modify: `AwesomeProject/src/features/task/screens/HomeScreen.tsx`
- Modify: `AwesomeProject/src/features/capability/screens/PhoneOperateScreen.tsx`
- Modify: `AwesomeProject/src/features/model/screens/AddModelScreen.tsx`
- Modify: `AwesomeProject/src/features/model/screens/EditModelScreen.tsx`
- Modify: `AwesomeProject/src/features/model/screens/ModelListScreen.tsx`
- Modify: `AwesomeProject/src/features/model/components/ApiProviderSelector.tsx`
- Modify: `AwesomeProject/src/features/model/components/ModelNameSelector.tsx`
- Modify: `AwesomeProject/src/features/model/components/ModelListPanel.tsx`
- Modify: `AwesomeProject/src/features/model/components/ModelItem.tsx`
- Modify: `AwesomeProject/src/features/settings/screens/APIKeyGuideScreen.tsx`
- Modify: `AwesomeProject/src/features/model/services/ModelListService.ts`
- Modify: `AwesomeProject/src/shared/constants/apiProviders.ts`
- Modify: `AwesomeProject/src/application/facades/createAppFacades.ts`
- Test: `AwesomeProject/src/__tests__/navigation/AppNavigatorTyping.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/capability/PhoneOperateViewState.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/model/ModelConfigViewState.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/model/ModelCatalogRace.test.ts`

**Interfaces:**

- Consumes: `RootStackParamList.MainTabs: NavigatorScreenParams<MainTabParamList>`、`useAppFacades().phoneOperate`、`useAppFacades().modelConfig`，以及 Task 1 已冻结、由 Task 3 实现的 provider/catalog/credential contracts。
- Produces: type-safe nested navigation；PhoneOperate Screen 不再 import `NonoConfigService`；Add/Edit/Guide/List/ModelListPanel/ModelItem 不再硬编码另一套 provider identity 或直接调用 `ModelService`/`ModelListService`，而是通过 Facade/runtime registry 驱动 selectors、credential guide presentation 与 role-scoped binding list。

UI compatibility key 只在 `ModelConfigApplicationPort` 边界按下表映射一次；repository、binding 和 session 一律使用 canonical runtime `ModelRole`：

| `ModelListKey` | `ModelRole` |
| --- | --- |
| `unified` | `direct` |
| `splitVision` | `vision` |
| `splitPlanner` | `split_planner` |
| `localPlanner` | `local_planner` |
| `companion` | `companion` |

- [ ] **Step 1: Write RED tests for nested navigation and blocked activation**

```tsx
import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {PhoneOperateScreen} from '../../../features/capability/screens/PhoneOperateScreen';
import {AppFacadesProvider} from '../../../application/facades/AppFacadesContext';
import type {AppFacades, PhoneOperateViewState} from '../../../application/facades/UiRuntimeContracts';

const state: PhoneOperateViewState = {
  status: 'ready', revision: 12, activeMode: 'cloud_direct',
  draftMode: 'local_vision_cloud_planner', adbFallbackEnabled: false,
  modes: {
    cloud_direct: {id: 'cloud_direct', label: '云端一体', nodes: ['截图', '云端一体', '动作'], caption: '可运行', runnable: true, blockers: []},
    cloud_split: {id: 'cloud_split', label: '双云端', nodes: ['截图', '云端视觉', '云端编排', '动作'], caption: '可运行', runnable: true, blockers: []},
    local_vision_cloud_planner: {id: 'local_vision_cloud_planner', label: '本地视觉', nodes: ['截图', '本地视觉', '云端编排', '动作'], caption: '截图不离机', runnable: false, blockers: [{code: 'local_model_not_ready', message: '本地视觉模型未就绪'}]},
  },
};

describe('PhoneOperateScreen', () => {
  it('shows the real blocker and never calls activate for an unrunnable draft', async () => {
    const phoneOperate = {
      getViewState: jest.fn().mockResolvedValue(state),
      selectDraftMode: jest.fn(),
      activateDraftMode: jest.fn(),
      setAdbFallbackEnabled: jest.fn(),
    };
    const facades = {phoneOperate} as unknown as AppFacades;
    const screen = render(<AppFacadesProvider value={facades}><PhoneOperateScreen /></AppFacadesProvider>);
    await waitFor(() => expect(screen.getByText('本地视觉模型未就绪')).toBeTruthy());
    expect(screen.getByTestId('activate-operate-mode').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByTestId('activate-operate-mode'));
    expect(phoneOperate.activateDraftMode).not.toHaveBeenCalled();
  });
});
```

`AppNavigatorTyping.test.tsx` 增加 compile-time helper：

```ts
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../shared/types/navigation';

const openCapabilities = (navigation: NativeStackNavigationProp<RootStackParamList>) =>
  navigation.navigate('MainTabs', {screen: 'Capabilities'});

test('Capabilities is a nested MainTabs route', () => {
  expect(openCapabilities).toBeDefined();
});
```

`ModelConfigViewState.test.tsx` 用 injected `modelConfig` 同时渲染 Add/Edit/APIKeyGuide/List/ModelListPanel，断言顶层只出现“热门厂商 / 完全自定义”；preset 顺序精确为 OpenAI、Anthropic、Gemini、DeepSeek、xAI、百炼 Qwen、智谱、Kimi、MiniMax、火山 Doubao、ModelScope（兼容），Guide 使用同一组 canonical preset IDs；未知/custom 显示通用安全指引，不静默空白。Custom 表单必须逐项 round-trip `customProviderLabel/baseUrl/protocol/auth/chatPath/modelListPath/declaredCapabilities`，能力声明显示“用户声明、未验证”，协议切换不能丢掉字段；header/query auth 只保存 header/query 名和 prefix，不进入 ViewState 的 credential 明文。Edit 初始 credential intent 为 keep，secret 输入为空且无任何回填；点击更换/移除分别提交 replace/remove；目录 `unsupported/auth_failed/network_failed/empty/stale/loading` 均显示不同安全文案，所有状态都保留 `testID="manual-model-id"`；列表选择/删除传 canonical bindingId + expected revision，provider label 来自 ViewState。

`ModelCatalogRace.test.ts` 用两个 deferred 请求模拟先选 OpenAI、立刻切 Anthropic，先完成 Anthropic 再完成 OpenAI；断言 UI 最终只展示 Anthropic 的 requestGeneration/models，旧 OpenAI 结果显示或记录为 stale 且不覆盖。再覆盖完整 custom spec、ModelScope compatibility、每页 cursor/page-token 直到 exhausted，以及 ready/unsupported/auth/network/empty/stale 任一状态下的 manual model ID save。

- [ ] **Step 2: Run RED and capture the V1 TS2769 evidence**

```bash
cd AwesomeProject
npx jest src/__tests__/navigation/AppNavigatorTyping.test.tsx src/__tests__/features/capability/PhoneOperateViewState.test.tsx src/__tests__/features/model/ModelConfigViewState.test.tsx src/__tests__/features/model/ModelCatalogRace.test.ts --runInBand
npx tsc --noEmit --pretty false
```

Expected before implementation: PhoneOperate test FAIL because Screen still reads `NonoConfigService`；model tests FAIL because Add/Edit still render hard-coded chips and selectors are not facade-driven；TypeScript includes the V1 Home error at `navigation.navigate('Capabilities')` / TS2769.

- [ ] **Step 3: Apply the navigation fix at the correct nesting boundary**

在 `HomeScreen.tsx` 把：

```ts
navigation.navigate('Capabilities');
```

改为：

```ts
navigation.navigate('MainTabs', {screen: 'Capabilities'});
```

保留 `RootStackParamList` 与 `MainTabParamList` 分层；禁止给 RootStack 新增假的 `Capabilities` route。`AppNavigator.tsx` 只把现有声明行改为 `const MainTabs: React.FC = () => {`，函数体不变；Stack/Tab generic 继续分别使用两张 param list。

同时给 Root Stack 新增 canonical `VisualAgentTools: {initialPreset?: BuiltInVisualAgentToolId} | undefined`，保留既有 `OpenClaw` route 一版并由 navigation listener 立即 replace 到 `{name:'VisualAgentTools', params:{initialPreset:'openclaw'}}`。`OpenClawScreen` 只作为兼容组件存在，不能成为第二个状态 owner；`AppNavigatorTyping.test.tsx` 同时覆盖 canonical route 和 alias params。

把 `RootStackParamList.EditModel` 精确改为 `{bindingId: string; list?: ModelListKey}`；Add route 的 import compatibility 只能在进入 Facade 前转换为非敏感 draft，navigation params 不得携带 credential。更新全部 navigate/route consumers，禁止继续把 binding ID 和 provider model ID 都命名为 `modelId`。

同一 `AppNavigatorTyping.test.tsx` 还必须覆盖 `APIKeyGuide` 的 canonical `{presetId,mode}` 参数、无参全列表、旧 `zhipu/moonshot` deep-link parser 的一次性 replace，以及任意未知 providerId 不进入 Screen state。

- [ ] **Step 4: Replace PhoneOperate data access with ViewState**

Screen 加载和命令路径必须精确为：

```ts
const {phoneOperate} = useAppFacades();
const [viewState, setViewState] = useState<PhoneOperateViewState | null>(null);

useFocusEffect(useCallback(() => {
  let active = true;
  phoneOperate.getViewState().then(next => active && setViewState(next));
  return () => { active = false; };
}, [phoneOperate]));

const option = viewState.modes[viewState.draftMode];
const activate = async () => {
  if (!option.runnable) return;
  setViewState(await phoneOperate.activateDraftMode(viewState.revision));
};
```

三种模式选择调用 `selectDraftMode(mode)` 并使用返回 state；激活按钮固定 `testID="activate-operate-mode"`，`disabled={!option.runnable}`，`accessibilityState={{disabled: !option.runnable}}`。blockers 逐条显示，不得再展示“当前任务仍走云端一体”的回退文案。

- [ ] **Step 5: Replace hard-coded provider/model fields with the facade-driven selectors**

`ModelProviderRegistry` 是 preset 的唯一事实源。`apiProviders.ts` 删除带 base URL/auth/catalog 的 `API_PROVIDERS` 平行 registry，只允许保留 keyed-by-`ProviderPresetV1` 的展示文案/图标、localized credential guide 与 HTTPS host allowlist；`custom` 不是 preset entry。`ApiProviderSelector` 改为纯 controlled component，presets 由 `ModelConfigViewState.presets` 注入；顶层 discriminant 精确为 `preset | custom`，不得再暴露 `select | custom` 或 provider chips；custom 模式渲染并编辑完整 `CustomProviderConfigViewState`：provider label、base URL、protocol、auth kind/header/query metadata、chat path、nullable model-list path、input/output modalities 及 chat/vision/toolCalls/reasoning declarations。两种模式都不持有 credential；自定义能力必须显式标记为用户声明未验证。

`ModelListService` 不再自己 switch provider 或直接 fetch；改为 UI-only narrow mapper，输入 `ProviderModelCatalogResult + requestGeneration`，输出 `ModelCatalogViewState`。认证错误映射 `auth_failed`、网络失败映射 `network_failed`、无目录 API 映射 `unsupported`、成功零项映射 `empty`、成功有项映射 `ready`，runtime `ready.stale === true` 映射 UI `stale`。`createAppFacades.ts` 的 `ModelConfigApplicationPort.fetchCatalog` 从 discriminated `ModelCatalogRefreshInput` 构造完整 preset/custom profile，用 `ModelProviderRegistry.resolveCatalog(profile): ProviderModelCatalogPort` 发起请求，再调用该 mapper；custom input 的 protocol/auth/path/capability 字段不得以默认 OpenAI 配置补齐。禁止由 UI 假设所有厂商都是 OpenAI-compatible，也不得用 `default: []` 隐藏未知厂商。这是现有 `ModelListService` 被接通的唯一位置，`ModelNameSelector` 不直接 import 它。

`ModelNameSelector` 改为纯 controlled component：输入 `catalog`、`modelId`、`onModelIdChange`、`onRefresh`，标题固定“当前凭证可用模型”；不 import/call `ModelListService`，不接收 credential 明文。catalog 任一状态均展示 `testID="manual-model-id"` 的手输输入框，选择目录项只是填入同一 model ID。

`AddModelScreen` / `EditModelScreen` 只通过 `modelConfig` load/refresh/save，并使用 frozen `ModelConfigSaveInput` / `ModelCatalogRefreshInput`，使 preset/custom 的必填字段在类型层互斥。provider/mode/credential/custom protocol/auth/path/capability 变化都分配单调 `requestGeneration`；effect cleanup 与 Facade stale result 双重防护。Add 初始 credential 为 replace 空输入；Edit 初始为 keep 且输入框空，用户显式选择 replace 才显示空密码框，remove 需二次确认。保存后立即清空局部 plaintext；ViewState、navigation params、error 文案、console/log 都不得包含它。删除原 `[openai,zhipu,modelscope,huggingface,custom]` chips 与 provider inference。

把 `RootStackParamList.APIKeyGuide` 精确改为 `{presetId?: ProviderPresetV1; mode?: 'preset' | 'custom'} | undefined`，直接 type-import canonical runtime contract，不得复制 provider union；Screen 不得继续使用 `zhipu/moonshot` 等非 canonical alias。旧 deep link 的 `providerId=zhipu|moonshot` 只在 navigation compatibility parser 中一次性映射为 `zhipu_glm|moonshot_kimi` 后 replace canonical route；Screen/state/telemetry 只见 canonical ID。`APIKeyGuideScreen` 通过 `useAppFacades().modelConfig.getViewState({list:'unified'}).presets` 决定顺序/存在性，再从 `apiProviders.ts` 的 `Record<ProviderPresetV1, LocalizedCredentialGuide>` 读取本地化步骤和官方控制台链接；该 record 必须 exhaustive 覆盖 11 个 preset，不能包含 base URL、auth header 或模型目录元数据。`mode:'custom'` 只显示“请从你的服务提供方获取凭据”的通用说明，任何 compatibility parser 未知值显示固定 unsupported 文案，不猜测 URL。打开外链前只允许 HTTPS 且 hostname 与该 preset guide allowlist 精确匹配；错误日志只记录固定 reason code。

`ModelListScreen` / `ModelListPanel` 用 `getListViewState(list)` 加载，并以 ViewState 中的 bindingId + revision 调 `selectBinding/deleteBinding`；`EditModel` route param 从含混的 `modelId` 改为 `bindingId`。`ModelItem` prop 改为 `ModelConfigListItemViewState`，providerLabel/modelId 全由 Facade 投影，删除 OpenAI/智谱/ModelScope/HuggingFace 的硬编码映射。四个文件不得 import `AIModel` 或 `modelService`；legacy `ModelService` / `shared/types/Model.ts` 只留给 runtime migration/未迁移兼容边界。

- [ ] **Step 6: Verify GREEN**

```bash
cd AwesomeProject
npx jest src/__tests__/navigation/AppNavigatorTyping.test.tsx src/__tests__/features/capability/PhoneOperateViewState.test.tsx src/__tests__/features/capability/PhoneOperatePermission.test.ts src/__tests__/features/model/ModelConfigViewState.test.tsx src/__tests__/features/model/ModelCatalogRace.test.ts --runInBand
npx tsc --noEmit --pretty false
if rg -n "NonoConfigService|nonoConfigService|当前任务仍走云端一体|navigation\.navigate\('Capabilities'" src/features/capability/screens/PhoneOperateScreen.tsx src/features/task/screens/HomeScreen.tsx; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
if rg -n "providerRow|providerChip|huggingface|\['openai'.*'zhipu'|fetchModelList|modelService|AIModel|apiKey|ModelProviderRegistry" src/features/model/screens src/features/model/components src/features/settings/screens/APIKeyGuideScreen.tsx; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: tests/TypeScript PASS；`rg` 无输出。

- [ ] **Step 7: Commit**

```bash
git add AwesomeProject/src/shared/types/navigation.ts \
  AwesomeProject/src/navigation/AppNavigator.tsx \
  AwesomeProject/src/features/task/screens/HomeScreen.tsx \
  AwesomeProject/src/features/capability/screens/PhoneOperateScreen.tsx \
  AwesomeProject/src/features/model/screens/AddModelScreen.tsx \
  AwesomeProject/src/features/model/screens/EditModelScreen.tsx \
  AwesomeProject/src/features/model/screens/ModelListScreen.tsx \
  AwesomeProject/src/features/model/components/ApiProviderSelector.tsx \
  AwesomeProject/src/features/model/components/ModelNameSelector.tsx \
  AwesomeProject/src/features/model/components/ModelListPanel.tsx \
  AwesomeProject/src/features/model/components/ModelItem.tsx \
  AwesomeProject/src/features/settings/screens/APIKeyGuideScreen.tsx \
  AwesomeProject/src/features/model/services/ModelListService.ts \
  AwesomeProject/src/shared/constants/apiProviders.ts \
  AwesomeProject/src/application/facades/createAppFacades.ts \
  AwesomeProject/src/__tests__/navigation/AppNavigatorTyping.test.tsx \
  AwesomeProject/src/__tests__/features/capability/PhoneOperateViewState.test.tsx \
  AwesomeProject/src/__tests__/features/model/ModelConfigViewState.test.tsx \
  AwesomeProject/src/__tests__/features/model/ModelCatalogRace.test.ts
git commit -m "feat: wire model config and runnable mode UI"
```

---

