# LAN MCP delivery evidence — 2026-10-10

Source and build: PASS. Device acceptance: PENDING (target phone selection not received).

Implemented in the shared App source: capability → remote mode → LAN settings, service switch, validated connection-code editor and Markdown export. Browser adapter is explicitly a demo and starts no phone/server. Public mode stays disabled. Android native module hosts authenticated, private Wi-Fi-bound MCP Streamable HTTP with six device tools, foreground Stop notification, Keystore storage and SAF export.

## Verification

- Android JDK 17 / Gradle 8.4: `:app:testDebugUnitTest --tests 'com.awesomeproject.lanmcp.*' :app:assembleDebug` succeeded on final source; 155 tests, 0 failures/errors/skips. Real NanoHTTPD TCP/HTTP integration on loopback checks authentication, initialization, tool discovery, fake-device dispatch/refusal, stop listener, and immediate restart on the same port. Device actions are test doubles in these JVM tests.
- 29 Jest tests passed across LAN UI/wrapper/guide, production runtime ports and existing native task contract. Native/local ownership acquired before planning, released on blocked/error/completion paths.
- TypeScript `tsc --noEmit` passed; Vite production build passed. Existing bundle-size advisory remains; RN TouchableOpacity test animation act warnings are not test failures.
- Browser walkthrough: opening LAN mode; code-required switch; validation/save; demo on/off; actual Markdown download; downloaded guide excludes test code and labels placeholder address. Screenshot: `artifacts/lan-mcp-settings.png`.
- Independent DSH UI review: PASS (`lan-mcp-ui-review.md`). Independent DSH native source review: PASS, device signoff PENDING (`lan-mcp-native-review.md`). Final Gradle rerun succeeded after review fixes and removal of the redundant port preflight probe.
- `git diff --check` passed. No commit/push or phone installation; all preexisting work retained.

## Remaining device checks

Select USB 24129PN74C (e9ed13a7) or wireless MI_9 before installation. Validate Android foreground start/Stop notification, Wi-Fi bind/address change, real MCP client access, Keystore persistence, accessibility screenshot/tap/swipe/type/back/home, locking and concurrent local-task refusal, and SAF save/cancel. JVM loopback and browser tests do not prove these Android behaviors. MIUI/background restrictions and concurrent Wi-Fi interfaces also need device observation.

Debug APK is at `android/app/build/outputs/apk/debug/app-debug.apk`; use the project's normal React Native/Metro workflow. Workspace-local Gradle caches and temporary staged implementation are under ignored `web-preview/artifacts/`.
