# NoNo React Native UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已确认的 NoNo 高保真原型迁移为可测试的 React Native 设计系统、四个纯展示主页面，以及具备真实双页面图层动画的四 Tab 导航。

**Architecture:** 先在独立 worktree 中新增 `shared/ui/nono` 设计系统、纯动画状态机和无副作用 View，再接入基于 `TabRouter + useNavigationBuilder` 的自定义 Tab navigator。现有 Screen 继续拥有 service、hook、事件订阅和生命周期；最后由单一集成任务修改共享旧文件，避免覆盖 `codex/stabilize-foundation` 的未提交稳定化改动。

**Tech Stack:** React Native 0.73、TypeScript、React Navigation 6、React Native Animated、react-native-svg、react-native-safe-area-context、Jest、@testing-library/react-native。

## Global Constraints

- Tasks 1–6 的纯 UI 开发起点为 `2c0cfa0`；Task 7 的生产集成基线必须换成稳定化工作完成、审查通过并实际提交后的 SHA，禁止把 `2c0cfa0` 当成最终生产基线。
- 第一阶段不修改 Android/Kotlin 悬浮球、通知、Manifest、Gradle、NativeModule，也不修改 Agent Runtime、Pipeline、安全存储或 MiniCPM。
- 不新增 npm 依赖；复用 `react-native-svg`、`react-native-safe-area-context`、React Navigation 6 和 `@testing-library/react-native`。
- 新视觉系统只能位于 `src/shared/ui/nono/**`；不得全局替换旧 `COLORS`。
- 内部路由名保留 `Models`，用户可见标签显示“Agent”。
- 主 Tab 必须由公开 `TabRouter + useNavigationBuilder` 构建；不得以 `BottomTabNavigator`、`detachInactiveScreens={false}` 或内容级 `PageTransitionWrapper` 冒充双图层转场。
- 已访问 scene 保持挂载，未访问 scene 保持 lazy；不得启用 `freezeOnBlur`。
- 前进时 incoming `+28% → 0`、outgoing `0 → -12%`；后退方向取反；时长 `280ms`；easing 为 `Easing.bezier(0.22, 1, 0.36, 1)`；`useNativeDriver: true`。
- 转场期间 outgoing/incoming 均不可点击；非活动页必须设置 `accessibilityElementsHidden` 与 `importantForAccessibility="no-hide-descendants"`。
- 快速连续切换必须 generation-safe，旧动画回调不得覆盖最后一次目标。
- 系统减少动态效果开启时直接切页，不创建第二图层，也不执行选中底板/图标缩放动画。
- Screen 保留 service、hook、state、副作用、taskId 过滤、取消与生命周期所有权；纯 View 不导入 service、storage、native module 或 runtime。
- `AppNavigator.tsx`、`navigation.ts`、`HomeScreen.tsx`、`TaskHistoryScreenTab.tsx` 和 Agent 配置组合 Screen 只允许在最终串行集成任务中修改。
- 每个生产行为必须先有能观察到预期失败的 RED 测试，再写实现；不得补写“事后测试”。

---

## File Structure

新增文件：

- `AwesomeProject/src/shared/ui/nono/tokens.ts`：NoNo 色彩、空间、圆角、阴影和动效常量。
- `AwesomeProject/src/shared/ui/nono/useReducedMotion.ts`：系统减少动态设置订阅。
- `AwesomeProject/src/shared/ui/nono/NoNoMark.tsx`：机器人电子面罩品牌图形。
- `AwesomeProject/src/shared/ui/nono/NoNoPage.tsx`：Safe Area 页面骨架。
- `AwesomeProject/src/shared/ui/nono/Surface.tsx`：统一卡片容器。
- `AwesomeProject/src/shared/ui/nono/SectionHeading.tsx`：分区标题。
- `AwesomeProject/src/shared/ui/nono/StatusBadge.tsx`：文本+颜色状态标签。
- `AwesomeProject/src/shared/ui/nono/PrimaryButton.tsx`：品牌主按钮和禁用语义。
- `AwesomeProject/src/shared/ui/nono/index.ts`：唯一公共导出面。
- `AwesomeProject/src/navigation/NoNoTabTransition.ts`：纯转场状态机和插值常量。
- `AwesomeProject/src/navigation/NoNoTabNavigator.tsx`：React Navigation 自定义 Tab navigator。
- `AwesomeProject/src/features/task/components/NoNoHomeView.tsx`：首页/执行状态纯展示。
- `AwesomeProject/src/features/task/components/NoNoActivityView.tsx`：活动列表纯展示。
- `AwesomeProject/src/features/settings/components/NoNoSettingsView.tsx`：设置纯展示。
- `AwesomeProject/src/shared/ui/nono/agent/AgentConfigView.tsx`：Agent 配置纯展示。

修改文件只在对应任务发生：

- `AwesomeProject/src/navigation/CustomTabBar.tsx`：持久底栏、可测量选中底板、descriptor 图标与显式禁用路由。
- `AwesomeProject/src/shared/components/PageLayout.tsx`：移除主页面内容级转场耦合。
- `AwesomeProject/src/navigation/AppNavigator.tsx`：最后替换 Tab 视图，不改权限/AppState 生命周期。
- `AwesomeProject/src/features/task/screens/HomeScreen.tsx`：最后仅把 render 映射到 `NoNoHomeView`。
- `AwesomeProject/src/features/task/screens/TaskHistoryScreenTab.tsx`：最后仅把 render 映射到 `NoNoActivityView`。
- `AwesomeProject/src/features/settings/screens/SettingsScreen.tsx`：最后仅把 render 映射到 `NoNoSettingsView`。

## Parallelization

- Task 1 完成并提交后，以该提交分别创建 `codex/nono-tab-transition`、`codex/nono-task-views`、`codex/nono-settings-agent-views` 三个独立 worktree；Task 2、Task 4、Task 5 可并行，禁止多个 Agent 在同一 worktree 中提交。
- 三个并行任务各自审查通过后，由主集成者按 Task 2 → Task 4 → Task 5 顺序 cherry-pick 到 `codex/nono-ui-phase1`；有冲突即停止并由单一 Agent 处理。
- Task 3 依赖 Task 1 和 Task 2。
- Task 6 依赖 Task 1 和 Task 3。
- Task 7 必须等稳定化 checkpoint 和 Agent controller 契约可用后，由一个集成 Agent 串行执行。
- Task 8 依赖全部前序任务。

