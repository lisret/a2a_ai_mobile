# Independent native review — Android LAN MCP service

- Scope: `android/app/src/main/java/com/awesomeproject/lanmcp/**`, `bridge/LanMcpModule.kt`, `service/TaskExecutionService.kt` edits, manifest / package / dependency wiring, focused native tests, and the production JS ownership integration (`LocalDeviceControlLease.ts`, `RuntimeApplicationPorts.ts`) plus the JS connection guide.
- Plan: `docs/superpowers/plans/2026-10-10-lan-mcp-service.md`.
- Revised: focused recheck after source freeze (2026-10-10 **18:08**, files last written 18:08:19–18:08:22). Root's `NanoHttpdAsyncRunner` typo fix is not a finding.
- Method: source reading + cross-check of the NanoHTTPD 2.3.1 adapter against the real 2.3.1 source (`https://cdn.jsdelivr.net/gh/NanoHttpd/nanohttpd@nanohttpd-project-2.3.1/core/src/main/java/fi/iki/elonen/NanoHTTPD.java`). **I did not run Gradle, any test, or any device/keystore operation.** Reported build/test evidence is attributed, not reproduced.

## Verdict

- **Source verdict: PASS** for the reviewed native + JS-integration scope. The two earlier MEDIUM findings (M1, M2) are resolved in the frozen source; no CRITICAL/HIGH source defect remains. Remaining items are LOW / device-verification notes.
- **Device signoff: PENDING.** Device selection is explicitly outstanding. Missing device coverage is not a source deficiency and is not counted against the source verdict.

Traceability of the frozen snapshot (md5 prefix): `DeviceControlOwnership.kt 914279e9`, `LanMcpService.kt f8d15574`, `LanMcpState.kt 021684b7`, `LanMcpModule.kt 5ba22489`, `TaskExecutionService.kt 6e5c164e`, `LocalDeviceControlLease.ts fc400c86`, `RuntimeApplicationPorts.ts d9b15c50`.

## Recheck of the two prior findings

### M1 — CLOSED. Local↔remote control is arbitrated by one mutex, end to end.

- The modern JS local path acquires the **same** mutex as MCP before doing any work: `RuntimeApplicationPorts.ts:183` calls `acquireLocalDeviceControl(newId('device-owner'))` before `startWithDeviceControl` (config/planning), and releases on blocked (`:192`), on error (`:195`) and unconditionally in the drive chain's `.finally(release)` (`:247`); `LocalDeviceControlLease.ts:15-21` maps that to `LanMcpModule.acquireLocalControl/releaseLocalControl` (`LanMcpModule.kt:69-80`) → `DeviceControlOwnership.acquireLocal/releaseLocal`. MCP takes `DeviceControlOwnership.acquireRemote()` at `LanMcpService.kt:88`. One mutex, so exactly one winner.
- The legacy path no longer keys off the late `LanMcpState.running`: `TaskExecutionService.kt:79` now gates on `DeviceControlOwnership.remoteActive()` (the reservation, set at `LanMcpService.kt:88`, before any keystore/Wi-Fi/bind work).
- The residual service-first window is closed by main-thread serialization: neither manifest service declares `android:process`, so both `onStartCommand`s run serially on the app main thread. MCP-first sets `remote` before yielding; task-first sets `LanMcpLocalTask` (`TaskExecutionService.kt:140`) before yielding, and MCP's `LanMcpLocalTask.isRunning()` check at `LanMcpService.kt:88` then refuses. `TaskExecutionService` correctly does *not* acquire a second local lease; `LanMcpLocalTask` is only the supplemental legacy companion flag.
- Tool-time defense remains: `localTaskRunning = { LanMcpLocalTask.isRunning() || DeviceControlOwnership.localActive() }` (`LanMcpService.kt:117` → `ToolExecutor.kt:188-193`).

### M2 — CLOSED. `stopService` no longer resolves before ownership is released.

