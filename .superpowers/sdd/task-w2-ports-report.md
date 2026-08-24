# Task W2 — Shared Capability Ports & Privacy Projection (Report)

WorkPackage: master-plan Task 5 Step 1 → executes Task 1 of
`docs/superpowers/plans/2026-08-20-v1-capability-domains.md`
(Shared Capability Ports + Privacy Projection).

## WorkPackageEvidence

### Status
GREEN. Task 1 complete via TDD (red → green → targeted tests → `tsc --noEmit`).

### Scope / Files (only Task 1 `Files`)
- Create `AwesomeProject/src/core/engine/capabilities/shared/CapabilityError.ts`
- Create `AwesomeProject/src/core/engine/capabilities/shared/CapabilityPorts.ts`
- Create `AwesomeProject/src/core/engine/capabilities/shared/CapabilityPrivacy.ts`
- Test `AwesomeProject/src/__tests__/core/engine/capabilities/CapabilityPrivacy.test.ts`

### Produces
`CapabilityError`, `CapabilityErrorCode`, `Clock`, `IdGenerator`, `TimerPort`,
`CapabilityConfigSnapshot`, `CapabilityConfigPort`, `projectCompanionRequest`,
`assertVisualAgentImageConsent`, `assertNoForbiddenKeys`.

### Contract fidelity
- `CapabilityErrorCode = VisualAgentErrorCode | 'privacy_blocked' |
  'preference_remote_unavailable' | 'proposal_not_found' |
  'errand_time_ambiguous' | 'errand_lease_lost' | 'config_revision_conflict'`.
- `VisualAgentErrorCode` is **imported** from
  `@core/engine/operateRuntime/visualAgent/VisualAgentContracts` (Runtime Wave 1
  Task 4B), not duplicated. No `openclaw_*` code introduced.
- `CapabilityConfigSnapshot` / `CapabilityConfigPort` implemented byte-for-byte
  per Frozen Cross-Task Contracts (`visualAgent={enabled,activeProfileId,profiles}`,
  `privacy`, `capabilities.errands`; no `openClaw`).
- No `react` / `react-native` / AsyncStorage / WebSocket / child_process imports.

### RED evidence
`npm test -- --runInBand .../CapabilityPrivacy.test.ts` →
`Cannot find module '@core/engine/capabilities/shared/CapabilityPrivacy'`.

### GREEN evidence
`npm test -- --runInBand .../CapabilityPrivacy.test.ts` → `Tests: 2 passed, 2 total`.
- image-consent asserts `visual_agent_capability_unsupported` and `privacy_blocked`.
- `projectCompanionRequest` drops `untrusted` (image/secretRef/actionHistory);
  `JSON.stringify(safe)` matches none of `/image|secretRef|actionHistory/i`.

### Type check
`npx tsc --noEmit` → exit 0.

### Lint
No linter errors on the four files.

### Commit
- `5055c49 feat: add generic capability contracts` (4 files, +163).
- Parent = wave-1 checkpoint `65819743d14b303b11782dd863cdf0f7aedf7e83` (not rebased).
- Branch `codex/checkpoint-v1-capability-ports` created at `5055c49`.
- Checkpoint == HEAD == `5055c49` (verified via `git rev-parse`).

### Boundaries respected
No Companion/Errand/visual-agent feature work started; no V1 Screens edited;
only Task 1 `Files` committed.

### Concerns
None blocking. `assertNoForbiddenKeys` uses a conservative case-insensitive
key regex (image/secret/token/actionHistory/frame/stack/rawResponse);
downstream Companion tasks should confirm this key set matches their payload
field names.
