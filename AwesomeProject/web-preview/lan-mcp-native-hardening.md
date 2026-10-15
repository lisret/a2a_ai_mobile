# LAN MCP native hardening

Scope: fixes in `AwesomeProject/android/app/src/main/java/com/awesomeproject/lanmcp/*.kt`,
`android/app/src/test/java/com/awesomeproject/lanmcp/*` (JVM tests) and
`android/app/src/main/java/com/awesomeproject/service/TaskExecutionService.kt` only.
`bridge/LanMcpModule.kt` was not touched. No Gradle run, no stage edits, no installs/caches.

---

## 1. `LanMcpLocalTask` is now wired to the real local task lifecycle

* `TaskExecutionService.kt`
  * sets `LanMcpLocalTask.setRunning(true)` only after the foreground notification path
    completes without throwing (so a failed foreground start never claims device ownership),
    and `setRunning(false)` in `onDestroy`;
  * refuses to start a **new** local task while `LanMcpState.running`, reusing the existing
    exact-identity `NonoTaskCancelRequestedV1` event so JS aborts the task — no new API;
  * a repeated `startService` for the **same** `{taskId, sessionRevision}` is still allowed,
    because that is the `ServiceManager.updateTaskExecutionService` path and refusing it would
    wrongly cancel the running task;
  * when the service is already serving another task it refuses the new one *without*
    `stopSelf()`, so a running task is never torn down by a foreign request.
* Tools: `ToolExecutor.guardDeviceAccess` refuses **every** device-touching tool —
  `phone_screenshot` included — with `E_TASK_RUNNING` while the flag is set. `phone_status`
  stays available and now reports `localTaskRunning` (alongside `deviceLocked`).
* Direction covered: MCP→local (tools refused) and local→MCP (new task refused while MCP runs),
  so the two controllers cannot drive the UI simultaneously.
* Residual (needs files outside my scope): `AccessibilityModule.startTaskExecutionService` cannot
  observe the refusal (it only knows the `startForegroundService` call did not throw), so the
  headless task service may still start; the task is then aborted by the cancel event.

## 2. Screenshot: locked-device refusal, capture/action serialization, fail-closed keyguard

* `ToolExecutor.screenshot` now goes through `guardDeviceAccess` (accessibility **and**
  unlocked, fail-fast) and through the single action slot, so a screenshot is refused with
  `E_TASK_RUNNING` while another capture or gesture is in flight instead of stacking
  full-resolution bitmaps. A frame produced after revocation is discarded.
* `AccessibilityDeviceActions.isDeviceLocked()` is fail-closed: a missing `KeyguardManager`
  or a throwing probe reports **locked**, so capture/gestures are refused rather than allowed.
* `ActionSerializer` docs updated: it is the device-operation slot for gestures *and* captures.

## 3. Stop/dispatch race

`StopGeneration` now owns the dispatch boundary:

* `runIfCurrent(captured, refused, body)` holds a `ReentrantLock` for the whole platform call
  (dispatch **and** callback wait) and re-checks the generation inside it, so a stop cannot
  interleave between the check and `dispatchGesture`.
* `markStopped(waitMillis = 0)` sets `running = false` *first* (no new dispatch can start),
  then waits at the boundary for an in-flight dispatch and bumps the generation. Returns
  `false` when the bounded wait expired — i.e. a gesture was already posted and therefore
  cannot be recalled. `LanMcpService.onDestroy` uses a bounded 400 ms wait and logs that fact
  instead of claiming a revocation; the main thread is never blocked on a long swipe.
* `ToolExecutor` dispatches only through `runIfCurrent`; results stay honest (a dispatched
  gesture reports `dispatched: true`, `reversible: false`), and everything after a stop is
  refused with `E_SERVICE_STOPPED` before touching the device.
* `GestureHandler` (untouched) blocks on a `CountDownLatch` per gesture; MCP calls it from the
  NanoHTTPD worker thread, never from the main thread. `ScreenshotHandler` posts
  `takeScreenshot` to the main looper and the *wait* still happens on the MCP worker.
