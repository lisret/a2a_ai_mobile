# LAN MCP UI / connection-guide / browser-adapter review (Round 2026-10-10, rev. 2)

Scope: `LanMcpScreen`, `RemoteControlScreen`, `features/capability/services/lanMcp/*`, `web-preview/src/adapters/lan-mcp.ts`, `web-preview/vite.config.ts` boundary entry, navigation registration, `src/__tests__/features/capability/lanMcp/*`.
Contract: `docs/superpowers/plans/2026-10-10-lan-mcp-service.md` (plan §Contract and constraints). Native `LanMcpModule` not merged; judged against the planned API, not file presence.

**Verdict: PASS.** Both accepted defects (FAIL-2, FAIL-3) are fixed at the root with matching tests. FAIL-1 and the ASCII/code-length claim from rev. 1 were **wrong and are withdrawn** — the corrections are recorded below. One documentation-only follow-up remains (plan line 12 wording).

## Revision log vs. rev. 1

| rev. 1 item | status |
| --- | --- |
| FAIL-1 "export button disabled when unsupported" | **Withdrawn — false positive** (analysis error, see below) |
| FAIL-2 "`running && !endpoint` prints 服务已开启" | **Fixed** in `buildConnectionGuide.ts:14-20`, regression test added |
| FAIL-3 "transient poll error dead-ends the screen" | **Fixed** in `LanMcpScreen.tsx:53-67`, auto-retry + clear on recovery |
| "ASCII regex allows non-ASCII / byte-length mismatch" | **Withdrawn — false claim** (see below) |

---

## Re-review of the fixes

### FAIL-2 — fixed

`AwesomeProject/src/features/capability/services/lanMcp/buildConnectionGuide.ts:14-20` now gates the running notice on the same condition as the address:

```ts
14:   const notice = status.preview
15:     ? '**浏览器演示文件：…**'
16:     : status.running && status.endpoint
17:     ? '导出时服务已开启。连接前请确认手机仍处于开启状态，且 Wi-Fi 地址未变化。'
18:     : status.running
19:     ? '**暂时无法获取服务地址。请检查手机 Wi-Fi 和服务状态，获得实际地址后重新导出。**'
20:     : '**导出时服务未开启。…**';
```

The three states are now mutually exclusive and consistent with the address line at `:10-13`: live address ⇒ 服务已开启; running without address ⇒ explicit "暂时无法获取服务地址" with recovery instructions instead of a contradictory claim; stopped ⇒ placeholder + 未开启. `status.preview` still wins first, so the demo tag is unaffected.

Regression test present and passing, `ConnectionGuide.test.ts:42-47`:

```ts
43:  const guide = buildConnectionGuide({running: true, endpoint: null, preview: false});
44:  expect(guide).toContain('暂时无法获取服务地址');
45:  expect(guide).not.toContain('导出时服务已开启');
46:  expect(guide).toContain('<手机局域网IP>');
```

Targeted run (only this suite, no build/tsc/gradle): `ConnectionGuide.test.ts` — **11/11 passed**, including the new case. The two pre-existing guide tests (live address at `:4-19`, stopped/no-stale-address at `:21-30`) still pass, so the fix did not regress the address-selection paths.

### FAIL-3 — fixed

`AwesomeProject/src/features/capability/screens/LanMcpScreen.tsx:53-67`:

```ts
53:            setStatus(next);
54:            setError(previous =>
55:              previous === '暂时无法读取服务状态，将自动重试。' ? '' : previous,
56:            );
...
64:            setStatus(null);
65:            setError('暂时无法读取服务状态，将自动重试。');
```

Behavior now: a transient `getStatus()` rejection shows an accurate message ("将自动重试") instead of instructing a manual page re-entry; the 3 s interval (`:70`) retries; on the first successful poll the message is cleared only if it is still that exact transient message (`:54-56`), so an operation error set by `run()`'s catch (`:100-105`) is never silently erased. `run()` still resets `error` at the start of each action (`:97`), and the revision/focus guards around both branches (`:48-52`, `:59-63`) are unchanged. The recovery path no longer depends on the user leaving the screen, and the `status===null ⇒ unavailable` disable state is now genuinely temporary.

Note (coverage, not a defect): `LanMcpScreen.test.tsx` has no case asserting the transient-poll recovery either way. The logic is small and verified by reading; adding a "getStatus rejects once then resolves ⇒ error appears then clears" test would lock it in, but it is not required for this review to pass.

### FAIL-1 — withdrawn, false positive

My rev. 1 finding was wrong on the contract. The evidence behind the correction:

1. `LanMcpService.ts:17-24` — every mutating call goes through `requireNative()`, which throws when `NativeModules.LanMcpModule` is absent; there is no fallback exporter. On unsupported platforms the export capability does not exist, so an enabled button could only produce the install-error message. Leaving it disabled is correct, not a lost feature.
2. `supported:false` is produced in exactly one place, `LanMcpService.ts:40` (no native module on a non-Android platform or an older package). For an installed Android build the module resolves and `toStatus` (`:25-29`) reports `supported:true`, so the normal user never sees this state.
3. The plan's "placeholder when unavailable" refers to an unavailable *address*, i.e. a supported native service that is stopped — `LanMcpScreen.tsx` already exports there (`disabled={busy || unavailable}` with `unavailable===false`, verified in rev. 1's probe: the export touchable rendered `disabled:false` while running, and `buildConnectionGuide` emits placeholder + 未开启 for the stopped case, covered by `ConnectionGuide.test.ts:21-30`).
4. The browser adapter hard-codes `supported: true` (`web-preview/src/adapters/lan-mcp.ts:8`) and ignores `Platform.OS`, so the demo export works on the preview page regardless of `?platform=ios`. My claim that the `?platform=ios` preview could not export was also wrong: the preview never routes through `Platform.OS` for support.