- `LanMcpModule.kt:158-163` now waits while **both** `LanMcpState.running || DeviceControlOwnership.remoteActive()` up to `STOP_TIMEOUT_MS = 5000L` (`:391`), and only then resolves; otherwise it rejects with "服务正在关闭，请稍后确认状态".
- The native status explains the drain: `LanMcpState.kt:60-62` reports `"正在停止，等待已受理动作结束。"` while `!running && remoteActive()`.
- The drain is bounded: `ToolCatalog.MAX_DURATION_MS = 2000`, and the gesture waiter holds the action slot across HTTP-worker interruption until the platform callback or `duration + 1000 ms` (`AccessibilityDeviceActions.kt:148-160`), so the release thread (`LanMcpService.kt:199-206`) unblocks within ~3 s for gestures.
- Residual (acceptable, not a defect): if an accepted capture's PNG encode pushes the drain past 5 s, `stopService` rejects rather than lying; JS keeps the busy state until the promise settles, and a later `getStatus` shows the drain message. Only a slow device with a large frame should ever hit it.

## Remaining LOW / device-verification notes

- **Wi-Fi interface choice** `LanNetwork.kt:26-50`: selection is "lexicographically smallest private Wi-Fi IPv4" (`candidates.sortBy { it.address }.firstOrNull()`). On devices with STA+AP concurrency the phone's own hotspot interface (also `TRANSPORT_WIFI`) can win over the trusted Wi-Fi client address. Prefer a network with `NET_CAPABILITY_INTERNET`/`VALIDATED` when present; verify on device.
- **Screenshot rate limit** `AccessibilityDeviceActions.kt:90-125` / `ToolExecutor.kt:96-97`: `takeScreenshot`'s system minimum interval surfaces as generic `E_SCREENSHOT_FAILED` with no retry hint. Optional: map the rate-limit failure to a distinct code/hint. (Separately, `ScreenshotHandler` can drop a wrapped hardware bitmap unrecycled when capture is interrupted by stop — pre-existing, not introduced here.)
- **Small coverage gap**: `DeviceControlOwnership.remoteActive()` is exercised only indirectly; `DeviceControlOwnershipTest` asserts `acquireLocal/acquireRemote/release` but never `remoteActive()`/`localActive()` transitions. Cheap to add; not a behavior risk.
- **TaskExecutionService failure path** (`TaskExecutionService.kt:126-140`): the flag is set even if `startForeground` throws. This is now correctly documented as intentional ("本地任务仍可能执行…保守地保留占用标记直到服务销毁"); with the JS lease as the real gate it can only over-block briefly. Not a defect.

## Corrections to the previous revision

- **SAF export (`LanMcpModule.kt:223-283`) is not a defect.** The save dialog is expected user interaction, and `invalidate()` (`:309-326`) resets `exportBusy` and resolves `cancelled`; an activity recreate still delivers the result through `ActivityEventListener`. No arbitrary timer should cancel the user's selection.
- **The failure notification is fixed.** `LanMcpService.onDestroy` explicitly cancels it (`LanMcpService.kt:216`), covering the never-foregrounded `E_FOREGROUND_FAILED` path.
- **minSdk-21 compatibility is handled in the reviewed module.** Every `getSystemService` call in `lanmcp/` uses the String-constant API (`LanMcpService.kt:216,247,258,336,402`); the typed `getSystemService(Class)` API (API 23+) is not used there. The typed API remains only in pre-existing out-of-scope files.
- **Device coverage pending ≠ unimplemented.** The prior "FAIL" framing is withdrawn; the source verdict is PASS and device signoff is a separate, explicitly pending gate.

## Independently verified as correct (source-level evidence, unchanged)

