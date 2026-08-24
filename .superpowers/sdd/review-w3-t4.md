# Review: UI Wave 3 Task 4 — Errand and Activity Facades

Base: `14f687efda5e08b43c6beaf4560f1dc1107856f1` · Head: `6ea8c26`

## Spec conformance

- Files match brief exactly: `application/facades/ErrandFacade.ts`, `application/facades/ActivityFacade.ts`, `__tests__/application/facades/ErrandActivityFacades.test.ts`. No other files touched (208 insertions, 0 deletions, 3 files).
- `DefaultErrandFacade` implements the frozen `ErrandFacade` contract via constructor-injected `ErrandApplicationPort`; only imports from `./UiRuntimeContracts`.
  - `createFromProposal`: rejects empty/whitespace title; `schedule` requires non-empty `when`; `once` normalizes by omitting `when` before calling `port.create`. Matches brief step 3 exactly.
  - `update`: fixed allow-list (`pending`, `failed`) delegates to port; all other statuses (`leased`, `completed`, `cancelled`) throw `ErrandNotEditableError` with `code: 'errand_not_editable'` without calling the port. Matches "leased/terminal 返回固定 errand_not_editable".
  - `getViewState`/`setEnabled`/`cancel` are thin passthroughs.
- `DefaultActivityFacade` implements the frozen `ActivityFacade` contract; delegates `getViewState`/`forgetPreference`/`deleteTask` to `ActivityApplicationPort` with no modelId filtering or reshaping. Matches "只委托聚合 port，不按 modelId 隐式过滤任务".
- Global constraints verified against diff: only `DefaultErrandFacade`/`DefaultActivityFacade` produced; only frozen ports imported; no `MemoryItem[]`/`NonoConfigService`/`AsyncStorage`/`react-native` references; `features/errand` untouched; no hotspot files touched (diff is 3 new files only).
- Method signatures type-check against the frozen `ErrandFacade`/`ActivityFacade`/`ErrandApplicationPort`/`ActivityApplicationPort` interfaces in `UiRuntimeContracts.ts` (verified by reading the frozen contract directly).

**Spec: PASS**

## Quality

- Implementation is minimal, thin delegation with no speculative abstraction; validation logic is exactly what the brief specifies, nothing extra.
- `EDITABLE_STATUSES` is an allow-list rather than an exclude-list — safer default if new statuses are added later (matches self-review reasoning).
- `once` branch reconstructs the proposal object explicitly (`{kind, title, errandType: 'once'}`) rather than spreading and stripping `when`, avoiding a stray `when: undefined` key — clean, type-safe.
- Test coverage is thorough: empty title, empty `when`, once-normalization, editable/non-editable `update` via `it.each`, error code assertion, and pass-through delegation for both facades — exceeds the RED skeleton in the brief without adding unrequested production surface.
- Minor, non-blocking: validation errors for empty title / empty `when` are plain `Error` with descriptive messages (no `code` field), unlike the fixed-code `ErrandNotEditableError`. Brief only specified a fixed code for the editability case, so this is a reasonable, flagged judgment call, not a defect.

**Quality: Approved**

## Findings

- Critical: none
- Important: none
- Minor: Empty-title / empty-`when` validation errors use plain `Error` (no structured `code`), while `update`'s editability error has a dedicated class/code. Not a brief violation (brief only requires a fixed code for editability) but worth reconciling if a caller later needs to distinguish these error types programmatically.

⚠️ None — no spec violations, no scope leaks, no constraint violations found.
