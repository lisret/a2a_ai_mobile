# NoNo 本地 3D 外观包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 安装包内的程序化 3D 永远能显示；用户点选后才下载 `glb` 外观，失败回滚到内置 3D，全程不走 CDN、不执行远程 JS。

**Architecture:** APK 只读运行时（`three.module.js` + 本地 `GLTFLoader.js` + `avatar.html` + `scene.js`）先画出 builtin。`LocalPackModule` 把钉死的外观包下到 `files/nono/avatars/{id}/` 并校验 sha256。WebView 只加载 `file://` 路径；解析失败则 `useBuiltin()` 并把 `activeId` 打回 `builtin`。

**Tech Stack:** React Native 0.73.6、TypeScript、Jest、AsyncStorage、Kotlin Native Module、WebView、three@0.160.1（仅 APK 拷贝，禁止 CDN）。

**Spec:** `docs/superpowers/specs/2026-08-19-nono-avatar-asr-local-packs-design.md` 中角色 3D 部分。听写见独立计划 `docs/superpowers/plans/2026-08-20-nono-offline-asr.md`。

## Global Constraints

- 运行时 JS 只来自安装包，永不下载、永不走 jsDelivr / unpkg / cdnjs。
- 首页冷启动先渲染内置 3D，再尝试当前外观包；失败仍是 3D。
- 外观只允许 `manifest.json` + `model.glb`，目录多文件视为损坏。
- 外观包由用户点选后才下载，可走移动网络，有确认和进度；未点选不得预下载。
- 角色包不得写入 `@autoglm:models` / `@nono:models:*`。
- 本版不播骨骼动画；清单可带 `wave` / `nod` / `talk`，加载器忽略。
- 本版不做 iOS 外观下载。验收机：小米 9。
- 每项行为必须经历真实 RED → GREEN；禁止删断言获绿。

---

## File map

| 文件 | 职责 |
| --- | --- |
| `AwesomeProject/src/features/task/avatar/parseAvatarManifest.ts` | 清单校验 |
| `AwesomeProject/src/features/task/avatar/AvatarArtifactPins.ts` | 钉死的可下载外观 |
| `AwesomeProject/src/features/task/avatar/AvatarPackStore.ts` | activeId、安装、回滚 |
| `AwesomeProject/src/features/task/avatar/LocalPack.ts` | JS 封装 `LocalPackModule` |
| `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalPackModule.kt` | 下载、哈希、原子搬迁、file URI、网络类型、剩余空间 |
| `AwesomeProject/src/features/task/avatar/scene.js` | builtin 网格 + `loadGltf` / `useBuiltin` |
| `AwesomeProject/src/features/task/avatar/avatar.html` | 本地 ESM，无 CDN |
| `AwesomeProject/src/features/task/components/NonoAvatar3D.tsx` | 注入路径、收失败消息 |
| `AwesomeProject/src/features/settings/screens/AvatarLooksScreen.tsx` | 3D 预览 + 选角色 / 确认下载 |
| `AwesomeProject/android/app/build.gradle` | `copyNonoAvatarAssets` 增加 `three.module.js`、`GLTFLoader.js` |

---

### Task 1: AvatarManifest 校验

**Files:**
- Create: `AwesomeProject/src/features/task/avatar/parseAvatarManifest.ts`
- Test: `AwesomeProject/src/__tests__/features/task/avatar/parseAvatarManifest.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `parseAvatarManifest(raw: unknown, dirFiles: string[]): AvatarManifestV1`

- [ ] **Step 1: Write the failing test**

```ts
import {parseAvatarManifest} from '../../../features/task/avatar/parseAvatarManifest';

const valid = {
  schemaVersion: 1,
  id: 'box',
  version: '1',
  title: '测试盒',
  files: {
    model: {
      name: 'model.glb',
      bytes: 1664,
      sha256: 'ed52f7192b8311d700ac0ce80644e3852cd01537e4d62241b9acba023da3d54e',
    },
  },
  clips: {wave: 'Wave'},
};

