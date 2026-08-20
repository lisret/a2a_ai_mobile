# NoNo 离线听写 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对着角色说一句短文本就能出字。优先系统 `SpeechRecognizer`，失败再用端侧大 ASR，最后用 APK 内小 ASR；大模型仅 Wi-Fi 静默升级；不用演示话轮，不绑厂商私有包名。

**Architecture:** 原生 `SpeechToTextModule` 做探测、状态机和熔断。`SpeechRouter` 按 **系统 → upgrade → builtin** 选档；系统在 `Starting` 失败可同一次点按降级，一旦进入 `Listening` 则本句结束。Sherpa-ONNX 只负责两档端侧模型。`SilentAsrUpgrade` 仍只在 Wi-Fi 拉大模型。

**Tech Stack:** React Native 0.73.6、Kotlin `SpeechRecognizer`、Sherpa-ONNX AAR、`react-native-permissions`、AsyncStorage、Jest。不用通用 RN 语音插件当唯一实现。下载复用 `LocalPackModule`。

**Spec:** `docs/superpowers/specs/2026-08-19-nono-avatar-asr-local-packs-design.md` 听写部分。

**Prerequisite:** `docs/superpowers/plans/2026-08-20-nono-avatar-glb-packs.md` Task 2（`LocalPackModule` / `localPack.getNetworkType` / `getFreeBytes` / `installFromUrl`）必须先合入。

## Global Constraints

- 点角色即可听写。不依赖下载完成、不用 `DEMO_TURNS` 冒充成功。
- 开口档位：**系统 SpeechRecognizer → 端侧大模型 → 端侧小模型**。
- 不硬编码小爱/小布/Jovi/Bixby 包名。本版不接华为 SDK、不接自有云端 ASR、首页不拉 `ACTION_RECOGNIZE_SPEECH`。
- 听写增强模型仅 Wi-Fi 静默下载；移动网络、未知网络、飞行模式不下。
- 下载 / 校验 / load 失败：跳过大模型档，无进度、无弹窗、无通知。
- 系统档连续失败 2 次（不含 NO_MATCH / SPEECH_TIMEOUT）后本进程熔断，改从端侧开始。
- MiniCPM 视觉包不套用这条静默升级。
- 听写包不得写入 `@autoglm:models` / `@nono:models:*`。
- 日志只记 final 文本长度，不把全文打到非调试通道。
- 说到一半不热切换模型。
- 磁盘门槛：可用空间 ≥ `upgrade.bytes * 2 + 50MB`。
- 验收机：小米 9。本版不接 iOS。
- 每项行为必须经历真实 RED → GREEN。

---

## File map

| 文件 | 职责 |
| --- | --- |
| `AwesomeProject/scripts/pin-asr-artifacts.js` | 下载官方 tar、算 sha256、写出 pins |
| `AwesomeProject/src/features/task/asr/AsrArtifactPins.ts` | builtin / upgrade 的 url、bytes、sha256、文件名 |
| `AwesomeProject/src/features/task/asr/AsrModelStore.ts` | 解压 builtin、upgradeReady、resolve |
| `AwesomeProject/src/features/task/asr/SilentAsrUpgrade.ts` | Wi-Fi 静默下载 |
| `AwesomeProject/android/.../SpeechToTextModule.kt` | 系统识别探测、状态机、熔断 |
| `AwesomeProject/src/features/task/asr/SpeechRouter.ts` | 系统 → upgrade → builtin |
| `AwesomeProject/android/.../SherpaAsrModule.kt` | 端侧大/小模型 |
| `AwesomeProject/src/features/task/asr/SherpaAsr.ts` | Sherpa JS 封装 |
| `AwesomeProject/src/features/task/screens/HomeScreen.tsx` | 权限、partial/final、删除 DEMO |

钉死产物（官方 GitHub Release，不是 CDN 脚本）：

- builtin：`https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23-mobile.tar.bz2`（约 51.8MB，适合进 APK）
- upgrade：`https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20-mobile.tar.bz2`（约 330.9MB，只 Wi-Fi 静默）

模型目录内需要 `encoder*.onnx`、`decoder*.onnx`、`joiner*.onnx`、`tokens.txt`。具体文件名以 tar 内为准，写入 pins 的 `files` 数组。

---

### Task 1: 钉死 ASR 产物

