# Appearance-only separated NoNo

User confirmed the black-rear / clear-front separated sphere on 2026-10-15, then requested exterior only, upper wing 95°, lower wing 80°, breathing, more interactions and expressions.

`nono-detached-source.glb` is the unchanged B exterior source snapshot from `chaonuo/.worktrees/nono-hardware/hardware/nono/variants/custom-core-100/preview/nono-100-study.glb`. `node scripts/generate-nono-detached.mjs` builds `src/features/task/avatar/nono-detached.glb` and records the source SHA256. No edits to the hardware project.

The generated App asset keeps the black/clear shell, rigid hinges and cosmetic display. All engineering interiors, camera assemblies, screen boards, ports and the separate dock are excluded. The old camera aperture is covered. The animated face has eyes and smile/round/flat mouths. Hinge axes are preserved; upper/lower ranges are explicitly 0–95° / 0–80°. All clips are sampled to determine a stable framing envelope.

20 clips: idle, listen, thinking, confirm, success, error, wave, happy, sleepy, curious, wink, surprised, shy, laugh, stretch, peek, unfold, fold, spin, dance. Gestures return to idle; unfold/fold hold their poses. Idle includes a 4.8-second breathing cycle (vertical scale ±1.2%, lateral scale ±0.6%, small float), and the renderer adds gentle eye brightness breathing. Reduced-motion mode stops animation and brightness pulses.

Avatar Looks exposes reaction buttons and tap-to-wink; repeated presses replay without reloading GLB. Homepage tap-to-talk behavior is preserved. Legacy classic NoNo assets/generator remain available.

Validation: `node --test scripts/test-nono-detached.mjs scripts/test-nono-expressions.mjs scripts/test-nono-body-motion.mjs scripts/test-nono-avatar.mjs scripts/test-mika-avatar.mjs scripts/test-avatar-orbit.mjs`; focused avatar/Home Jest tests; Vite build and real browser checks. See `web-preview/artifacts/nono-detached-verification.md`. This is a visual asset, not manufacturing or optical validation.

Whole-body motion: spin is a 3.2-second eased 360° turn using densely sampled quaternion keys, with the entire shell/face/wings under the animated Head. Dance combines sway, bounce and expressions. Happy sways, shy tucks/turns away, surprise recoils and laughter nods. The user-controlled view group remains outside the animated hierarchy, so gestures return to the selected viewing angle. All original 95°/80° wing limits and reduced-motion behavior remain.

Default pose: upper wings 95°, lower wings 80°, including the static/reduced-motion pose. Expressions start/end fully open; wave, stretch and dance briefly flex inward. Only the explicit fold clip holds the wings closed. `scripts/test-nono-default-open.mjs` verifies the initial pose and clip boundaries.