describe('parseAvatarManifest', () => {
  it('accepts a v1 pack with only manifest files listed', () => {
    expect(parseAvatarManifest(valid, ['manifest.json', 'model.glb']).id).toBe(
      'box',
    );
  });

  it('rejects builtin as a downloadable id', () => {
    expect(() =>
      parseAvatarManifest({...valid, id: 'builtin'}, ['manifest.json', 'model.glb']),
    ).toThrow('invalid_id');
  });

  it('rejects extra files in the directory', () => {
    expect(() =>
      parseAvatarManifest(valid, ['manifest.json', 'model.glb', 'hack.js']),
    ).toThrow('extra_files');
  });

  it('rejects missing model.glb', () => {
    expect(() => parseAvatarManifest(valid, ['manifest.json'])).toThrow(
      'missing_model',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd AwesomeProject && npm test -- --testPathPattern=parseAvatarManifest.test.ts`

Expected: FAIL with `Cannot find module` or `parseAvatarManifest is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface AvatarManifestV1 {
  schemaVersion: 1;
  id: string;
  version: string;
  title: string;
  files: {
    model: {name: 'model.glb'; bytes: number; sha256: string};
  };
  clips: {wave?: string; nod?: string; talk?: string};
}

export function parseAvatarManifest(
  raw: unknown,
  dirFiles: string[],
): AvatarManifestV1 {
  const value = raw as AvatarManifestV1;
  if (!value || value.schemaVersion !== 1) {
    throw new Error('invalid_schema');
  }
  if (!value.id || value.id === 'builtin') {
    throw new Error('invalid_id');
  }
  if (value.files?.model?.name !== 'model.glb') {
    throw new Error('invalid_model');
  }
  const names = [...dirFiles].sort();
  const expected = ['manifest.json', 'model.glb'].sort();
  if (names.join() !== expected.join()) {
    if (!names.includes('model.glb')) {
      throw new Error('missing_model');
    }
    throw new Error('extra_files');
  }
  return value;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd AwesomeProject && npm test -- --testPathPattern=parseAvatarManifest.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/features/task/avatar/parseAvatarManifest.ts \
  AwesomeProject/src/__tests__/features/task/avatar/parseAvatarManifest.test.ts
git commit -m "$(cat <<'EOF'
feat: validate NoNo avatar pack manifests

Reject builtin ids and extra files so downloaded looks cannot ship JS.
EOF
)"
```

---

### Task 2: LocalPackModule（下载 / 哈希 / 路径）

**Files:**
- Create: `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalPackModule.kt`
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityPackage.kt` — 在 `createNativeModules` 的 list 中加入 `LocalPackModule(reactContext)`
- Create: `AwesomeProject/src/features/task/avatar/LocalPack.ts`
- Modify: `AwesomeProject/jest.setup.js` — NativeModules mock 增加 `LocalPackModule`
- Test: `AwesomeProject/src/__tests__/features/task/avatar/LocalPack.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:

```ts
export type PackKind = 'avatars' | 'asr';
export type NetworkKind = 'wifi' | 'cellular' | 'none' | 'unknown';

export interface LocalPackNative {
  getFreeBytes(): Promise<number>;
  getNetworkType(): Promise<NetworkKind>;
  listFiles(kind: PackKind, id: string): Promise<string[]>;
  getFileUri(kind: PackKind, id: string, fileName: string): Promise<string>;
  writeText(kind: PackKind, id: string, fileName: string, body: string): Promise<void>;
  deletePack(kind: PackKind, id: string): Promise<void>;
  installFromUrl(
    kind: PackKind,
    id: string,
    url: string,
    bytes: number,
    sha256: string,
    fileName: string,
  ): Promise<string>;
}
```

根目录固定为 `context.filesDir/nono/{kind}/{id}/`。`installFromUrl` 先写 `{id}.part`，校验 `bytes` 与小写 hex sha256 后原子 rename 为 `fileName`。失败删除 part，不留下半文件当成品。

- [ ] **Step 1: Write the failing test**

```ts
import {NativeModules} from 'react-native';
import {localPack} from '../../../features/task/avatar/LocalPack';

describe('localPack JS wrapper', () => {
  it('rejects empty sha256 before calling native', async () => {
    NativeModules.LocalPackModule = {
      installFromUrl: jest.fn(),
    };
    await expect(
      localPack.installFromUrl('avatars', 'box', 'https://example', 1, '', 'model.glb'),
    ).rejects.toThrow('invalid_sha256');
    expect(NativeModules.LocalPackModule.installFromUrl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd AwesomeProject && npm test -- --testPathPattern=LocalPack.test.ts`

Expected: FAIL module not found.

- [ ] **Step 3: Write JS wrapper + Kotlin module**

`LocalPack.ts` 在调用 native 前用 `/^[a-f0-9]{64}$/` 校验 sha256。

Kotlin 关键实现（完整写入 `LocalPackModule.kt`）：

```kotlin
override fun getName() = "LocalPackModule"

private fun root(kind: String, id: String): File {
    require(kind == "avatars" || kind == "asr")
    require(id.matches(Regex("^[a-z0-9._-]+$")))
    return File(reactApplicationContext.filesDir, "nono/$kind/$id")
}
```

`getNetworkType`：无网络 `none`；`NetworkCapabilities.TRANSPORT_WIFI` → `wifi`；`TRANSPORT_CELLULAR` → `cellular`；否则 `unknown`。不要把以太网当成 wifi。

`installFromUrl` 用 `HttpsURLConnection`，禁止明文 HTTP。下载后 `MessageDigest.getInstance("SHA-256")` 比对。

`writeText` 只允许 `manifest.json` 或 `tokens.txt` 这类已存在 pack 目录内的文本文件名（`^[A-Za-z0-9._-]+$`），禁止 `..`。

把 `LocalPackModule` 加进 `AccessibilityPackage.createNativeModules`。

`jest.setup.js` 的 NativeModules mock 增加空对象 `LocalPackModule: {}`。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd AwesomeProject && npm test -- --testPathPattern=LocalPack.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalPackModule.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityPackage.kt \
  AwesomeProject/src/features/task/avatar/LocalPack.ts \
  AwesomeProject/jest.setup.js \
  AwesomeProject/src/__tests__/features/task/avatar/LocalPack.test.ts
git commit -m "$(cat <<'EOF'
feat: add hashed local pack installer

Store avatar and ASR files under app-private nono dirs with sha256 checks.
EOF
)"
```

---

### Task 3: AvatarPackStore

**Files:**
- Create: `AwesomeProject/src/features/task/avatar/AvatarArtifactPins.ts`
- Create: `AwesomeProject/src/features/task/avatar/AvatarPackStore.ts`
- Modify: `AwesomeProject/src/shared/constants/storage.config.ts` — 增加 `AVATAR_ACTIVE: '@nono:avatar_active'`
- Test: `AwesomeProject/src/__tests__/features/task/avatar/AvatarPackStore.test.ts`

**Interfaces:**
- Consumes: `parseAvatarManifest`, `localPack`, `STORAGE_KEYS.AVATAR_ACTIVE`
- Produces:

```ts
export const BUILTIN_AVATAR_ID = 'builtin';
export function listAvatarLooks(): AvatarLookItem[];
export async function getActiveAvatarId(): Promise<string>;
export async function setActiveAvatarId(id: string): Promise<void>;
export async function installPinnedAvatar(id: string): Promise<void>;
export async function rollbackAvatarToBuiltin(): Promise<void>;
export async function resolveAvatarGltfUri(): Promise<string | null>;
```

钉死的首个外观（数据文件，不是 JS）：

```ts
export const AVATAR_PINS = [
  {
    id: 'box',
    version: '1',
    title: '测试盒',
    url: 'https://github.com/KhronosGroup/glTF-Sample-Models/raw/main/2.0/Box/glTF-Binary/Box.glb',
    bytes: 1664,
    sha256: 'ed52f7192b8311d700ac0ce80644e3852cd01537e4d62241b9acba023da3d54e',
  },
] as const;
```

`listAvatarLooks` 永远把 `{id:'builtin', title:'默认角色', installed:true}` 放第一项。

- [ ] **Step 1: Write the failing test**

Mock `localPack` 与 AsyncStorage。覆盖：

1. 默认 `getActiveAvatarId()` 为 `builtin`。
2. `installPinnedAvatar('box')` 调用 `installFromUrl('avatars','box', url, 1664, sha, 'model.glb')`，再 `writeText(..., 'manifest.json', ...)`。
3. 目录出现 `hack.js` 时 `resolveAvatarGltfUri` 返回 `null` 且 `activeId` 变 `builtin`、调用 `deletePack`。
4. `installPinnedAvatar('nope')` throw `unknown_pin`。
5. `setActiveAvatarId('box')` 在未安装时 throw `not_installed`。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd AwesomeProject && npm test -- --testPathPattern=AvatarPackStore.test.ts`

Expected: FAIL module not found.

- [ ] **Step 3: Write store**

`installPinnedAvatar`：找 pin → `installFromUrl` → `writeText` manifest → `parseAvatarManifest`（`listFiles`）→ 失败则 `deletePack` 且不要写 activeId。

`resolveAvatarGltfUri`：`builtin` 或校验失败 → `rollbackAvatarToBuiltin()` → `null`。成功 → `getFileUri('avatars', id, 'model.glb')`。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd AwesomeProject && npm test -- --testPathPattern=AvatarPackStore.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/features/task/avatar/AvatarArtifactPins.ts \
  AwesomeProject/src/features/task/avatar/AvatarPackStore.ts \
  AwesomeProject/src/shared/constants/storage.config.ts \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalPackModule.kt \
  AwesomeProject/src/features/task/avatar/LocalPack.ts \
  AwesomeProject/src/__tests__/features/task/avatar/AvatarPackStore.test.ts
git commit -m "$(cat <<'EOF'
feat: store downloaded avatar looks with builtin rollback

Keep activeId on builtin whenever the glb directory fails validation.
EOF
)"
```

---

### Task 4: WebView `loadGltf` / `useBuiltin`

**Files:**
- Create: `AwesomeProject/scripts/vendor-gltf-loader.js` — 把 `node_modules/three/examples/jsm/loaders/GLTFLoader.js` 里的 `from 'three'` 改成 `from './three.module.js'`，写到 `src/features/task/avatar/GLTFLoader.js`
- Modify: `AwesomeProject/package.json` `postinstall` 在现有 `copy-nono-avatar-vendor.js` 之后追加 `&& node scripts/vendor-gltf-loader.js`
- Modify: `AwesomeProject/android/app/build.gradle` `copyNonoAvatarAssets`：

```gradle
from("${rootProject.projectDir}/../src/features/task/avatar") {
    include 'avatar.html', 'scene.js', 'GLTFLoader.js'
}
from("${rootProject.projectDir}/../node_modules/three/build") {
    include 'three.module.js', 'three.min.js'
}
```

- Modify: `AwesomeProject/src/features/task/avatar/avatar.html` — 去掉对 `three.min.js` 的依赖（可保留文件拷贝作备用，页面不再引用），改为：

```html
<script type="module" src="scene.js"></script>
```

- Modify: `AwesomeProject/src/features/task/avatar/scene.js` — 改为 ESM，顶部：

```js
import * as THREE from './three.module.js';
import {GLTFLoader} from './GLTFLoader.js';
```

在现有 `window.NonoAvatar` 上增加：

```js
var packedRoot = null;
function useBuiltin() {
  if (packedRoot) {
    root.remove(packedRoot);
    packedRoot = null;
  }
  body.visible = true;
  leftEar.visible = true;
  rightEar.visible = true;
  visor.visible = true;
  eyes.visible = true;
  light.visible = true;
  shadow.visible = true;
}
function loadGltf(fileUrl) {
  var loader = new GLTFLoader();
  loader.load(
    fileUrl,
    function (gltf) {
      useBuiltin();
      body.visible = false;
      leftEar.visible = false;
      rightEar.visible = false;
      visor.visible = false;
      eyes.visible = false;
      light.visible = false;
      packedRoot = gltf.scene;
      packedRoot.scale.setScalar(0.9);
      root.add(packedRoot);
    },
    undefined,
    function () {
      useBuiltin();
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({type: 'avatar-load-failed'}),
        );
      }
    },
  );
}
window.NonoAvatar.useBuiltin = useBuiltin;
window.NonoAvatar.loadGltf = loadGltf;
```

mood/look 仍作用在 `root` 上，glb 会跟着呼吸和转头。本版不播放 `gltf.animations`。

- [ ] **Step 1: Write a Node assertion for the vendor script**

Create `AwesomeProject/scripts/__tests__/vendor-gltf-loader.test.js`（若现有 Jest 不跑 `scripts/`，把测试放到 `src/__tests__/features/task/avatar/vendorGltfLoader.test.ts`，用 `fs` 读生成文件）。测试：生成文件包含 `from './three.module.js'` 且不包含 `cdn.jsdelivr`。先不跑脚本，断言失败。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd AwesomeProject && npm test -- --testPathPattern=vendorGltfLoader.test.ts`

Expected: FAIL file missing.

- [ ] **Step 3: Implement vendor script + scene/html/gradle**

运行 `node scripts/vendor-gltf-loader.js` 生成 `GLTFLoader.js`。`GLTFLoader.js` 很大，提交生成文件，以便没执行 postinstall 的构建也能打包。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd AwesomeProject && npm test -- --testPathPattern=vendorGltfLoader.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/scripts/vendor-gltf-loader.js \
  AwesomeProject/src/features/task/avatar/GLTFLoader.js \
  AwesomeProject/src/features/task/avatar/avatar.html \
  AwesomeProject/src/features/task/avatar/scene.js \
  AwesomeProject/android/app/build.gradle \
  AwesomeProject/package.json \
  AwesomeProject/src/__tests__/features/task/avatar/vendorGltfLoader.test.ts
git commit -m "$(cat <<'EOF'
feat: load local glTF inside the bundled avatar runtime

Keep Three.js and GLTFLoader in the APK so looks never hit a CDN.
EOF
)"
```

---

### Task 5: NonoAvatar3D 接 active pack

**Files:**
- Modify: `AwesomeProject/src/features/task/components/NonoAvatar3D.tsx`
- Modify: `AwesomeProject/src/features/task/screens/HomeScreen.tsx` — 把 `gltfUri` 传给头像
- Test: `AwesomeProject/src/__tests__/features/task/avatar/NonoAvatar3D.test.tsx`

**Interfaces:**
- Consumes: `resolveAvatarGltfUri`, `rollbackAvatarToBuiltin`
- Produces: `NonoAvatar3D` props `{mood: NoNoMood; gltfUri: string | null}`

- [ ] **Step 1: Write the failing test**

用 `@testing-library/react-native` mock `react-native-webview` 为能收到 `injectJavaScript` 的假组件。断言：

1. `gltfUri` 为 null 时 `onLoadEnd` 注入包含 `useBuiltin()`，不含 `loadGltf`。
2. `gltfUri` 为 `file:///.../model.glb` 时注入 `loadGltf("file:///.../model.glb")`。
3. `onMessage` 收到 `{"type":"avatar-load-failed"}` 时调用传入的 `onGltfFailed`。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd AwesomeProject && npm test -- --testPathPattern=NonoAvatar3D.test.tsx`

Expected: FAIL

- [ ] **Step 3: Implement**

`onLoadEnd` 顺序：`setLayout('stage'); setMood(...);` 然后 `gltfUri ? loadGltf(JSON.stringify(uri)) : useBuiltin()`。

HomeScreen `useFocusEffect` 调用 `resolveAvatarGltfUri()`。`onGltfFailed` → `rollbackAvatarToBuiltin()` → 把 state 里的 uri 清空。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd AwesomeProject && npm test -- --testPathPattern=NonoAvatar3D.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/features/task/components/NonoAvatar3D.tsx \
  AwesomeProject/src/features/task/screens/HomeScreen.tsx \
  AwesomeProject/src/__tests__/features/task/avatar/NonoAvatar3D.test.tsx
git commit -m "$(cat <<'EOF'
feat: apply the active avatar look after the builtin mesh paints

Rollback to builtin when the WebView reports a glTF load failure.
EOF
)"
```

---

### Task 6: 角色外观预览页

**Files:**
- Create: `AwesomeProject/src/features/settings/screens/AvatarLooksScreen.tsx`
- Modify: `AwesomeProject/src/shared/types/navigation.ts` — `AvatarLooks: undefined`
- Modify: `AwesomeProject/src/navigation/AppNavigator.tsx` — 注册 `AvatarLooks`
- Modify: `AwesomeProject/src/features/settings/screens/SettingsScreen.tsx` — 在「陪伴」分组里、对话模型那一行**下面**增加「角色外观」；文案不得写成陪伴模型
- Test: `AwesomeProject/src/__tests__/features/task/avatar/AvatarLooksScreen.test.tsx`

**Interfaces:**
- Consumes: `listAvatarLooks`, `installPinnedAvatar`, `setActiveAvatarId`, `localPack.getNetworkType`, `NonoAvatar3D`
- Produces: 用户确认后再下载

页面结构：上半 `NonoAvatar3D`（未下载项预览 builtin，不发起下载）；下半横向卡片，`builtin` 第一项无下载按钮。

- [ ] **Step 1: Write the failing test**

渲染屏幕（mock store）。设置页源码（`fs.readFileSync` SettingsScreen）含 `角色外观` 且该行在 `CompanionConfig` 导航之后。点「测试盒」在 wifi/cellular 都应先出现确认。未确认前 `installPinnedAvatar` 不被调用。确认后被调用。`builtin` 卡没有下载按钮。屏幕含预览区域（`NonoAvatar3D` 或 testID `avatar-look-preview`）。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd AwesomeProject && npm test -- --testPathPattern=AvatarLooksScreen.test.tsx`

Expected: FAIL

- [ ] **Step 3: Implement screen**

`SettingsScreen` 新行：label `角色外观`，description `只换首页角色长什么样，不改说话用的模型`，`navigate('AvatarLooks')`。

确认框文案必须带网络类型与 `bytes`。进度：下载中显示「正在下载」，不要静默。失败 Alert「外观不可用，仍用默认角色」，预览回到 builtin，不要改其它包。

不要在首页顶栏、能力 Tab、底栏增加入口。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd AwesomeProject && npm test -- --testPathPattern=AvatarLooksScreen.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/features/settings/screens/AvatarLooksScreen.tsx \
  AwesomeProject/src/shared/types/navigation.ts \
  AwesomeProject/src/navigation/AppNavigator.tsx \
  AwesomeProject/src/features/settings/screens/SettingsScreen.tsx \
  AwesomeProject/src/__tests__/features/task/avatar/AvatarLooksScreen.test.tsx
git commit -m "$(cat <<'EOF'
feat: let users opt in to download avatar looks

Require confirmation on Wi-Fi and cellular so looks never silent-fetch.
EOF
)"
```

---

### Task 7: 小米 9 验收

**Files:** 无新生产文件。记录命令与期望。

- [ ] **Step 1: 重装 debug 包**

```bash
export JAVA_HOME="/Users/a/.gradle/jdks/jetbrains_s_r_o_-21-aarch64-os_x.2/jbrsdk_jcef-21.0.10-osx-aarch64-b1163.108/Contents/Home"
export ANDROID_HOME=/Users/a/Library/Android/sdk
export GRADLE_USER_HOME=/Users/a/.gradle
adb -s c99afdd6 reverse tcp:8081 tcp:8081
cd AwesomeProject
node ./node_modules/@react-native-community/cli/build/bin.js run-android --deviceId=c99afdd6 --no-packager
```

Expected: `BUILD SUCCESSFUL`，首页立体默认角色。

- [ ] **Step 2: 断网冷启动**

飞行模式杀进程再开。Expected: 仍是 3D 默认角色。`adb -s c99afdd6 logcat -d | grep -iE 'jsdelivr|unpkg|cdnjs'` 无匹配。

- [ ] **Step 3: 下载测试盒**

恢复网络，设置 → 角色外观 → 测试盒 → 确认。Expected: 有进度，成功后首页变成盒子网格；失败则仍是默认角色。

- [ ] **Step 4: 损坏回滚**

```bash
adb -s c99afdd6 shell run-as com.awesomeproject \
  sh -c 'echo x >> files/nono/avatars/box/model.glb'
```

杀进程再开。Expected: 默认 3D，不是白屏。

- [ ] **Step 5: Commit 仅当有修复**

无代码改动则不空提交。若有 bugfix，单独 commit `fix: ...`。
