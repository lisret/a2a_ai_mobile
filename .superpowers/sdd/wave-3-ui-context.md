# Wave 3 UI Facade context

baseSha / `codex/checkpoint-v1-wave2` = `14f687efda5e08b43c6beaf4560f1dc1107856f1`

## Frozen — import only

`AwesomeProject/src/application/facades/UiRuntimeContracts.ts` already exists from Wave 0. Implement `Default*` classes that take the matching `*ApplicationPort`. Do not redeclare those ports or ViewState types.

## Already exists — do not edit

Wave 2 domain facades live under `features/{companion,preference,errand,visualAgent}`. They are **not** the UI-plan AppFacades. Do not rename, wrap, or delete them in this task. Your files are only under `application/facades/` and `application/events/` plus the listed tests.

Name collision: domain `CompanionFacade` / `ErrandFacade` vs UI `DefaultCompanionFacade` / `DefaultErrandFacade` in `application/facades/*.ts`. Keep them separate.

## Hard rules

- Only create the files listed in your brief.
- Do not edit Screens, hooks, ModelService, NonoConfig, navigation, storage, or native files.
- Companion never captures screenshots or executes device actions.
- Blocked operate / unrunnable phone-operate / disconnected visual-agent: zero fallback.
- No `OpenClawFacade`.
- Commit only owned files. Do not push, merge, or rebase.

`AwesomeProject/node_modules` is already symlinked.
