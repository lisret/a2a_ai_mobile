# NoNo Pet Idle Implementation Plan

> Execute in this session; use DeepSeek Harness for isolated model-service work and independent testing. The approved spec is ../specs/2026-10-15-nono-pet-idle-design.md.

**Goal:** Give builtin NoNo quiet, stateful pet-like idle behavior.
**Architecture:** Local animation director owns bounded procedural wings and seeded weighted actions; the host controls visibility and throttles AI intent; existing companion facade supplies validated temperament through the configured provider.
**Tech Stack:** React Native, Three.js, TypeScript, node:test, Jest.

## Constraints
95°/80° hinge ceilings; no new dependencies; no background animation/network; no transcript or screenshot in AI requests; manual and conversation states take priority; old packs unchanged.

## Task 1 — Local director and animation
- [x] Add node tests first: seeded action sequence, no adjacent duplicates, rare-action cooldown, interaction activation/decay, explicit mood priority, reduced motion, wing range/synchronization.
- [x] Run `node --test scripts/test-nono-pet.mjs` and confirm missing behavior fails.
- [x] Create `src/features/task/avatar/AvatarPet.mjs`: `createPetDirector({random})` provides `update(delta)`, `interact()`, `setTemperament(value)`, `temperament`, `idleSeconds`; update yields an allowed clip or null. Visible simulation time owns cooldown and idle age.
- [x] Extend `AvatarAnimation.mjs` with opt-in `autonomous`, `setTemperament`, `interact`, transient ownership and idle procedural wing/eye transforms. Keep original animation defaults for existing script callers.
- [x] Wire scene opt-in only for builtin and preserve explicit `playMood` replays, orbit interaction, active lifecycle.
- [x] Run new and all existing avatar node tests.

## Task 2 — Companion intent service (isolated DSH work)
- [x] Define `PetIntentContext`, `PetTemperament`, `PetIntent` in application/facades/PetIntent.ts.
- [x] Write Jest tests for role selection, credential resolution, strict response validation, abort and failure fallback, minimal context.
- [x] Implement configured companion provider request without conversation/history side effects; expose optional `suggestPetIntent(context, signal)` through CompanionFacade/application port and composition.
- [x] Run focused tests and TypeScript; return exact evidence without modifying avatar/UI files.

## Task 3 — Visible host integration
- [x] Extend NonoAvatar3D with active lifecycle and optional intent callback, abortable/throttled request handling, state injection after ready; tests first for inactive/reduced-motion and stale responses.
- [x] Forward screen focus from Home/AvatarLooks; Home wires companion intent callback. Pause for manual mood/gesture/drag and background. External packs never request AI.
- [x] Package AvatarPet.mjs in Android and Vite copy lists.
- [x] Run full Jest, tsc, node avatar tests, Vite build, Android release build.

## Task 4 — Review and delivery
- [ ] Independent DSH testing with plan/report and gate record.
- [x] Actual diff review via agent-runtime before commit; verify findings.
- [ ] Commit, PR to V1, merge and USB update Xiaomi 9 per continuing delivery request; retain existing no-extra-user-perspective-QA decision for this avatar surface.
- [x] Verify model motion/installation if device is available; don't interfere with concurrent device use.