**Files:**
- Create: `AwesomeProject/scripts/pin-asr-artifacts.js`
- Create: `AwesomeProject/src/features/task/asr/AsrArtifactPins.ts`（由脚本生成，也可手写但必须与下载字节一致）
- Test: `AwesomeProject/src/__tests__/features/task/asr/AsrArtifactPins.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:

```ts
export interface AsrFilePin {
  name: string;
  bytes: number;
  sha256: string;
}
export interface AsrPackPin {
  id: 'builtin' | 'upgrade';
  title: string;
  archiveUrl: string;
  archiveBytes: number;
  archiveSha256: string;
  files: AsrFilePin[];
}
export const ASR_PINS: {builtin: AsrPackPin; upgrade: AsrPackPin};
```

- [ ] **Step 1: Write the failing test**

```ts
import {ASR_PINS} from '../../../features/task/asr/AsrArtifactPins';

describe('ASR_PINS', () => {
  it('pins builtin and upgrade with sha256', () => {
    expect(ASR_PINS.builtin.id).toBe('builtin');
    expect(ASR_PINS.upgrade.id).toBe('upgrade');
    expect(ASR_PINS.builtin.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(ASR_PINS.upgrade.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(ASR_PINS.builtin.archiveBytes).toBeGreaterThan(1_000_000);
    expect(ASR_PINS.upgrade.archiveBytes).toBeGreaterThan(
      ASR_PINS.builtin.archiveBytes,
    );
    expect(ASR_PINS.builtin.files.some(f => f.name.endsWith('tokens.txt'))).toBe(
      true,
    );
  });

  it('does not use jsdelivr or unpkg', () => {
    const blob = JSON.stringify(ASR_PINS);
    expect(blob).not.toMatch(/jsdelivr|unpkg|cdnjs/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd AwesomeProject && npm test -- --testPathPattern=AsrArtifactPins.test.ts`

Expected: FAIL module not found.

- [ ] **Step 3: Write pin script and generate pins**

`pin-asr-artifacts.js`：

1. 下载两个 tar.bz2 到 `AwesomeProject/build/asr-pins/`。
2. `sha256` + `stat` 写入 archive 字段。
3. 解压，对每个 `*.onnx` 和 `tokens.txt` 记 `name/bytes/sha256`。
4. 生成 `AsrArtifactPins.ts`。
5. 把 **builtin 解压目录** 拷到 `AwesomeProject/android/app/src/main/assets/nono-asr/builtin/`（大文件，必须加入 `AwesomeProject/.gitignore` 的例外说明：assets 由脚本填充，CI/本地构建前跑 pin 脚本；不要把 upgrade 放进 APK）。

gitignore：

```
android/app/src/main/assets/nono-asr/
android/app/libs/*.aar
```

构建任务 `copyNonoAsrAssets` 从 `build/asr-pins/builtin/` 拷到 assets。仓库只提交 `AsrArtifactPins.ts` 和脚本，不提交 50MB 模型。开发者首次 `node scripts/pin-asr-artifacts.js`。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd AwesomeProject && npm test -- --testPathPattern=AsrArtifactPins.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/scripts/pin-asr-artifacts.js \
  AwesomeProject/src/features/task/asr/AsrArtifactPins.ts \
  AwesomeProject/src/__tests__/features/task/asr/AsrArtifactPins.test.ts \
  AwesomeProject/.gitignore \
  AwesomeProject/android/app/build.gradle
git commit -m "$(cat <<'EOF'
feat: pin Sherpa ASR archives by sha256

Keep builtin and upgrade weights on GitHub release URLs, never a JS CDN.
EOF
)"
```

---

### Task 2: AsrModelStore

**Files:**
- Create: `AwesomeProject/src/features/task/asr/AsrModelStore.ts`
- Modify: `AwesomeProject/src/shared/constants/storage.config.ts` — `ASR_UPGRADE_READY: '@nono:asr_upgrade_ready'`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalPackModule.kt` — 增加 `installFromAssets(kind, id, assetDir, filesJson)`：从 APK assets 拷文件并按 pins 校验
- Test: `AwesomeProject/src/__tests__/features/task/asr/AsrModelStore.test.ts`

**Interfaces:**
- Consumes: `ASR_PINS`, `localPack`, `STORAGE_KEYS.ASR_UPGRADE_READY`
- Produces:

```ts
export async function ensureBuiltinAsr(): Promise<void>;
export async function isUpgradeReady(): Promise<boolean>;
export async function markUpgradeReady(ready: boolean): Promise<void>;
export async function resolveAsrPackId(): Promise<'builtin' | 'upgrade'>;
export async function getAsrDirUri(id: 'builtin' | 'upgrade'): Promise<string>;
export function upgradeDiskBudgetBytes(): number;
```

`upgradeDiskBudgetBytes` = `ASR_PINS.upgrade.archiveBytes * 2 + 50 * 1024 * 1024`。

`resolveAsrPackId`：仅当 `isUpgradeReady()` 且 `listFiles('asr','upgrade')` 能通过 pins 的 files 列表时返回 `upgrade`；否则 `markUpgradeReady(false)`、`deletePack('asr','upgrade')`、返回 `builtin`。

- [ ] **Step 1: Write the failing test**

1. 默认 `resolveAsrPackId()` 为 `builtin`。
2. `upgradeReady=true` 但 `listFiles` 缺 `tokens.txt` → 结果 `builtin`，且 `deletePack` 被调用、ready 被打回 false。
3. `upgradeDiskBudgetBytes()` 大于 `archiveBytes`。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd AwesomeProject && npm test -- --testPathPattern=AsrModelStore.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement store + `installFromAssets`**

`ensureBuiltinAsr` 每次首页 focus 调用：native 若哈希已匹配则 no-op。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd AwesomeProject && npm test -- --testPathPattern=AsrModelStore.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/features/task/asr/AsrModelStore.ts \
  AwesomeProject/src/shared/constants/storage.config.ts \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalPackModule.kt \
  AwesomeProject/src/features/task/avatar/LocalPack.ts \
  AwesomeProject/src/__tests__/features/task/asr/AsrModelStore.test.ts
git commit -m "$(cat <<'EOF'
feat: resolve ASR packs with builtin as the only fallback

Drop a corrupt upgrade directory instead of leaving it selected.
EOF
)"
```

---

### Task 3: SilentAsrUpgrade

**Files:**
- Create: `AwesomeProject/src/features/task/asr/SilentAsrUpgrade.ts`
- Test: `AwesomeProject/src/__tests__/features/task/asr/SilentAsrUpgrade.test.ts`

**Interfaces:**
- Consumes: `localPack.getNetworkType`, `getFreeBytes`, `installFromUrl`, `ASR_PINS.upgrade`, `isUpgradeReady`, `markUpgradeReady`, `upgradeDiskBudgetBytes`
- Produces: `maybeSilentUpgradeAsr(): Promise<void>` — 永不 throw 到 UI

- [ ] **Step 1: Write the failing test**

```ts
describe('maybeSilentUpgradeAsr', () => {
  it('does nothing on cellular', async () => {
    // mock network cellular, installFromUrl must not run
  });
  it('does nothing on none or unknown', async () => {
    // same
  });
  it('does nothing if already ready', async () => {});
  it('does nothing if free bytes below budget', async () => {});
  it('on wifi installs archive then marks ready', async () => {});
  it('on hash failure leaves ready false and does not throw', async () => {});
});
```

upgrade 的 `installFromUrl` 下的是 **tar.bz2**。native 增加 `installArchiveFromUrl(kind, id, url, bytes, sha256)`：校验 archive 后解压到 pack 目录，再按 `ASR_PINS.upgrade.files` 校验每个文件；多余文件视为失败并 `deletePack`。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd AwesomeProject && npm test -- --testPathPattern=SilentAsrUpgrade.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

函数内全部 try/catch，catch 只 `console.info` 长度/原因码（`wifi_only` / `no_space` / `bad_hash`），不 `Alert`、不通知。

不要和 `avatars` 使用同一个 `{id}.part` 文件名；part 放在 `files/nono/asr/upgrade.part`。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd AwesomeProject && npm test -- --testPathPattern=SilentAsrUpgrade.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/features/task/asr/SilentAsrUpgrade.ts \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalPackModule.kt \
  AwesomeProject/src/features/task/avatar/LocalPack.ts \
  AwesomeProject/src/__tests__/features/task/asr/SilentAsrUpgrade.test.ts
git commit -m "$(cat <<'EOF'
feat: silently fetch the larger ASR model on Wi-Fi only

Skip cellular and unknown networks so voice upgrade stays unattended.
EOF
)"
```

---

### Task 4: 系统 SpeechRecognizer

**Files:**
- Create: `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/SpeechToTextModule.kt`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityPackage.kt`
- Modify: `AwesomeProject/android/app/src/main/AndroidManifest.xml` — `RECORD_AUDIO` 与：

```xml
<queries>
    <intent>
        <action android:name="android.speech.RecognitionService" />
    </intent>
</queries>
```

- Create: `AwesomeProject/src/features/task/asr/SpeechToText.ts`
- Modify: `AwesomeProject/jest.setup.js` — `SpeechToTextModule: {}`
- Test: `AwesomeProject/src/__tests__/features/task/asr/SpeechToText.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:

```ts
export type SpeechEngine = 'system' | 'upgrade' | 'builtin';
export type SpeechCapability = {
  available: boolean;
  onDeviceAvailable: boolean;
  servicePackage?: string;
};
export type SpeechEvent =
  | {type: 'ready'}
  | {type: 'partial'; text: string}
  | {type: 'final'; text: string; engine: SpeechEngine}
  | {type: 'error'; code: 'busy' | 'no_match' | 'timeout' | 'network' | 'client' | 'unavailable'};

export function getCapability(): Promise<SpeechCapability>;
export function startSystemListen(): Promise<void>;
export function stopSystemListen(): Promise<void>;
export function destroySystemListen(): Promise<void>;
export function isSystemFused(): boolean;
```

Native 必须：主线程 `createSpeechRecognizer` / `startListening`；API 31+ 先试 on-device；`queryIntentServices` 后才允许 `createSpeechRecognizer(context, component)`；3s 无 `onReadyForSpeech` → `unavailable`；`ERROR_NO_MATCH` / `ERROR_SPEECH_TIMEOUT` 不计入熔断；其它失败累计 2 次 `isSystemFused()==true`。禁止写死厂商包名。禁止 `ACTION_RECOGNIZE_SPEECH`。

- [ ] **Step 1: Write the failing test**

1. `startSystemListen` 在 fused 时立即 `error.unavailable` 且不调 native start。
2. 两次 `error.client` 之后 `isSystemFused()` 为 true。
3. `error.no_match` 不增加熔断计数。
4. 仓库 `SpeechToTextModule.kt` 不含 `xiaoai` / `speechassist` / `jovi` / `bixby` 字符串（实现后用 `fs.readFileSync` 断言）。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd AwesomeProject && npm test -- --testPathPattern=SpeechToText.test.ts`

Expected: FAIL module not found.

- [ ] **Step 3: Implement Kotlin + JS**

`Intent` extras：`LANGUAGE_MODEL_FREE_FORM`、`zh-CN`、`EXTRA_PARTIAL_RESULTS=true`、`EXTRA_MAX_RESULTS=3`、`EXTRA_PREFER_OFFLINE=true`（偏好，不当事成）。用完 `destroy()`。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd AwesomeProject && npm test -- --testPathPattern=SpeechToText.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/SpeechToTextModule.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityPackage.kt \
  AwesomeProject/android/app/src/main/AndroidManifest.xml \
  AwesomeProject/src/features/task/asr/SpeechToText.ts \
  AwesomeProject/jest.setup.js \
  AwesomeProject/src/__tests__/features/task/asr/SpeechToText.test.ts
git commit -m "$(cat <<'EOF'
feat: probe Android SpeechRecognizer with a fuse

Prefer the system engine without binding vendor private components.
EOF
)"
```

---

### Task 5: Sherpa JNI 桥

**Files:**
- Create: `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/SherpaAsrModule.kt`
- Create: `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/SherpaAsrPackage.kt` 或把模块加进现有 `AccessibilityPackage`
- Modify: `AwesomeProject/android/app/build.gradle` — `implementation files('libs/sherpa-onnx.aar')`。`pin-asr-artifacts.js` 同时从 sherpa-onnx GitHub Release 下载官方 Android AAR 到 `android/app/libs/sherpa-onnx.aar`（禁止 jsDelivr / Maven Central 以外的随机镜像；Release 资产名写入脚本常量）。`android/app/libs/*.aar` gitignore，构建前必须先跑 pin 脚本。
- Modify: `AwesomeProject/android/app/src/main/AndroidManifest.xml` — `RECORD_AUDIO`
- Create: `AwesomeProject/src/features/task/asr/SherpaAsr.ts`
- Modify: `AwesomeProject/jest.setup.js` — `SherpaAsrModule: {}`
- Test: `AwesomeProject/src/__tests__/features/task/asr/SherpaAsr.test.ts`

**Interfaces:**
- Consumes: `getAsrDirUri`, `resolveAsrPackId`
- Produces:

```ts
export type AsrEvent =
  | {type: 'partial'; text: string}
  | {type: 'final'; text: string; packId: 'builtin' | 'upgrade'}
  | {type: 'error'; code: 'no_permission' | 'engine_failed'};

export function startListening(opts: {
  packId: 'builtin' | 'upgrade';
  modelDir: string;
  onEvent: (event: AsrEvent) => void;
}): Promise<void>;
export function stopListening(): Promise<void>;
```

Native：`AudioRecord` 16kHz mono；`OnlineRecognizer` + `OnlineStream`；endpoint 后 `final`。`packId` 在 `startListening` 时冻结，直到 `stopListening`。

load 失败：emit `engine_failed`。upgrade 失败时 store 回滚 ready 标志。同一句是否改试下一档由 Task 6 的 Router 决定，Sherpa 模块自己不启动系统识别。

- [ ] **Step 1: Write the failing test**

JS wrapper：`startListening` 在 `packId` 非法时 throw；把 native 的 event 转成 `AsrEvent`。mock NativeEventEmitter。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd AwesomeProject && npm test -- --testPathPattern=SherpaAsr.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement module + wrapper**

参考 sherpa-onnx `android/SherpaOnnx` 示例的 `OnlineRecognizerConfig` / `getModelConfig` 中文 14M 路径，但 encoder/decoder/joiner/tokens 必须来自 pins 的 `files[].name`，不要写死过期文件名。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd AwesomeProject && npm test -- --testPathPattern=SherpaAsr.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/SherpaAsrModule.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityPackage.kt \
  AwesomeProject/android/app/build.gradle \
  AwesomeProject/android/app/src/main/AndroidManifest.xml \
  AwesomeProject/src/features/task/asr/SherpaAsr.ts \
  AwesomeProject/jest.setup.js \
  AwesomeProject/src/__tests__/features/task/asr/SherpaAsr.test.ts
git commit -m "$(cat <<'EOF'
feat: add on-device streaming ASR via Sherpa-ONNX

Keep recognition inside JNI so listening does not call a cloud API.
EOF
)"
```

---

### Task 6: SpeechRouter

**Files:**
- Create: `AwesomeProject/src/features/task/asr/SpeechRouter.ts`
- Test: `AwesomeProject/src/__tests__/features/task/asr/SpeechRouter.test.ts`

**Interfaces:**
- Consumes: `getCapability`, `startSystemListen`, `isSystemFused`, `resolveAsrPackId`, `getAsrDirUri`, Sherpa `startListening`
- Produces: `startUtterance(onEvent)` / `stopUtterance()`，事件带 `engine: 'system' | 'upgrade' | 'builtin'`

规则：

1. 未熔断则先系统。`error.unavailable|client|network` 且尚未 `ready` → 同一次调用改试 upgrade（若 ready）否则 builtin。
2. 已 `ready` 后的失败：结束本句，不热切。
3. 系统熔断或跳过：upgrade 可用则 Sherpa upgrade，否则 builtin。
4. upgrade `engine_failed` 且尚未 `ready`：改 builtin。已 listening 则结束。

- [ ] **Step 1: Write the failing test**

覆盖：系统 ready+final；系统 Starting 失败落到 builtin；fused 时不调系统；upgrade 失败落到 builtin；listening 后失败不启动第二引擎。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd AwesomeProject && npm test -- --testPathPattern=SpeechRouter.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement router**

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd AwesomeProject && npm test -- --testPathPattern=SpeechRouter.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/features/task/asr/SpeechRouter.ts \
  AwesomeProject/src/__tests__/features/task/asr/SpeechRouter.test.ts
git commit -m "$(cat <<'EOF'
feat: route speech through system then large then small ASR

Fall through only before the microphone is captured by an engine.
EOF
)"
```

---

### Task 7: 首页真实听写

**Files:**
- Modify: `AwesomeProject/src/features/task/screens/HomeScreen.tsx`
- Modify: `AwesomeProject/src/shared/constants/permission.config.ts` — 增加 `RECORD_AUDIO` 分组 `CORE`，purpose「对着角色说话时把语音转成文字」
- Test: `AwesomeProject/src/__tests__/features/task/HomeScreenListen.test.tsx`

**Interfaces:**
- Consumes: `ensureBuiltinAsr`, `maybeSilentUpgradeAsr`, `startUtterance`, `stopUtterance`, `check`/`request` from `react-native-permissions`
- Produces: `HeardTurn` 仅来自 `final.text`

```ts
type HeardTurn = {
  text: string;
  intent: 'operate';
};
```

本版不做意图分类。`acceptHeard` 对无 proposal 的 operate 只清卡片（现有「去办理」若依赖 DEMO 的 operate 路径，改为用 `heard.text` 填入现有任务入口，**不要**自动 `startTask`）。

- [ ] **Step 1: Write the failing test**

1. `HomeScreen.tsx` 源码（`fs.readFileSync`）不含 `DEMO_TURNS`。
2. mock 权限拒绝：`startVoiceListen` 后不出现 `heard.text`，且 `startUtterance` 未调用。
3. mock 权限通过 + final `你好`：出现 `heard.text === '你好'`。
4. `maybeSilentUpgradeAsr` 在 focus 时调用，但不因此显示下载文案（屏幕 JSON 不含「下载模型」「正在下载识别」）。
5. `startVoiceListen` 调用 `startUtterance` 而不是直接 `SherpaAsr.startListening`。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd AwesomeProject && npm test -- --testPathPattern=HomeScreenListen.test.tsx`

Expected: FAIL（仍有 DEMO_TURNS）

- [ ] **Step 3: Replace listen path**

`startVoiceListen`：

1. `executing || listening` return。
2. 无陪伴模型：保持现有 Alert。
3. `request(PERMISSIONS.ANDROID.RECORD_AUDIO)`；拒绝则 `Alert`「需要麦克风才能说话」，return。
4. `await ensureBuiltinAsr()`（保证保底模型在盘上，即使本句走系统档）。
5. `setListening(true)`；`startUtterance(onEvent)`。
6. `partial` 更新 dock；`final` 空文本不设 heard，否则 `setHeard({text, intent:'operate'})`。
7. 三档都失败：`Alert`「这次没听清，请再试」，禁止 DEMO。

`useFocusEffect`：`ensureBuiltinAsr(); maybeSilentUpgradeAsr();` 不要 await 挡 UI。

删除 `listenTimer` / `DEMO_TURNS` / `listenTurn`。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd AwesomeProject && npm test -- --testPathPattern=HomeScreenListen.test.tsx`

Expected: PASS。再跑 `npm test -- --testPathPattern=avatar` 确认外观测试未坏。

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/features/task/screens/HomeScreen.tsx \
  AwesomeProject/src/shared/constants/permission.config.ts \
  AwesomeProject/src/__tests__/features/task/HomeScreenListen.test.tsx
git commit -m "$(cat <<'EOF'
feat: replace demo listen turns with the speech router

Ask for the mic, then system ASR before on-device large and small models.
EOF
)"
```

---

### Task 8: 小米 9 验收

- [ ] **Step 1: 准备模型资产**

Run: `cd AwesomeProject && node scripts/pin-asr-artifacts.js`

Expected: `android/app/src/main/assets/nono-asr/builtin/` 下有 onnx + tokens。

- [ ] **Step 2: 安装并断网听写**

飞行模式点角色，授予麦克风，说「打开设置」。Expected：出字（系统档在无网下应失败或熔断，落到 builtin）。无下载 UI。`logcat` 无 jsdelivr。

- [ ] **Step 3: 拒麦克风**

Expected：权限说明，不出现假句子。

- [ ] **Step 4: 系统熔断**

若小米 9 上系统识别直接失败：连点两次失败后第三次 log 中 `engine` 为 `builtin` 或 `upgrade`，不再出现系统 `startListening`。

- [ ] **Step 5: Wi-Fi 静默升级**

连 Wi-Fi 使用 1 分钟，界面仍无下载文案。再用 `run-as` 看 `files/nono/asr/upgrade/` 是否出现。出现后系统已熔断时下一句 `engine` 为 `upgrade`（log 只打 engine 与 text length）。

人为截断 upgrade 文件，杀进程再听。Expected：无弹窗抱怨升级，仍能出字。

- [ ] **Step 6: 移动网络**

关 Wi-Fi 开 4G，抓包或 logcat 确认没有 upgrade archive URL 请求。

无代码改动不提交；bugfix 单独 commit。
