# Mika Companion Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. User approved the proposed Mika companion direction; continue locally in the existing V1 checkout and preserve existing changes. No commit, push, or purchase.

**Goal:** Deliver a self-authored Mika 3D prototype with genuine skinned skeletal animations in the shared browser/Android avatar.

**Architecture:** Generate a reproducible bundled GLB with Three.js geometry, bones, weights and six named clips. Add a small animation controller shared by the avatar renderer and CPU tests. Load the bundled character by default; retain procedural fallback on asset failure. Reuse scene.js in browser and Android.

**Tech Stack:** Existing Three.js 0.160.1, GLTFLoader/GLTFExporter, React Native WebView, Vite, Node test runner.

## Global Constraints

- Prototype based on Mika reference, not an official model. Reference image remains outside the repository; no game extraction or third-party model purchase.
- idle/listen/thinking/confirm/success/error clips. One-shot confirm/success/error return to idle. Repeated mood does not restart clip. Reduced motion pauses animation; resume does not jump time.
- Genuine SkinnedMesh with normalized weights; animated joint motion must deform vertices. Independent ears, head, arms, legs and eyelids.
- Loading is keyed by model URI. Stale loads cannot overwrite current selection. Replaced resources and mixers are disposed.
- Existing external GLB packs still load; incomplete clips fall back to idle or first clip. Rendering failure must remain visible via native callback.

### Task 1: Reproducible model + bone/clip tests
- Create scripts/generate-mika-avatar.mjs, src/features/task/avatar/mika-prototype.glb and companion model provenance README.
- Before generation add scripts/test-mika-avatar.mjs. Parse GLB with Three GLTFLoader in Node; assert skeleton/weights, six clips, animated skinned vertex displacement, and sub-2 MB asset. Run red, generate, run green.
- Generator constructs world-space smooth geometry bound to a shared skeleton, uses blended ear/body weights, and exports binary GLB with GLTFExporter. Face uses mesh features, no remote textures.

### Task 2: Playback + host integration
- Create src/features/task/avatar/AvatarAnimation.mjs exporting createAvatarAnimation(root, clips, options); return setMood, update, dispose.
- Extend CPU tests for repeated-state stability, one-shot return, missing-clip fallback, reduced motion and cleanup.
- Modify scene.js: bundled default, proper model framing, hide all legacy parts on load, race-safe load/disposal, visibility suspension and animation mixer update.
- Modify NonoAvatar3D.tsx: separate model/mood/layout effects and handle ready message for module initialization. Preserve load-end fallback.
- Package mika-prototype.glb and AvatarAnimation.mjs in Android Copy task and Vite middleware/build. Update builtin display title to 米咔 · 原型.

### Task 3: User-visible verification
- Create a browser-only avatar inspection page with six mood buttons and rotation controls using the same avatar.html (no duplicated renderer). Verify normal home and portrait/small preview framing with CUA screenshots.
- Run node scripts/test-mika-avatar.mjs, npx tsc --noEmit, relevant Jest avatar tests, web-preview npm run build, Android asset copy using the existing local Gradle cache.
- Dispatch independent DSH review against scoped files with explicit noninteractive constraints. Resolve consequential findings, document remaining device verification limits.

## Progress
- Design accepted by user: 2026-10-10 “可以”.
- Task 1: complete. Generated GLB 989900 bytes, 14 bones, 6 clips; CPU skinning verified.
- Task 2: complete. Shared renderer, idempotent model loads, Android file XHR, native fallback, resources packaged.
- Task 3: complete for browser/source scope. 6 Node checks + 27 Jest tests + TypeScript + Vite build + Android asset copy passed. CUA verified home and avatar lab; real device still unverified.
