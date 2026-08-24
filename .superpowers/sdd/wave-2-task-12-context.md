# Task 12 coordinator context

Integration HEAD / Task 12 baseSha = `c9dec764c5bfd1e25314ce9309ddfd56fbe02813` on `codex/v1-runtime-integration`. Verify with `git rev-parse HEAD` before you start.

Work from: `/Users/a/Desktop/code/tool/a2a_ai_mobile/.worktrees/v1-runtime-integration`

## Already exists — do not recreate

- `VisualAgentProfileController` at `features/visualAgent/application/VisualAgentProfileController.ts`
- `CompanionFacade` + `CompanionViewState`
- `PreferenceFacade` + `PrivacyViewState` (in PreferenceFacade.ts)
- `ErrandFacade` + `ErrandsViewState`
- Wave 2A runner: `defineVisualAgentAdapterConformance` — import unchanged, do not copy or extend
- Five adapter fixtures (APIs are not uniform):
  - `createOpenClawConformanceFixture()`
  - `createCodexConformanceFixture()`
  - `createCursorConformanceFixture()`
  - `dshConformanceFixture` (const)
  - `hermesConformanceFixture` (const)
- Manifests: `openClawManifest`, `codexManifest`, `cursorManifest`, `dshManifest`, `hermesManifest`

## Coordinator resolutions (binding)

1. The brief's all-true `negotiatedCapabilities` / all-six `requiredStatuses` excerpt cannot be applied identically to every fixture. Codex/Cursor/DSH fixtures truthfully omit some capabilities (DSH has `imageInput: false`). Derive each fixture's options from `fixture.supportedCapabilities` and the statuses that fixture can emit. Do not `switch (toolId)`. Do not edit adapter fixtures or adapter implementations.
2. The frozen runner emits at most one terminal (`cancelled` else `failed` else `completed`). Do not pass both `cancelled` and `completed` in `requiredStatuses` for a single runner call. Extra lifecycle assertions (image consent, idempotency, steer unsupported, etc.) belong as additional tests in the aggregate file, still using fixture helpers / the same runner, still without tool-name branches.
3. `registerCustomWithoutConformance('custom:sample')` is a test helper that must throw `visual_agent_adapter_not_found`. There is no public mutable register.
4. Barrels: Preference/Companion/Errand export only existing Facade + ViewState. Visual Agent barrel matches the brief exactly (nine frozen names + Facade/ViewState). No `features/openclaw`.
5. Do not create application composition roots in this task — coordinator will add them after this commit. Do not edit shared-hotspot files. Do not push/merge/rebase.
6. `npm test -- --runInBand` (brief Step 10) is required. If a pre-existing Wave 0 failure appears, record the exact command/output and do not weaken Jest/TS config.

## Commit

Use the brief message: `test: enforce visual agent adapter conformance`
Only the files listed in the Task 12 brief.