Consequently the control was never dead for a legitimate use case, and "enabling it" would have been the actual defect. No change is wanted here.

The rev. 1 *symptom* was real — the hint at `:238-242` ("服务开启后导出可获得实际地址，关闭时导出说明模板。") described an action the unsupported state could not perform. The landed fix addresses it correctly by narrowing the hint rather than the control: `LanMcpScreen.tsx:238` is now `{status?.supported && !status.running && (…)}`, so unsupported users no longer see an export promise they cannot act on, and supported-but-stopped users still do. This closes the only genuine part of FAIL-1.

### ASCII / code-length claim — withdrawn, false claim

My rev. 1 assertion that `/^[A-Za-z0-9_-]{12,128}$/` could accept non-ASCII was wrong: the character class is an explicit ASCII allowlist, so any non-ASCII code unit fails the match regardless of length. `ConnectionGuide.test.ts:49-57` already covers this (`'中文连接码123456789'` is rejected; 14 code units, so length is not what rejects it), and the suite passes. There is also no practical cross-boundary mismatch to flag: the plan's code alphabet is ASCII-only, the UI cannot submit a non-ASCII code because `saveCode` validates before the native call (`LanMcpScreen.tsx:123-128`), and native is expected to apply the same pattern. Rev. 1's byte-length paragraph is removed rather than restated.

---

## Remaining follow-up (documentation only, outside this review's file scope)

Plan line 12 still reads "placeholder when unavailable". Now that the implementation distinguishes supported-stopped (export allowed, placeholder) from unsupported (no exporter), the wording should say so, e.g.:

> Export a Markdown guide from an installed Android build: actual endpoint when running, placeholder plus an explicit "address unavailable" notice when the running service has no address, placeholder template when the service is stopped; the control is unavailable when the native module is absent (iOS or an older package), which has no exporter.

I am scoped to `web-preview/lan-mcp-ui-review.md` only, so the plan text is unchanged and is recorded here for the main agent.

---

## Verified clean (carried over from rev. 1, re-checked where the fixes touched them)

- **Credential boundary / export contents.** `buildConnectionGuide` still takes only `{endpoint,running,preview}`; extra leaking fields are ignored (rev. 1 probe: `REVIEW guide leaks secret: false` with `code`/`connectionCode` present). Success Alert states the file has no connection code (`LanMcpScreen.tsx:148-152`). Browser adapter keeps only a boolean and never persists a secret (`web-preview/src/adapters/lan-mcp.ts:4-5`). Client validation before the native call is unchanged (`LanMcpService.ts:54-58`, `LanMcpContracts.ts:21-24`). No secret is logged in scope.
- **Lifecycle races.** `working`/`revision`/`focused` guards unchanged and coherent: revision bump before every mutation (`:92-110`), stale poll/mutation results discarded (`:48-52`, `:59-63`, `:132-137`), no state set while unfocused/unmounted (`:101`, `:143`), modal close refused while busy (`:81-86`), focus cleanup wipes code and closes the editor (`:71-77`).
- **Error paths.** Failed `startService` still never renders "已开启"; the new transient-poll branch cannot leave a stale "已开启" either, because it sets `status` to `null` and the Switch value is `status?.running ?? false`. Missing native module produces the install message, not a simulated success (`LanMcpService.ts:31-47`).
- **Guide correctness vs plan and the MCP 2025-11-25 Streamable HTTP spec** ([transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)): `Accept: application/json, text/event-stream` (required for POST), `MCP-Protocol-Version` after initialize, single `/mcp` endpoint, `Bearer <服务连接码>` placeholder, initialize → `notifications/initialized` → `tools/list` → `tools/call`, six tools with plan-exact argument names (`phone_swipe {startX,startY,endX,endY,durationMs}`, `phone_key back|home`), pixel-coordinate semantics, screenshot/accessibility status, serialized mutations, no-unconditional-retry, HTTP 401 guidance, stop/notification revocation, public-mode warning.
- **Browser adapter & Vite boundary.** `nono-preview-native-boundaries` `resolveId` (`web-preview/vite.config.ts:83-84`) maps `features/capability/services/lanMcp/LanMcpService` to the adapter; the adapter's only app import is the pure contract/validator module, so no native or AsyncStorage code reaches the browser bundle and no service is silently started. Preview is explicitly labelled (`LanMcpScreen.tsx:161-163,174-176`; adapter `preview:true`) and downloads via a Blob anchor. `supported:true` unconditionally, so the demo export is reachable.
- **Navigation.** `CapabilitiesScreen.tsx:63-70 → RemoteControlScreen.tsx:26 → AppNavigator.tsx:158-159`, typed in `shared/types/navigation.ts:17-18`; the guide's stated path `能力 → 被操控模式 → 局域网模式` matches.

## Verification performed this revision

- Read the changed sources: `buildConnectionGuide.ts:1-40`, `LanMcpScreen.tsx:1-260`, `ConnectionGuide.test.ts` (full), `web-preview/src/adapters/lan-mcp.ts`, plus the support/module gating in `LanMcpService.ts`.
- Ran exactly one targeted suite, `ConnectionGuide.test.ts`: **11/11 passed** (includes the new missing-endpoint case). Did not re-run the other two lanMcp suites, `build`, `tsc`, or the browser walkthrough; no Gradle, no dependency install, no global-cache writes.

## Files changed by this review

- `AwesomeProject/web-preview/lan-mcp-ui-review.md` (this report). No implementation edits, no plan edits, no commit/push.
