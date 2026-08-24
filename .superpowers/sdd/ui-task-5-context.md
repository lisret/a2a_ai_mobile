# UI Task 5 context

Work from the integration worktree. Cherry-pick (brief Step 1) is **already done**. Current HEAD / baseSha = `8b1fe30deea3a6ec7247ee87ddbadff77f046e56` on `codex/v1-runtime-integration`.

Start at Step 2. Do not re-cherry-pick. Do not push/merge/rebase.

You may modify only the files listed in the Task 5 brief:
- `AppFacadesContext.tsx` (create)
- `createAppFacades.ts` (create)
- `App.tsx` (modify)
- `jest.setup.js` (modify)
- `AppFacadesContext.test.tsx` (create)

`ModelService` stays read-only and must not enter the new composition. Screens must not import core repository types; only `createAppFacades` may know concrete core classes.

`projectVisualAgentToolOptions` must follow registry order and default `{readiness:'not_configured', configuredProfileCount:0}`. Manifest capability claims in the brief excerpt must match the actual built-in manifests — if a Wave 2 manifest differs, project the real manifest and record the delta in the report (do not invent capabilities).