* `markStopped()` now returns `Boolean` instead of `Long`; the two statement-position call
  sites in the root-owned module still compile.

## 4. Text input without plaintext logging or clipboard use

`AccessibilityDeviceActions.typeText` no longer calls
`AutoGLMAccessibilityService.performTextInput` (which logs the plaintext and writes it to the
clipboard). It performs `ACTION_SET_TEXT` with
`ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE` on the focused **editable** node only, logs nothing
about the content (only "no focused input node"/"not editable"/exception class), and never
touches the clipboard. The in-app path in `AutoGLMAccessibilityService` is unchanged.
Tool payloads report only `characters: N`; no failure message echoes the text.

## 5. Bounded socket runner + early gate before the body read

* New `BoundedRequestRunner<T>`: `ThreadPoolExecutor(0, limit, SynchronousQueue, AbortPolicy)`
  — no queue at all, at most `limit` handlers, and a rejected hand-off returns `false` so the
  adapter **closes the socket immediately** instead of queueing it.
  `LanMcpServer` installs it as NanoHTTPD's `AsyncRunner` (`setAsyncRunner` before `start()`)
  with `DEFAULT_MAX_CONNECTIONS = 8`; `stopServer()` also shuts the runner down and closes
  in-flight handlers.
* Early gate: `LanMcpHttpRouter.preflight()` (`cheapRefusal`) decides everything that does not
  need the body — running, Origin, Host, path, method, Content-Type, Accept, Transfer-Encoding,
  Content-Length validity, declared size, Bearer auth, `MCP-Protocol-Version`. `LanMcpServer`
  builds a headers-only `HttpRequestInfo` (`HttpBodyRead.headersOnly`) and only reads the body
  when the gate passes; `handle()` re-runs the same gate, so there is one source of truth.
  Consequence: unauthorised/oversized/forbidden requests cost no body read, no capture budget
  and no concurrency slot.
* Because an early refusal leaves the body unread, **every** gate refusal now sends
  `Connection: close` (otherwise leftover bytes would be parsed as a pipelined request). A
  client still streaming a large body may therefore see a reset — intended fail-closed
  behaviour, and the socket bound (8 × 64 KiB) keeps the worst case small.

## 6. Fail-closed startup

`LanMcpService.onStartCommand` now:

* aborts if `startForeground` throws (`E_FOREGROUND_FAILED`) instead of silently continuing;
* aborts with `E_NETWORK_MONITOR_FAILED` when `registerNetworkCallback` throws, tearing the
  already-bound server down first (no running endpoint without Wi-Fi change protection);
* re-validates that the bound private Wi-Fi address is still current after monitoring starts
  (`E_NETWORK_CHANGED` otherwise) and publishes `running = true` only after all of that;
* tears down socket + monitor + code bytes on every failure path via one `teardown()` helper.
* New codes: `E_FOREGROUND_FAILED`, `E_NETWORK_MONITOR_FAILED`, `E_NETWORK_CHANGED`
  (`LanMcpState.lastErrorCode` is what the module rejects with, so no module change is needed).

## 7. `initialize` negotiates instead of rejecting

* `McpVersions.SUPPORTED` is now exactly `2025-11-25`, `2025-06-18`, `2025-03-26`; the
  pre-Streamable-HTTP `2024-11-05` is **not** claimed because its transport is not implemented.
* `negotiate()` is total: a supported revision is echoed, anything else (newer or older,
  including `2024-11-05` and empty/null) negotiates to `2025-11-25` with HTTP 200. Only a
  non-string `protocolVersion` remains `-32602`. The `MCP-Protocol-Version` **header** check is
  unchanged (unsupported → 400, per the spec).

## 8. Additional minSdk-21 hardening (found while wiring the above)

* `BearerAuth` used `ThreadLocal.withInitial` (API 26+) on the auth path — every
  authenticated request would have thrown `NoSuchMethodError` on API 21–25. Replaced with a
  `ThreadLocal<MessageDigest>` subclass (`initialValue()` override).