---

## Execution Setup

Before Task 1, create `.worktrees/nono-ui-phase1` on branch `codex/nono-ui-phase1` from `2c0cfa0`. In that fresh worktree run:

```bash
cd AwesomeProject
npm ci
npm test -- --runInBand
npx tsc --noEmit
```

Expected: `npm ci` installs exactly `package-lock.json` without changing `package.json` or the lockfile; baseline Jest and TypeScript exit 0. If the baseline fails, save the exact output and stop for diagnosis before writing any Task 1 test. The transitive `@react-navigation/routers` package must resolve after `npm ci`; do not add it as a direct dependency.

---

### Task 1: NoNo Tokens and Shared Primitives

**Files:**

- Create: `AwesomeProject/src/shared/ui/nono/tokens.ts`
- Create: `AwesomeProject/src/shared/ui/nono/useReducedMotion.ts`
- Create: `AwesomeProject/src/shared/ui/nono/NoNoMark.tsx`
- Create: `AwesomeProject/src/shared/ui/nono/NoNoPage.tsx`
- Create: `AwesomeProject/src/shared/ui/nono/Surface.tsx`
- Create: `AwesomeProject/src/shared/ui/nono/SectionHeading.tsx`
- Create: `AwesomeProject/src/shared/ui/nono/StatusBadge.tsx`
- Create: `AwesomeProject/src/shared/ui/nono/PrimaryButton.tsx`
- Create: `AwesomeProject/src/shared/ui/nono/index.ts`
- Test: `AwesomeProject/src/__tests__/shared/nonoTokensAndPrimitives.test.tsx`
- Test: `AwesomeProject/src/__tests__/shared/NoNoReducedMotion.test.tsx`

**Interfaces:**

- Produces: `NONO_COLORS`, `NONO_SPACING`, `NONO_RADII`, `NONO_MOTION`, `NoNoPage`, `Surface`, `SectionHeading`, `StatusBadge`, `PrimaryButton`, `NoNoMark`, `useReducedMotion`.
- `NoNoMark` consumes `state: 'idle' | 'thinking' | 'confirmation' | 'success' | 'failure'` and `size?: number`.
- `PrimaryButton` consumes normal React Native `PressableProps` plus `label: string` and `busy?: boolean`.

- [ ] **Step 1: Write RED token and primitive tests**

```tsx
import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {
  NONO_COLORS,
  NONO_MOTION,
  NoNoMark,
  PrimaryButton,
} from '../../shared/ui/nono';

test('exports the approved NoNo palette and motion values', () => {
  expect(NONO_COLORS).toEqual(expect.objectContaining({
    ink: '#1B1D30', pearl: '#F8F7F3', cloud: '#F1EFFA',
    violet: '#756BF0', mint: '#8DF4E2', coral: '#FF9B79',
  }));
  expect(NONO_MOTION.tabMs).toBe(280);
  expect(NONO_MOTION.stackMs).toBe(320);
});

test.each(['idle', 'thinking', 'confirmation', 'success', 'failure'] as const)(
  'exposes an accessible robot state for %s', state => {
    const view = render(<NoNoMark state={state} />);
    expect(view.getByTestId(`nono-mark-${state}`)).toBeTruthy();
    expect(view.getByLabelText(`NoNo ${state}`)).toBeTruthy();
  },
);

test('disabled primary button does not dispatch', () => {
  const onPress = jest.fn();
  const view = render(<PrimaryButton label="开始执行" disabled onPress={onPress} />);
  fireEvent.press(view.getByRole('button', {name: '开始执行'}));
  expect(onPress).not.toHaveBeenCalled();
});
```

Before production code exists, also create `NoNoReducedMotion.test.tsx` with the lifecycle RED:

```tsx
import {act, renderHook, waitFor} from '@testing-library/react-native';
import {AccessibilityInfo} from 'react-native';
import {useReducedMotion} from '../../shared/ui/nono/useReducedMotion';

test('reads, subscribes, updates and removes the reduced-motion listener', async () => {
  const remove = jest.fn();
  let listener: ((value: boolean) => void) | undefined;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_, next) => {
    listener = next as (value: boolean) => void;
    return {remove} as never;
  });
  const hook = renderHook(() => useReducedMotion());
  await waitFor(() => expect(hook.result.current).toBe(true));
  act(() => listener?.(false));
  expect(hook.result.current).toBe(false);
  hook.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run RED tests**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/shared/nonoTokensAndPrimitives.test.tsx src/__tests__/shared/NoNoReducedMotion.test.tsx`

Expected: FAIL because `src/shared/ui/nono` does not exist.

- [ ] **Step 3: Implement tokens and primitives**

Use these exact public values in `tokens.ts`:

```ts
export const NONO_COLORS = {
  ink: '#1B1D30', pearl: '#F8F7F3', cloud: '#F1EFFA',
  violet: '#756BF0', mint: '#8DF4E2', coral: '#FF9B79',
  white: '#FFFFFF', muted: '#77798A', danger: '#9D4C43',
} as const;
export const NONO_SPACING = {xs: 4, sm: 8, md: 16, lg: 24, xl: 32} as const;
export const NONO_RADII = {sm: 16, md: 20, lg: 24, pill: 999} as const;
export const NONO_MOTION = {pressMs: 160, tabMs: 280, stackMs: 320} as const;
```

`useReducedMotion` must read once and unsubscribe using the returned subscription:

```ts
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => mounted && setReduced(value));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
}
```

Implement `NoNoMark` with `react-native-svg` geometric visor/eyes only; do not draw a human mouth or biometric face. All primitives must forward `accessibilityLabel`, `testID`, `style`, and disabled state rather than hiding them in wrapper props.

- [ ] **Step 4: Verify both Task 1 suites GREEN**

Run:

`cd AwesomeProject && npm test -- --runInBand src/__tests__/shared/nonoTokensAndPrimitives.test.tsx src/__tests__/shared/NoNoReducedMotion.test.tsx`

