# NoNo imported companion implementation

User approved existing NoNo geometry with added skeletal animation and supplied a front reference. Execute inline using executing-plans. Preserve the existing dirty checkout; no commit, publication or installation on a phone.

Goal: replace the rejected Mika with the user's downloaded Ronin_FaShan NoNo, keeping its recognizable silhouette and improving its on-screen materials and expression.

Architecture: Blender reads the 3MF XML and restores component positions, removes printing support parts, reduces redundant triangles, and exports geometry. Three.js builds a rigid-part skeleton, adds screen eyes and six clips, and exports a shared GLB. Existing renderer/animation controller remains shared by web and Android.

- [x] Import source 3MF, verify source provenance, assemble head/visor/fins from source geometry and inspect a rendered front view. Retain the user's source file unchanged. Record any repaired assembly offsets.
- [x] Export polished GLB with white ceramic shell, black screen, cyan light parts, Root/Head/fin/eye bones and idle/listen/thinking/confirm/success/error clips. Test normalized weights, visible fin displacement, clip names and asset budget under 5 MB.
- [x] Switch default asset, model label and web/Android packaging to nono-companion.glb. Update avatar lab labels. Verify the same GLB is present in browser build and Android assets; retain external model selection and native fallback.
- [ ] Render and inspect actual model at front and three-quarter views; run model tests, relevant existing renderer tests, typecheck and web build. Review scoped changes through DSH. Report real-device verification separately.

Source: /Users/a/Downloads/磁吸超能nono.3mf; author and Standard Digital File License are embedded. This work is local preview adaptation; public redistribution permission is not established.

## Verification and delivery

- Imported and inspected the actual user download; original unchanged.
- Visual adaptation: retopologized the spherical housing and screen to remove print seams/recesses; kept four source fins. Front and three-quarter GLB renders inspected.
- Final GLB: 2,059,880 bytes; 8 bones; 6 skeletal clips. SHA-256 `d8c17d30327d40fcf3dea2aebb4f9578ffa8ea84fe91f35282256feebe77eeeb` matches source, Vite dist, Android assets, and dev-server HTTP response.
- NoNo asset/runtime tests 6/6; legacy model/runtime regressions 6/6; avatar Jest tests 20/20. TypeScript noEmit passed; Vite build passed; Gradle copyNonoAvatarAssets passed; git diff --check clean.
- Automated browser visual QA was rejected by URL policy; no alternate browser workaround attempted. Offline model renders are not browser screenshots. Real Android device rendering remains unverified.
- Independent review dispatched through DeepSeek Harness task `7ce92547-cffe-4657-89dd-f290a31416ac`, session `402e1a0d-f756-4674-bdc3-619dbf3fb7c3`. While running, it observed missing build outputs before build; outputs were subsequently generated and verified by hash. Final task retrieval returned unknown/expired ID and no report exists. Independent review is therefore incomplete, not passed; no fallback backend used.
- No commit, push, publication or phone installation performed. Plan retained with review/interactive QA limitations explicit.