* `BoundedRequestRunner` used `ConcurrentHashMap.newKeySet()` (API 24+). Replaced with
  `Collections.newSetFromMap(ConcurrentHashMap())` (API 9).
* `LanMcpService` now releases a partially bound socket in the bind-failure paths
  (`releaseCandidate`) before reporting `E_PORT_IN_USE` / `E_BIND_FAILED`.
* Note: `getSystemService(Class)` (API 23+) is used here exactly as the pre-existing
  `TaskExecutionService` already does, so the effective floor is unchanged by this work.

---

## Tests added / updated (JVM, no Android)

| File | Covers |
| --- | --- |
| `McpVersionsTest.kt` *(new)* | claimed set, echo, negotiation of newer/`2024-11-05`/null/blank |
| `DispatchBoundaryTest.kt` *(new)* | stop with a free boundary, revocation, stop waits for an in-flight dispatch, expired wait still revokes, queued dispatcher refused after stop, restart/stale generation |
| `ToolExecutorSafetyTest.kt` *(new)* | locked screenshot refusal, locked mutations, capture↔action mutual exclusion, slot release, local-task refusal for screenshot, `localTaskRunning` in status, text never echoed, honest mid-dispatch stop, frame discarded after stop |
| `BoundedRequestRunnerTest.kt` *(new)* | at most `limit` handlers, rejection without queueing, re-admission after release, `shutdown` closes in-flight tasks and stops accepting, non-positive limit |
| `LanMcpPreflightTest.kt` *(new)* | gate uses the real method/path, every header-decidable refusal, oversized declared body refused with nothing read, `Connection: close` on every gate refusal, keep-alive on success, `handle()` re-runs the gate, `headersOnly` view |
| `McpProtocolTest.kt` *(updated)* | unsupported newer revision negotiates, `2024-11-05` negotiates, every claimed revision echoed |
| `FakeDeviceActions.kt` *(updated)* | `onTap`/`onCapture` hooks for mid-dispatch stop simulation |

Local verification (temp harness outside the repo, deleted afterwards; Kotlin 2.3.10 + a
Java-shape `org.junit` stub, since the sandbox has no Gradle):

```
compile_exit=0   (15 core files + 16 test files; the NanoHTTPD integration test excluded locally)
TEST_CLASSES=18  TESTS_PASSED=152  TESTS_FAILED=0
```

`LanMcpServerIntegrationTest` (root-added, real TCP) was excluded locally because it needs the
NanoHTTPD jar; by inspection its expectations still hold — 401 without auth (now decided before
the body read, `Connection: close` added), 200 + echoed `2025-11-25`, 202 notification, six
tools, locked tap → `DEVICE_LOCKED`, `{invalid` → 400, post-stop → 503, and
`stopServer()` still closes the listening socket.

The Android-only edits (`LanMcpService`, `AccessibilityDeviceActions`, `LanMcpServer`,
`TaskExecutionService`) were additionally compiled alone with kotlinc: **no syntax errors**; the
only diagnostics were unresolved-reference cascades from the absent Android/NanoHTTPD/RN
classpath (expected outside Gradle).

## Residual risks / assumptions

1. **Gradle compile + tests still to run** (root): `./gradlew :app:testDebugUnitTest`.
   Android-only paths (fail-closed FGS/network, `ACTION_SET_TEXT` node path, bounded runner
   inside NanoHTTPD) are not covered by any local harness.
2. The early gate deliberately refuses before reading the body; a client mid-upload may see a
   connection reset rather than the JSON error. Trade-off accepted for fail-closed behaviour.
3. Local-task detection is bound to `TaskExecutionService` (the JS flow starts it alongside the
   headless service). If a future flow starts only `TaskExecutionHeadlessService`, the flag would
   not be set — noted for the task owners, not fixable inside my file scope.
4. `phone_type` now requires a focused **editable** node; a focused non-editable node is refused
   instead of falling back to paste. This is intended (no clipboard) and documented by the error.
5. `REVOKE_WAIT_MILLIS = 400` bounds the stop-path wait: taps/short swipes are serialized; a
   pathological long swipe may still complete, and that is logged, never misreported.
