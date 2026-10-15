# NoNo companion (local preview)

Adapted from the user-supplied `磁吸超能nono.3mf`, authored by **Ronin_FaShan**.
Embedded design ID: `CNd37397ce74d17f`; embedded license: **Standard Digital File License**.
Source SHA-256: `f5d65684b9b53142d5869fc6a97fbbc2b96334ea6c20e669221385c5f201c997`.
The original download remains unchanged outside this repository. Public redistribution permission has not been established.

The four imported fins retain the source geometry with welded vertices and mobile decimation. The spherical housing is retopologized to a smooth sphere, preserving its overall proportions while removing printing sockets and seams. Printing stands, plugs and connectors are omitted. Visor assembly offset is repaired to `[0, -11.4004356, 20.7158697]` mm before normalization. For the screen version, the recessed printed visor is replaced with a curved oval display, and cyan eyes and a circular core are added to match the user's front reference. White ceramic, dark screen and cyan accents replace printing materials.

The GLB contains eight bones (Root, Head, Ear_L/R, Fin_L/R, Eye_L/R). Rigid robot parts have normalized skin weights. Ten exported clips are `idle`, `listen`, `thinking`, `confirm`, `success`, `error`, `wave`, `happy`, `sleepy`, and `curious`; blinks deform eye meshes through bones. Browser and Android package the same GLB and share the animation controller. This is an adaptation with newly authored animation, not an official animated game asset.

Rebuild from AwesomeProject (Blender 5.1, Node with installed project dependencies):

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/import-nono-3mf.py -- '/Users/a/Downloads/磁吸超能nono.3mf' /tmp/nono-geometry.json
node scripts/generate-nono-avatar.mjs /tmp/nono-geometry.json
node scripts/test-nono-avatar.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/render-nono-avatar.py -- "$PWD/src/features/task/avatar/nono-companion.glb" "$PWD/web-preview/artifacts/nono-front.png"
```

Offline front/three-quarter images verify model geometry, not exact WebGL lighting. Browser interaction and phone GPU appearance need separate verification.

## Reference-detail adjustment

The top antennas and their bone pivots are offset outward by 0.12 body radii and upward by 0.18, leaving a visible floating gap like the lower fins. Added the reference's top cap, layered core bezel, two curved lower-face plates, and thin antenna assembly seams. All detail meshes remain weighted to their owning Head/Ear bones.

Verified all ten clips at 25 samples each: minimum antenna vertex clearance from the spherical shell is 0.117 body radii (listen); other clips remain >= 0.123. Asset/runtime tests pass 6/6. Front and three-quarter offline renders: `web-preview/artifacts/nono-detail-front.png` and `nono-detail-front-angle.png`.

## Companion actions and turntable

Added wave (2.4s), happy sway (3s), sleepy (6s loop), and curious glance (3.6s). Wave/happy/curious are one-shot clips and return to idle; the existing reduced-motion behavior is preserved. Model geometry is unchanged from the accepted detail version.

`AvatarOrbit.mjs` owns shared mouse/touch Pointer Events, pointer capture/cancellation, keyboard arrows/Home, full continuous yaw, limited vertical inspection tilt, reset and optional auto-rotation. Deliberate drag stops auto-rotation. Reduced motion disables auto-rotation, while manual inspection remains available. Rotation is outside the centered skinned model and does not turn the ground shadow. The native wrapper no longer sends competing touch-position look commands.

The lab offers all ten actions, a 0–360° slider, automatic rotation and front reset; displayed state follows the actual controller. Browser and Android share the same orbit module. Browser automation remains unavailable from the earlier policy rejection; physical touchscreen behavior has not been checked on a phone.

## Larger motion pass

Increased body rotation and floating displacement to 2.2×, fin rotation to 1.6×, and antenna rotation to 1.5× without changing geometry or clip duration. All ten clips sampled at 41 times each: minimum appendage vertex clearance is 0.0512 body radii (wave fin); antenna minimum is 0.1099. Existing avatar tests pass 8/8; shared model outputs and dev HTTP match.

## Sleep expression visibility fix

Sleep keeps gently lit horizontal closed-eye strokes throughout its loop. Eye depth is flattened around the eye bone as height contracts, preventing the curved mesh from sinking under the visor. Existing slow float/nod is retained. A regression test reproduced the original screen occlusion (RED) and now confirms visible strokes at multiple sleeping poses (GREEN); avatar suite 9/9. Actual sleeping GLB pose inspected with offline front/angle renders. Shared model outputs and dev HTTP match.

## Local V1 integration review

DeepSeek Harness reviewed the staged model integration and ran the initial 32 checks. The Home tap overlay was found to intercept native drags; it is replaced by a tap callback from the shared pointer controller through the WebView bridge. Drag/cancel cannot trigger chat; accessibility activation and native rendering fallback remain available. A reproducing tap regression failed before the fix and now passes.

The review's shadow-width suggestion is not applied: the 1.44-wide shadow follows the 1.42-wide normalized spherical body, rather than the full span of floating appendages. The accepted visual appearance is retained. Real-device gesture verification is still outstanding.
