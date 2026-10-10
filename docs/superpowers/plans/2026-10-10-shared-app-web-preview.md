# Shared App Web Preview Implementation Plan

> **For agentic workers:** Execute inline with the writing-plans and verification-before-completion workflow. Keep existing uncommitted changes intact.

**Goal:** Run the existing NoNo React Native pages in a local browser so editing shared TSX and StyleSheet source also edits the mobile app.

**Architecture:** Add an independent `AwesomeProject/web-preview` package using React Native Web and Vite. Import the original AppNavigator, screens, shared components and AppFacadesProvider. Preview-only module adapters provide navigation, native facilities and typed demo application data; do not clone any screen into HTML.

**Tech Stack:** React 18.2, React Native Web 0.19, TypeScript, Vite, the existing avatar HTML/JS assets.

## Global Constraints

- Edit only new preview files and this plan; do not overwrite existing local changes.
- Keep production React Native dependencies, page implementations and model credentials untouched.
- Bind the preview service to localhost; never invoke live phone operations, downloads or model providers from preview adapters.
- Page source, style constants, icons and built-in avatar assets stay shared with the app.
- Show Android/iOS layout selection and viewport presets outside the app canvas. State rendering limitations explicitly; do not claim pixel identity without a device comparison.
- Browser DevTools edits are temporary. Durable edits must be saved to the shared source.

## Task 1: Runnable shared-source preview

**Files:** Create `AwesomeProject/web-preview/package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/PreviewShell.tsx`, `src/preview.css`, `src/adapters/*`, `src/fixtures.ts`, `README.md`.

**Interfaces:** Import original `AppNavigator` and `AppFacadesProvider`. Fixture factory implements `AppFacades` from `src/application/facades/UiRuntimeContracts.ts`. Vite aliases only affect browser builds. Navigation adapters preserve registered screen names, route parameters, back navigation and the original CustomTabBar.

- [x] Create a standalone package and install its web-only dependencies.
- [x] Resolve app source aliases to `AwesomeProject/src`; deduplicate React to the preview package.
- [x] Adapt native facilities at module boundaries, reuse the avatar through a same-origin iframe, and render the shared AppNavigator inside the fixture provider.
- [x] Build with `npm run build` in `AwesomeProject/web-preview`; resolve every bundler error before starting the service.
- [x] Start with `npm run dev -- --host 127.0.0.1` and confirm HTTP success and browser rendering.

## Task 2: Verify the editing workflow and screen interactions

**Files:** Create a preview smoke script and verification report under `AwesomeProject/web-preview` as needed.

**Acceptance:** The four primary tabs and registered detail screens render from the original TSX. Navigation, settings toggles, model forms, custom modals, sample task details and the avatar work without a real backend. Android/iOS selection exercises the corresponding layout branches. A saved shared style change triggers HMR. Unsupported native behavior is labeled in the preview shell.

- [x] Run browser interactions and collect screenshots plus console/runtime errors.
- [x] Have an independent testing agent inspect the preview, run its build and verify user interactions; record concrete gaps.
- [x] Fix failures and rerun affected verification.
- [x] Document startup, shared editing paths, demo-data behavior, renderer differences and how to check on a real device.
- [x] Leave the local service running and open its URL for the user.

No commit, push or PR is requested in this task.

## Verification result

Build, HTTP resources, 19 registered page renders, 36 browser checks, 11 production-preview checks and 15 focused App tests passed. Independent evidence: `AwesomeProject/web-preview/verification-report.md`. Service remains available at http://127.0.0.1:5173/.

Shared source editing is wired through Vite React Fast Refresh; an actual edit-and-refresh round trip was not exercised because existing App files were preserved. Pixel matching against a native device and full native behavior remain outside this browser preview verification.