Expected: 2 suites PASS with no `act(...)` warning.

- [ ] **Step 5: Run type and lint checks for Task 1**

Run: `cd AwesomeProject && npx tsc --noEmit && npx eslint src/shared/ui/nono src/__tests__/shared/nonoTokensAndPrimitives.test.tsx src/__tests__/shared/NoNoReducedMotion.test.tsx`

Expected: exit 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add AwesomeProject/src/shared/ui/nono AwesomeProject/src/__tests__/shared
git commit -m "feat: add NoNo UI foundations"
```

---

### Task 2: Pure Tab Transition State Machine

**Files:**

- Create: `AwesomeProject/src/navigation/NoNoTabTransition.ts`
- Test: `AwesomeProject/src/__tests__/navigation/NoNoTabTransition.test.ts`

**Interfaces:**

- Produces `createInitialTabTransition(index)`, `beginTabTransition(state, targetIndex)`, `finishTabTransition(state, generation)`, `getTabDirection(from, to)`.
- State shape is exact:

```ts
export type NoNoTabTransitionState = {
  activeIndex: number;
  fromIndex: number | null;
  toIndex: number | null;
  direction: -1 | 0 | 1;
  generation: number;
  transitioning: boolean;
};
```

- [ ] **Step 1: Write RED state-machine tests**

```ts
test('uses route index to determine direction and exact travel values', () => {
  expect(getTabDirection(0, 2)).toBe(1);
  expect(getTabDirection(3, 1)).toBe(-1);
  expect(TAB_TRANSITION.incomingPercent).toBe(28);
  expect(TAB_TRANSITION.outgoingPercent).toBe(12);
  expect(TAB_TRANSITION.durationMs).toBe(280);
});

test('ignores stale completion after rapid retargeting', () => {
  const first = beginTabTransition(createInitialTabTransition(0), 1);
  const second = beginTabTransition(first, 3);
  expect(finishTabTransition(second, first.generation)).toBe(second);
  expect(finishTabTransition(second, second.generation).activeIndex).toBe(3);
});
```

- [ ] **Step 2: Run RED test**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/navigation/NoNoTabTransition.test.ts`

Expected: FAIL because module exports are missing.

- [ ] **Step 3: Implement the pure transition reducer**

`beginTabTransition` must settle the previous target as the new source before retargeting:

```ts
export function beginTabTransition(
  state: NoNoTabTransitionState,
  targetIndex: number,
): NoNoTabTransitionState {
  const source = state.transitioning && state.toIndex !== null
    ? state.toIndex
    : state.activeIndex;
  if (source === targetIndex) {
    return {
      ...state,
      activeIndex: source,
      fromIndex: null,
      toIndex: null,
      direction: 0,
      transitioning: false,
    };
  }
  return {
    activeIndex: source,
    fromIndex: source,
    toIndex: targetIndex,
    direction: getTabDirection(source, targetIndex),
    generation: state.generation + 1,
    transitioning: true,
  };
}
```

`finishTabTransition` returns the same state for stale generation; current generation commits `toIndex` and clears both layer indices.

- [ ] **Step 4: Run GREEN and static checks**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/navigation/NoNoTabTransition.test.ts && npx tsc --noEmit && npx eslint src/navigation/NoNoTabTransition.ts src/__tests__/navigation/NoNoTabTransition.test.ts`

Expected: 1 suite PASS; TypeScript and ESLint exit 0.

- [ ] **Step 5: Commit Task 2**

```bash
git add AwesomeProject/src/navigation/NoNoTabTransition.ts AwesomeProject/src/__tests__/navigation/NoNoTabTransition.test.ts
git commit -m "feat: add deterministic NoNo tab transitions"
```

---

### Task 3: Custom Dual-Layer Tab Navigator

**Files:**

- Create: `AwesomeProject/src/navigation/NoNoTabNavigator.tsx`
- Create: `AwesomeProject/src/__tests__/navigation/NoNoTabNavigator.test.tsx`

**Interfaces:**

- Consumes Task 1 `useReducedMotion`, Task 2 transition state/constants, and a `tabBar` render prop.
- Produces `createNoNoTabNavigator()` returning `{Navigator, Screen}` compatible with React Navigation screen descriptors.
- Navigator supports `initialRouteName`, `screenOptions`, `disabledRoutes?: readonly string[]`, and `tabBar`. It is the sole owner of `tabPress`, disabled-route redirect and `navigation.navigate`; it passes one `onRoutePress(routeKey)` callback to the tab bar.

- [ ] **Step 1: Write RED navigation behavior tests**

Build a real `NavigationContainer` with four test screens. Assert:

```tsx
expect(screen.getByText('Home content')).toBeTruthy();
fireEvent(screen.getByTestId('nono-scene-host'), 'layout', {
  nativeEvent: {layout: {x: 0, y: 0, width: 400, height: 700}},
});
fireEvent.press(screen.getByRole('tab', {name: '活动'}));
expect(screen.getAllByTestId(/^nono-scene-(Home|Models|History|Settings)$/)).toHaveLength(2);
expect(screen.getByTestId('nono-scene-Home').props.accessibilityElementsHidden).toBe(true);
act(() => jest.advanceTimersByTime(280));
expect(screen.getByText('Activity content')).toBeTruthy();
```

Add separate tests for:

- lazy first mount and visited scene retention;
- `tabPress` preventDefault leaves the original route active;
- disabled Home/History redirects selection to `Models`;
- three rapid presses end on the final route and stale timers cannot revert it;
- reduced motion keeps previously visited scenes mounted but only the target scene visible and accessible.

- [ ] **Step 2: Run RED navigation suite**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/navigation/NoNoTabNavigator.test.tsx`

Expected: FAIL because `createNoNoTabNavigator` is missing.

- [ ] **Step 3: Implement navigation builder and lazy scene registry**

Use the public builder exactly at the navigator boundary:

```tsx
const {state, navigation, descriptors, NavigationContent} = useNavigationBuilder(
  TabRouter,
  {children, screenOptions, initialRouteName},
);
```

