# V1 Wave 2 Capability Domain Gate

- Wave 2A checkpoint: `codex/checkpoint-v1-wave2a` = `a5e36ddec7635a2aa4406ee6bda4852b742d9c93`
- Adapters cherry-picked (no conflicts):
  - OpenClaw `f143dfb` + fix `816db98` (review approved r2)
  - Codex/Cursor `34954d3` (review approved)
  - DSH/Hermes `50e44f5` + fix `e81e973` (review approved r2)
- Task 12: `5a3bc0d` + fix `e3ade7b` (review approved r2)
- Coordinator domain gate: companion/errand/visualAgent/architecture + CapabilityPrivacy PASS
- `npx tsc --noEmit`: exit 0
- `npm test -- --runInBand`: 70 suites / 591 passed
- Hotspot diff vs Wave 2A for Task 12 Step 11 paths: empty
- Native Android JVM / iOS XCTest: still WAIVED (no JDK/Xcode on this machine; expiry 2026-08-27)

## Coordinator decision: composition roots

UI-plan Task 1 `*ApplicationPort` / `AppFacades` composition is **not** created in this checkpoint. Wave 2 exposes domain Facades via `features/{companion,preference,errand,visualAgent}` barrels. A second composition layer here would duplicate UI-plan Task 5. Wave 3 Task 5 is the sole owner of the application composition root.

## Known gaps carried forward

- Foreground/Headless still contain the old `modelInferenceModule.infer` loop / `taskId: 'current'` (Wave 1 leftover; UI Tasks 7–8 must delete or make unreachable).
- Minors: OpenClaw heartbeat reset only on `gateway.heartbeat`; Codex/Cursor duplicated lifecycle; DSH/Hermes `requestPreferences` stub / duplicated ports; `blocker.message` repeats the code.