- **Socket adapter / early-reject framing (NanoHTTPD 2.3.1 cross-check):** `HTTPSession.execute()` lowercases header names (so `headers["host"]`, `"content-length"`, `"authorization"`, `"mcp-protocol-version"` lookups work) and does `inputStream.reset(); skip(splitbyte)` after header parsing, so `session.inputStream` yields the body from byte 0. A reply with `Connection: close` (`LanMcpServer.kt:106-108`) makes `execute()` throw `SocketException("NanoHttpd Shutdown")`, which `ClientHandler.run()` treats as a normal close, so an early refusal's unread body is never re-parsed as a pipelined request. (`LanMcpServer.kt:61-91`, `LanMcpHttpRouter.kt:117-150,236-245`.)
- **Caps:** 64 KiB body cap (`HttpGate.kt:20`); strict Content-Length; `chunked`/invalid refused before any read (`HttpGate.kt:71-86`, `LanMcpHttpRouter.kt:191-211`); exact read with `incomplete` detection (`LanMcpServer.kt:144-183`); oversized declared bodies never drained (`:158-159`); return 429 rather than queueing (`LanMcpHttpRouter.kt:131-138`); queue-free bounded socket runner (`BoundedRequestRunner.kt:52-80`).
- **Auth:** constant-time over SHA-256 (`BearerAuth.kt:54-64`), minSdk-21-safe `ThreadLocal` subclass (`:28-30`), missing/malformed/whitespace tokens handled, no code in any reply body.
- **Host/Origin:** exact `address:port` Host pinning, any `Origin` refused, no CORS header ever emitted (`HttpGate.kt:30-41`, `LanMcpHttpRouter.kt:156-173`), `Allow: POST` on 405.
- **MCP conformance:** `initialize` negotiates down instead of failing (`McpProtocol.kt:82-104`), notifications → 202 empty and never executed (`:64-65`), batches refused (`:40-42`), unknown method → -32601, tool errors ride HTTP 200 with `isError` (`:106-127`); pinned 2025-11-25, older Streamable revisions echoed, pre-Streamable 2024-11-05 deliberately not claimed (`McpVersions.kt`).
- **Stop/dispatch race:** `markStopped` increments the generation even when the boundary is busy (`StopGeneration.kt:46-64`); `runIfCurrent` holds the boundary across dispatch (`:78-86`); `REVOKE_WAIT_MILLIS = 0` keeps `onDestroy` off any main-thread wait while the drain thread preserves ownership; a revoke during capture discards the frame (`ToolExecutor.kt:98-104`).
- **Serialization & guards:** one slot for gestures *and* captures (`ToolExecutor.kt:228-244`); locked / accessibility / busy guards (`:181-207`); typed text never echoed, length only (`:165`); `ACTION_SET_TEXT` instead of the clipboard/plaintext-logging helper (`AccessibilityDeviceActions.kt:179-212`).
- **Secrets / logs / export:** no log carries the code, a request body, or typed text; status exposes only `codeConfigured`; code cannot change while running (`LanMcpModule.kt:183`); `ExportPolicy` refuses contents containing the live code and sanitizes the filename (`ExportPolicy.kt:23-64`); the JS guide takes no code parameter and `ConnectionGuide.test.ts:13` asserts non-leakage.
- **Lifecycle:** `START_NOT_STICKY`, no boot receiver, notification Stop action, Wi-Fi interface/address change stops the service (`LanMcpService.kt:66-72,164-172,309-319`), `bindAddress`/`endpoint` cleared and code bytes wiped on stop (`:232-242`).
- **Wiring:** service `exported=false` + `foregroundServiceType="specialUse"` with the matching `FOREGROUND_SERVICE_SPECIAL_USE` permission; `nanohttpd:2.3.1`; `LanMcpModule` registered in `AccessibilityPackage`.

## Evidence and test status

- **Reported by the implementation/root side (not reproduced by me):** real Gradle `assembleDebug` success; 155 JUnit tests, 0 failures, including real TCP HTTP against the router with fake actions; 29 JS tests + `tsc` + web build pass. Root will rerun Gradle for the 18:08 final edits — the source verdict above is conditional on that rerun succeeding, since the last writes (18:08:19–22) postdate the recorded run.
- **What the tests still cannot cover, and device signoff must:** Android framework behavior of `LanMcpService` (foreground notification, `NetworkCallback` revalidation, every `failStart` code, Stop-from-notification, ownership drain), `LanMcpModule` (start/stop polling, SAF export, keystore error mapping), `AccessibilityDeviceActions` (the hand-rolled gesture waiter, HARDWARE-bitmap capture, keyguard fail-closed, `ACTION_SET_TEXT`), `LanNetwork.privateWifiBinding` interface choice, and the two-service serialization argument. `LanMcpServerIntegrationTest` covers real loopback TCP with the fake device but not TCP-level early-gate framing, keep-alive reuse, chunked/oversized bodies, or socket-level concurrency.
- All native tests drive `FakeDeviceActions`; they are policy proof, not device proof.

## Out-of-scope collateral in the same uncommitted change

`commons-compress:1.26.2` (used only by `LocalPackModule.kt`), the `copyNonoAvatarAssets` source change, and `gradlew` mode 644→755 are unrelated to LAN MCP; confirm intent so this change can be reviewed/reverted independently.

## Assumptions / limits

- Reviewed the frozen working tree at the hashes above; no further writes expected.
- Device selection is pending, so every Android-framework statement above is source-reasoned, not observed.
- I did not open the keystore, read credentials, or run Gradle/tests.