Maintain `loadedKeys` as a Set initialized with the focused route key. Add a key when it first becomes a target; never remove it during the navigator lifetime. Render loaded scenes inside an absolute-fill host and keep the tab bar outside that host. Capture the numeric host width with `onLayout`; do not put percentage strings in a React Native transform.

`NoNoTabNavigator` implements `onRoutePress(routeKey)`: emit `tabPress` with `canPreventDefault: true`; if not prevented, resolve disabled routes to `Models` and navigate once. The tab-bar render prop receives this callback and must not emit or navigate independently.

- [ ] **Step 4: Implement two Animated scene layers**

Use one `Animated.Value(0)` per transition and numeric distances derived from the measured scene width:

```tsx
const incomingX = progress.interpolate({
  inputRange: [0, 1],
  outputRange: [sceneWidth * 0.28 * direction, 0],
});
const outgoingX = progress.interpolate({
  inputRange: [0, 1],
  outputRange: [0, sceneWidth * -0.12 * direction],
});
const incomingOpacity = progress.interpolate({inputRange: [0, 1], outputRange: [0.55, 1]});
const outgoingOpacity = progress.interpolate({inputRange: [0, 1], outputRange: [1, 0.48]});
```

Incoming scale is `0.99 → 1`; outgoing scale is `1 → 0.985`. Both transition layers use `pointerEvents="none"`. All nonactive layers use `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`.

Before a new rapid target, call `animationRef.current?.stop()`, synchronously settle the previous `toIndex`, increment generation, reset progress, then start the latest animation. Completion commits only when captured generation equals the current generation ref.

- [ ] **Step 5: Implement reduced motion and teardown**

When reduced motion is true, stop the current animation and set the navigation target immediately. Keep visited scenes mounted to honor retention, but set every non-target scene to `display: 'none'`, `pointerEvents="none"`, `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`. On unmount, stop the animation and invalidate generation.

- [ ] **Step 6: Run GREEN, accessibility, and static checks**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/navigation/NoNoTabTransition.test.ts src/__tests__/navigation/NoNoTabNavigator.test.tsx src/__tests__/shared/NoNoReducedMotion.test.tsx && npx tsc --noEmit && npx eslint src/navigation/NoNoTabNavigator.tsx src/__tests__/navigation/NoNoTabNavigator.test.tsx`

Expected: 3 suites PASS; no act warning; TypeScript and ESLint exit 0.

- [ ] **Step 7: Commit Task 3**

```bash
git add AwesomeProject/src/navigation/NoNoTabNavigator.tsx AwesomeProject/src/__tests__/navigation/NoNoTabNavigator.test.tsx
git commit -m "feat: add dual-layer NoNo tab navigator"
```

---

### Task 4: Pure Home and Activity Views

**Files:**

- Create: `AwesomeProject/src/features/task/components/NoNoHomeView.tsx`
- Create: `AwesomeProject/src/features/task/components/NoNoActivityView.tsx`
- Test: `AwesomeProject/src/__tests__/features/task/NoNoHomeView.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/task/NoNoActivityView.test.tsx`

**Interfaces:**

```ts
export type TaskStepViewModel = {id: string; label: string; completed: boolean};
export type NoNoHomeViewProps = {
  input: string;
  executing: boolean;
  displayInstruction: string;
  steps: readonly TaskStepViewModel[];
  currentStep?: number;
  suggestions: readonly {id: string; label: string; value: string}[];
  onInputChange(value: string): void;
  onClear(): void;
  onStart(): void;
  onRequestStop(): void;
  onSuggestionSelect(value: string): void;
};

export type ActivityItemViewModel = {
  id: string;
  title: string;
  meta: string;
  status: 'success' | 'failed' | 'cancelled';
  statusLabel: string;
};
export type NoNoActivityViewProps = {
  sections: readonly {title: string; items: readonly ActivityItemViewModel[]}[];
  emptyMessage: string;
  refreshing: boolean;
  pendingDeleteId: string | null;
  onRefresh(): void;
  onOpen(id: string): void;
  onRequestDelete(id: string): void;
  onConfirmDelete(): void;
  onCancelDelete(): void;
};
```

- [ ] **Step 1: Write RED View tests**

Create the tests before either View exists:

```tsx
test('Home dispatches input, suggestion, start and stop without owning execution', () => {
  const callbacks = {onInputChange: jest.fn(), onClear: jest.fn(), onStart: jest.fn(),
    onRequestStop: jest.fn(), onSuggestionSelect: jest.fn()};
  const view = render(<NoNoHomeView input="" executing={false} displayInstruction=""
    steps={[]} suggestions={[{id: 's1', label: '打开设置', value: '打开设置'}]}
    {...callbacks} />);
  expect(view.getByRole('button', {name: '开始执行'}).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(view.getByRole('button', {name: '打开设置'}));
  expect(callbacks.onSuggestionSelect).toHaveBeenCalledWith('打开设置');
  view.rerender(<NoNoHomeView input="打开设置" executing displayInstruction="打开设置"
    currentStep={1} steps={[{id: '1', label: '启动应用', completed: false}]}
    suggestions={[]} {...callbacks} />);
  fireEvent.press(view.getByRole('button', {name: '终止任务'}));
  expect(callbacks.onRequestStop).toHaveBeenCalledTimes(1);
});

test('Activity exposes status text and delegates deletion confirmation', () => {
  const onOpen = jest.fn();
  const onRequestDelete = jest.fn();
  const onConfirmDelete = jest.fn();
  const view = render(<NoNoActivityView refreshing={false} pendingDeleteId={null}
    emptyMessage="暂无活动" onRefresh={jest.fn()} onOpen={onOpen}
    onRequestDelete={onRequestDelete} onConfirmDelete={onConfirmDelete}
    onCancelDelete={jest.fn()} sections={[{title: '今天', items: [{id: 't1',
      title: '打开设置', meta: '09:41 · 2 步', status: 'success', statusLabel: '成功'}]}]} />);
  expect(view.getByText('成功')).toBeTruthy();
  fireEvent.press(view.getByRole('button', {name: '删除 打开设置'}));
  expect(onRequestDelete).toHaveBeenCalledWith('t1');
  view.rerender(<NoNoActivityView refreshing={false} pendingDeleteId="t1"
    emptyMessage="暂无活动" onRefresh={jest.fn()} onOpen={onOpen}
    onRequestDelete={onRequestDelete} onConfirmDelete={onConfirmDelete}
    onCancelDelete={jest.fn()} sections={[]} />);
  fireEvent.press(view.getByRole('button', {name: '确认删除'}));
  expect(onConfirmDelete).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run RED View tests**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/features/task/NoNoHomeView.test.tsx src/__tests__/features/task/NoNoActivityView.test.tsx`

Expected: FAIL because both Views are missing.

- [ ] **Step 3: Implement both pure Views**

Use only React Native, Task 1 primitives and props. Do not import navigation, TaskHistoryService, ModelService, execution hooks, NativeModules, AsyncStorage, or task adapters. The first phase intentionally maps only capabilities that already exist in the current Screens: Home idle/running with stop confirmation owned by the Screen, and Activity list/open/refresh/delete. Filtering, rerun, manual takeover and confirmation phases remain outside this task until their container contracts exist.

When `executing` is true, render `displayInstruction`, `currentStep`, steps and “终止任务”. When false, render input, clear/start and suggestions. Activity renders fixed status text in addition to color; destructive confirmation visibility follows `pendingDeleteId` and calls only the supplied callbacks.

- [ ] **Step 4: Run GREEN and static checks**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/features/task/NoNoHomeView.test.tsx src/__tests__/features/task/NoNoActivityView.test.tsx && npx tsc --noEmit && npx eslint src/features/task/components/NoNoHomeView.tsx src/features/task/components/NoNoActivityView.tsx src/__tests__/features/task`

Expected: 2 suites PASS; static checks exit 0.

- [ ] **Step 5: Commit Task 4**

```bash
git add AwesomeProject/src/features/task/components/NoNoHomeView.tsx AwesomeProject/src/features/task/components/NoNoActivityView.tsx AwesomeProject/src/__tests__/features/task
git commit -m "feat: add NoNo task views"
```

---

### Task 5: Pure Settings and Agent Configuration Views

**Files:**

- Create: `AwesomeProject/src/features/settings/components/NoNoSettingsView.tsx`
- Create: `AwesomeProject/src/shared/ui/nono/agent/AgentConfigView.tsx`
- Test: `AwesomeProject/src/__tests__/features/settings/NoNoSettingsView.test.tsx`
- Test: `AwesomeProject/src/__tests__/features/agent/AgentConfigView.test.tsx`

**Interfaces:**

```ts
export type NoNoSettingsViewProps = {
  adbFallbackEnabled: boolean;
  completionSoundEnabled: boolean;
  searchBoxPosition: string;
  searchDraft: string;
  searchModalVisible: boolean;
  onToggleAdb(value: boolean): void;
  onToggleSound(value: boolean): void;
  onOpenSearchEditor(): void;
  onSearchDraftChange(value: string): void;
  onSaveSearchPosition(): void;
  onCancelSearchPosition(): void;
  onOpenDebugLogs(): void;
};

export type AgentModeId = 'cloud_direct' | 'cloud_split' | 'local_vision_cloud_planner';
export type AgentConfigDraftViewModel = {activeMode: AgentModeId; maxSteps: number};
export type AgentModeCardViewModel = {
  id: AgentModeId;
  title: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  disabledReason?: string;
};
export type ConnectionCardViewModel = {
  id: string;
  label: string;
  providerLabel: string;
  modelLabel: string;
  secretLabel: string;
  status: 'untested' | 'testing' | 'ready' | 'error';
};
export type EligibilityViewModel = {
  status: 'unsupported' | 'needs_download' | 'needs_test' | 'testing' | 'ready' | 'failed';
  summary: string;
  canRunCheck: boolean;
};
export type AgentConfigViewProps = {
  draft: AgentConfigDraftViewModel;
  modes: readonly AgentModeCardViewModel[];
  connections: readonly ConnectionCardViewModel[];
  eligibility: EligibilityViewModel;
  isTaskRunning: boolean;
  saveState: 'idle' | 'dirty' | 'checking' | 'saving' | 'saved' | 'error';
  onModeSelect(id: string): void;
  onDraftChange(field: string, value: unknown): void;
  onConnectionAction(id: string, action: 'test' | 'edit' | 'delete'): void;
  onRunEligibilityCheck(): void;
  onSave(): void;
};
```

- [ ] **Step 1: Write RED settings and Agent View tests**

Create both test files before production Views exist:

```tsx
test('Settings delegates existing toggle, modal and debug-log behavior', () => {
  const onToggleAdb = jest.fn();
  const onOpenSearchEditor = jest.fn();
  const view = render(<NoNoSettingsView adbFallbackEnabled={false}
    completionSoundEnabled searchBoxPosition="顶部" searchDraft="顶部"
    searchModalVisible={false} onToggleAdb={onToggleAdb}
    onToggleSound={jest.fn()} onOpenSearchEditor={onOpenSearchEditor}
    onSearchDraftChange={jest.fn()} onSaveSearchPosition={jest.fn()}
    onCancelSearchPosition={jest.fn()} onOpenDebugLogs={jest.fn()} />);
  fireEvent(view.getByRole('switch', {name: 'ADB 兜底运行'}), 'valueChange', true);
  expect(onToggleAdb).toHaveBeenCalledWith(true);
  fireEvent.press(view.getByRole('button', {name: '编辑手机应用搜索框位置'}));
  expect(onOpenSearchEditor).toHaveBeenCalledTimes(1);
});

test('Agent mode 3 remains disabled and secrets stay masked', () => {
  const onModeSelect = jest.fn();
  const view = render(<AgentConfigView draft={{activeMode: 'cloud_direct', maxSteps: 99}}
    modes={[{id: 'local_vision_cloud_planner', title: '本地视觉 + 云端编排',
      description: '图片留在设备', selected: false, disabled: true,
      disabledReason: '设备尚未检测'}]} connections={[{id: 'c1', label: '编排模型',
      providerLabel: 'DeepSeek', modelLabel: 'deepseek-chat', secretLabel: '•••• 1234',
      status: 'ready'}]} eligibility={{status: 'needs_test', summary: '等待检测',
      canRunCheck: true}} isTaskRunning={false} saveState="dirty"
    onModeSelect={onModeSelect} onDraftChange={jest.fn()}
    onConnectionAction={jest.fn()} onRunEligibilityCheck={jest.fn()} onSave={jest.fn()} />);
  expect(view.getByText('•••• 1234')).toBeTruthy();
  fireEvent.press(view.getByRole('button', {name: '本地视觉 + 云端编排'}));
  expect(onModeSelect).not.toHaveBeenCalled();
  expect(StyleSheet.flatten(view.getByTestId('api-key-guide').props.style).marginTop).toBe(18);
});
```

- [ ] **Step 2: Run RED tests**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/features/settings/NoNoSettingsView.test.tsx src/__tests__/features/agent/AgentConfigView.test.tsx`

Expected: FAIL because both View modules are missing.

- [ ] **Step 3: Implement pure Views and local ViewModel types**

`NoNoSettingsView` maps only the behavior already owned by `SettingsScreen`: ADB toggle, completion-sound toggle, search-position modal/draft/save/cancel and debug-log navigation. Permission cards are deferred because the current Screen has no permission state contract.

`AgentConfigView` must not import `ModelService`, `storage`, `NativeModules`, Agent controller or runtime. It receives masked `secretLabel` values only; no property may be named `apiKey` or carry a full credential. It displays visible heading “Agent 配置” while leaving route naming to its container. The local ViewModel definitions above live beside the View and are the only UI-facing types.

The guide card must be a separate sibling block with `marginTop: 18`; connection cards retain `10` internal spacing.

- [ ] **Step 4: Run GREEN and privacy scans**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/features/settings/NoNoSettingsView.test.tsx src/__tests__/features/agent/AgentConfigView.test.tsx && npx tsc --noEmit && npx eslint src/features/settings/components/NoNoSettingsView.tsx src/shared/ui/nono/agent src/__tests__/features/settings src/__tests__/features/agent && ! rg "apiKey|NativeModules|AsyncStorage|ModelService" src/shared/ui/nono/agent/AgentConfigView.tsx`

Expected: 2 suites PASS; static checks exit 0; `rg` finds no forbidden import/data boundary.

- [ ] **Step 5: Commit Task 5**

```bash
git add AwesomeProject/src/features/settings/components/NoNoSettingsView.tsx AwesomeProject/src/shared/ui/nono/agent AwesomeProject/src/__tests__/features/settings AwesomeProject/src/__tests__/features/agent
git commit -m "feat: add NoNo settings and Agent views"
```

---

### Task 6: Persistent Animated Tab Bar and Layout Decoupling

**Files:**

- Modify: `AwesomeProject/src/navigation/CustomTabBar.tsx`
- Modify: `AwesomeProject/src/shared/components/PageLayout.tsx`
- Test: `AwesomeProject/src/__tests__/navigation/CustomTabBar.test.tsx`
- Test: `AwesomeProject/src/__tests__/shared/PageLayout.test.tsx`

**Interfaces:**

- `CustomTabBar` consumes real descriptors, `state`, `insets`, `disabledRoutes`, `reducedMotion`, and navigator-owned `onRoutePress(routeKey)`. It does not receive `navigation` and never emits events itself.
- `PageLayout` becomes a normal layout container; it does not wrap content in `PageTransitionWrapper`.

- [ ] **Step 1: Write RED tab-bar tests**

Assert descriptor-provided icons are called with focused/color/size, the active item has role `tab` and selected state, disabled routes expose disabled state but still call `onRoutePress(route.key)` exactly once, width changes recompute the four equal segments, active indicator remains one mounted element while its transform changes, and reduced motion sets final value without timing animation. Redirect behavior belongs to the Task 3 navigator test, not this suite.

- [ ] **Step 2: Write RED PageLayout ownership test**

From the first RED version, render `PageLayout` and assert the layout does **not** introduce an `Animated.View` around its content; the current implementation fails this assertion. Add a source-boundary assertion that reads `PageLayout.tsx` and expects no `PageTransitionWrapper` import; it also fails on the current implementation. Do not invert either assertion after implementation.

- [ ] **Step 3: Run RED suites**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/navigation/CustomTabBar.test.tsx src/__tests__/shared/PageLayout.test.tsx`

Expected: FAIL against the old hard-coded SVG/Dimensions implementation and old content wrapper.

- [ ] **Step 4: Implement persistent tab bar**

Replace module-load `Dimensions.get` with `useWindowDimensions()` plus an `onLayout` measured width. Compute `segmentWidth = measuredWidth / state.routes.length`. Keep one `Animated.View` indicator mounted and animate only its `translateX`. Render `descriptor.options.tabBarIcon` rather than route-name icon conditionals. Apply focused icon `translateY: -2` and slight scale only when reduced motion is false.

Each route press calls `onRoutePress(route.key)` exactly once. The navigator owns `tabPress`, disabled Home/History redirect and navigation dispatch. The bar only renders explicit disabled semantics; it must not infer disabled state from `tabBarButton` existence.

- [ ] **Step 5: Remove PageLayout transition coupling**

Delete the `PageTransitionWrapper` import and render `children` directly inside the content container. Keep `PageTransitionWrapper.tsx` for compatibility with untouched secondary screens; do not delete it in this task.

- [ ] **Step 6: Run GREEN and existing ownership tests**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/navigation/CustomTabBar.test.tsx src/__tests__/shared/PageLayout.test.tsx src/__tests__/screens/taskScreenOwnership.test.ts && npx tsc --noEmit && npx eslint src/navigation/CustomTabBar.tsx src/shared/components/PageLayout.tsx src/__tests__/navigation/CustomTabBar.test.tsx src/__tests__/shared/PageLayout.test.tsx`

Expected: 3 suites PASS; static checks exit 0.

- [ ] **Step 7: Commit Task 6**

```bash
git add AwesomeProject/src/navigation/CustomTabBar.tsx AwesomeProject/src/shared/components/PageLayout.tsx AwesomeProject/src/__tests__/navigation/CustomTabBar.test.tsx AwesomeProject/src/__tests__/shared/PageLayout.test.tsx
git commit -m "feat: add persistent NoNo tab bar motion"
```

---

### Task 7: Serial Screen and Navigator Integration

**Files:**

- Modify: `AwesomeProject/src/navigation/AppNavigator.tsx`
- Modify: `AwesomeProject/src/features/task/screens/HomeScreen.tsx`
- Modify: `AwesomeProject/src/features/task/screens/TaskHistoryScreenTab.tsx`
- Modify: `AwesomeProject/src/features/settings/screens/SettingsScreen.tsx`
- Create: `AwesomeProject/src/features/agent/screens/AgentConfigScreen.tsx`
- Test: `AwesomeProject/src/__tests__/navigation/NoNoAppIntegration.test.tsx`
- Preserve: `AwesomeProject/src/__tests__/screens/taskScreenOwnership.test.ts`
- Preserve: `AwesomeProject/src/__tests__/services/ADBFallbackBoundaries.test.ts`

**Interfaces:**

- Consumes Task 3 navigator, Tasks 4/5 pure Views, Task 6 tab bar, and exact Agent-lane export `AwesomeProject/src/core/engine/agentRuntime/config/AgentConfigController.ts`.
- `AgentConfigController.ts` must export `AgentConfigControllerSnapshot`, `AgentConfigController`, and `createAgentConfigController`; its snapshot exposes draft, connections, eligibility, `isTaskRunning`, `isRunnable`, save state and field errors, but never plaintext credentials. `isRunnable` reflects the activated configuration, required connections/capabilities, resolvable secret references and local-mode eligibility; unsaved draft edits cannot change it.
- Produces four user-visible tabs “首页 / Agent / 活动 / 设置” while route keys remain `Home / Models / History / Settings`.

- [ ] **Step 1: Create a stable checkpoint before touching shared files**

Record the exact `codex/stabilize-foundation` commit after its existing dirty remediation is reviewed and committed. Use `git rev-parse HEAD`, then use `apply_patch` to create `.superpowers/sdd/nono-ui-integration-base.txt` containing that exact 40-character SHA and one trailing newline. Rebase or cherry-pick Tasks 1–6 onto a new integration branch from that checkpoint. Abort integration if `HomeScreen.tsx`, `TaskHistoryScreenTab.tsx` or `AppNavigator.tsx` still has unrelated uncommitted changes.

Before writing the Agent Screen, run `test -f AwesomeProject/src/core/engine/agentRuntime/config/AgentConfigController.ts`. If it is absent, Tasks 1–6 remain complete but Task 7 stays pending; do not invent a competing controller in the UI lane.

`AppNavigator` creates exactly one App-lifetime controller instance with `useRef`, subscribes once with `useSyncExternalStore`, passes `snapshot.isRunnable` to `MainTabs`, and passes that same controller instance to `AgentConfigScreen`. Replace the old selected-model polling used only for Tab gating; keep permission/AppState lifecycle unchanged. Never construct a second controller inside `AgentConfigScreen`.

- [ ] **Step 2: Write RED integration tests**

Mock only service/controller boundaries. Assert initial route redirects to `Models` when no runnable Agent config exists, visible Tab copy uses “Agent”, Home and Activity are disabled in that state, all four routes use the new navigator, permissions/AppState listeners still register once, and active task callbacks reach the pure Home View without duplicate terminal listeners.

- [ ] **Step 3: Run RED integration plus ownership suites**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/navigation/NoNoAppIntegration.test.tsx src/__tests__/screens/taskScreenOwnership.test.ts src/__tests__/services/ADBFallbackBoundaries.test.ts`

Expected: new integration assertions FAIL while both ownership suites remain PASS.

- [ ] **Step 4: Replace only the Tab navigation view**

In `AppNavigator.tsx`, preserve the existing permission checks, AppState listeners, stack routes and cleanup. Replace only the four-Tab construction with `createNoNoTabNavigator`, pass explicit disabled routes, map visible labels, and render `CustomTabBar` outside the scene host.

- [ ] **Step 5: Convert Screens into View adapters without moving ownership**

Keep every existing hook, service call, native event subscription, taskId filter, cancel callback and cleanup in its Screen. Replace only JSX rendering with props for the matching pure View. Do not copy effect logic into the View. Do not replace whole files; make surgical import/render edits after reviewing the current checkpoint diff.

- Home maps its existing `taskInput`, `executing`, `executionSteps`, `currentStep`, suggestions, clear/start/stop callbacks; it does not add confirmation/manual-takeover state.
- Activity maps existing grouped task data, refresh, open, pending-delete, confirm/cancel-delete; it does not add filters or rerun.
- Settings maps existing ADB/sound/search modal state and debug-log navigation; it does not add permission status.
- `AgentConfigScreen` receives the exact App-lifetime Agent controller, subscribes with `useSyncExternalStore(controller.subscribe, controller.getSnapshot)`, converts the snapshot into the Task 5 ViewModels, and forwards controller methods. It never reads storage or NativeModules directly and never passes plaintext secrets to `AgentConfigView`.

- [ ] **Step 6: Run focused GREEN and source-boundary scans**

Run: `cd AwesomeProject && npm test -- --runInBand src/__tests__/navigation/NoNoAppIntegration.test.tsx src/__tests__/screens/taskScreenOwnership.test.ts src/__tests__/services/ADBFallbackBoundaries.test.ts src/__tests__/features/task/NoNoHomeView.test.tsx src/__tests__/features/task/NoNoActivityView.test.tsx src/__tests__/features/settings/NoNoSettingsView.test.tsx src/__tests__/features/agent/AgentConfigView.test.tsx && npx tsc --noEmit`

Expected: all suites PASS; TypeScript exit 0.

- [ ] **Step 7: Review shared-file diff before commit**

Run: `git diff --check && git diff -- AwesomeProject/src/navigation/AppNavigator.tsx AwesomeProject/src/features/task/screens/HomeScreen.tsx AwesomeProject/src/features/task/screens/TaskHistoryScreenTab.tsx AwesomeProject/src/features/settings/screens/SettingsScreen.tsx`

Expected: no whitespace errors; diff contains only navigator/view composition changes and no engine, ADB, Headless, cancel, persistence or native lifecycle rewrite.

- [ ] **Step 8: Commit Task 7**

```bash
git add .superpowers/sdd/nono-ui-integration-base.txt AwesomeProject/src/navigation/AppNavigator.tsx AwesomeProject/src/features/task/screens/HomeScreen.tsx AwesomeProject/src/features/task/screens/TaskHistoryScreenTab.tsx AwesomeProject/src/features/settings/screens/SettingsScreen.tsx AwesomeProject/src/features/agent/screens/AgentConfigScreen.tsx AwesomeProject/src/__tests__/navigation/NoNoAppIntegration.test.tsx
git commit -m "feat: integrate NoNo application UI"
```

---

### Task 8: Full Verification and Android Device Acceptance

**Files:**

- Create: `.superpowers/sdd/nono-ui-phase1-test-report.md`
- Modify production files: none unless a failing gate yields a separately reviewed fix.

- [ ] **Step 1: Run all JavaScript/TypeScript gates**

Run from the repository root:

```bash
(cd AwesomeProject && npm test -- --runInBand)
(cd AwesomeProject && npx tsc --noEmit)
(cd AwesomeProject && npm run lint)
(cd AwesomeProject && npx eslint src/shared/ui/nono src/navigation/NoNoTabNavigator.tsx src/navigation/NoNoTabTransition.ts src/navigation/CustomTabBar.tsx src/features/task/components/NoNoHomeView.tsx src/features/task/components/NoNoActivityView.tsx src/features/settings/components/NoNoSettingsView.tsx)
```

Expected: Jest and TypeScript exit 0 with no unhandled rejection or act warning. Changed-file ESLint must exit 0. Full `npm run lint` should exit 0; if the recorded stabilization baseline already fails, compare the exact file/rule/error set against that clean baseline and allow only an explicit unchanged-baseline waiver. Any new or changed lint finding fails the gate.

- [ ] **Step 2: Run Android compile gate**

Run from repository root: `(cd AwesomeProject/android && sh ./gradlew app:assembleDebug)`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Run privacy and boundary scans**

```bash
UI_BASE_SHA="$(sed -n '1p' .superpowers/sdd/nono-ui-integration-base.txt)"
! rg "apiKey|Authorization|NativeModules|AsyncStorage" AwesomeProject/src/shared/ui/nono/agent/AgentConfigView.tsx
! git diff --name-only "$UI_BASE_SHA"...HEAD | rg "android/|src/core/engine|src/core/ability|src/features/task/services"
git diff --check "$UI_BASE_SHA"...HEAD
```

Expected: `UI_BASE_SHA` resolves to the exact checkpoint recorded in Task 7; no credential/native/runtime imports in the pure View; no first-phase Android/engine/service files changed; diff check clean.

- [ ] **Step 4: Test real user behavior on the connected Android device**

Select the connected device, install the exact debug APK and launch it from the repository root:

```bash
adb devices
ANDROID_SERIAL="$(adb devices | awk 'NR > 1 && $2 == "device" {print $1; exit}')"
test -n "$ANDROID_SERIAL"
adb -s "$ANDROID_SERIAL" install -r AwesomeProject/android/app/build/outputs/apk/debug/app-debug.apk
adb -s "$ANDROID_SERIAL" shell monkey -p com.awesomeproject -c android.intent.category.LAUNCHER 1
```

Expected: one device serial is selected; install prints `Success`; monkey reports one injected event and the NoNo app opens. Then verify and record:

- 360×800 and the connected phone’s native resolution;
- four rapid Tab selections end on the final selection without blank scene or touch-through;
- outgoing scene is not announced by TalkBack;
- Android “移除动画” produces immediate single-layer switching;
- keyboard open/close does not cover Home input or persistent Tab bar;
- task execution continues while switching Home → Activity → Settings and terminal UI updates once;
- no runnable Agent redirects to visible “Agent”, while enabled configuration restores Home/Activity;
- Activity → Task detail → back uses existing native-stack behavior without changing task ownership.

- [ ] **Step 5: Record test evidence**

Write commands, exit codes, test counts, device model/API level, observed behavior and any waiver to `.superpowers/sdd/nono-ui-phase1-test-report.md`. Then run:

`agent-runtime test-gate --record .superpowers/sdd/nono-ui-phase1-test-report.md`

Expected: test gate records PASS or an explicit evidence-backed waiver.

- [ ] **Step 6: Run required branch review**

Generate a review package from the recorded integration base to HEAD and run `agent-runtime review`. Resolve every Critical/Important finding with a covering RED/GREEN test, then regenerate the unchanged-snapshot review only after the implementation changes.

- [ ] **Step 7: Final commit for evidence-only files**

```bash
git add .superpowers/sdd/nono-ui-phase1-test-report.md
git commit -m "test: record NoNo UI verification"
```

---

## Deferred Second-Phase Plan

The Android overlay and foreground-notification redesign is intentionally excluded from this plan. It requires a separate plan built around a shared `TaskSurfaceStateV1` DTO, taskId/revision arbitration, notification IDs/channels `1001/1002/2001`, Headless ABI preservation, main-thread WindowManager operations, and real-device foreground-service lifecycle verification. It may start in parallel only on new DTO/presenter files; `AccessibilityPackage.kt`, `AndroidManifest.xml`, `android/app/build.gradle`, `HeadlessTaskExecutionAdapter.ts` and existing services remain serial integration hotspots with the Agent/MiniCPM lane.

## Self-Review Result

- Spec coverage: palette, NoNo robot mark, four main surfaces, persistent Tab bar, true dual-layer transitions, rapid retargeting, reduced motion, safe area, accessibility, pure View boundaries, Agent visible naming, phased Android deferral and device acceptance each map to an explicit task.
- Completeness scan: every implementation step contains concrete interfaces, commands, expected results and completion criteria.
- Type consistency: route keys stay `Home/Models/History/Settings`; visible Agent naming is presentation-only; Task 7 consumes the exact pure View boundaries defined in Tasks 4/5.
- Conflict scan: Tasks 1–6 use isolated/new UI ownership; Task 7 is explicitly blocked until a clean stabilization checkpoint exists and is the only task allowed to touch shared Screen/navigation files.
