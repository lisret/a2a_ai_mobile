# Android LAN MCP service and shared UI

User approved a real Android MCP service, with a service switch, connection-code setting and downloadable connection/calling guide. Public mode remains unavailable. All remote control is exposed as MCP tools.

## Contract and constraints
- Preserve all preexisting changes; no commits/push or public exposure.
- Native module `LanMcpModule`: getStatus(), startService(), stopService(), setConnectionCode(code), exportConnectionFile(contents, filename). All async. Status {running:boolean, endpoint:string|null, codeConfigured:boolean, message?:string}. Export resolves 'saved' or 'cancelled'. No secret returned in status.
- Connection code: 12–128 ASCII letters/digits/hyphen/underscore; stored through Android Keystore store; never logged/exported. Cannot change while running. Treat code as Bearer token. No cleartext AsyncStorage.
- Bind only to current private Wi-Fi IPv4 address, port 8765, endpoint /mcp. Reject absence of Wi-Fi, invalid address or occupied port. Phone app explicitly starts foreground service; notification provides Stop. No auto-restart/reboot start. Stop on network loss/address change. No Origin/CORS wildcard. Local HTTP is for trusted Wi-Fi only, not encrypted; explain this alongside connection code and exported guide.
- MCP protocol pinned to 2025-11-25 with older compatible version negotiation if implemented. Authenticated initialize, notifications/initialized, ping, tools/list, tools/call. JSON responses; no MCP server-to-client request feature required. Unsupported inputs/methods fail accurately. No unbounded queues or bodies.
- Exact proposed tools: phone_status {}, phone_screenshot {}, phone_tap {x,y}, phone_swipe {startX,startY,endX,endY,durationMs}, phone_type {text}, phone_key {key:'back'|'home'}. Pixel coordinates refer to screenshot's original display orientation and dimensions. Status includes screenshot dimensions / accessibility status. No arbitrary shell/file API. Mutating operations serialized, rejected while busy/locked/permissions missing. Service-stop revokes subsequent dispatch.
- Export a Markdown guide with actual endpoint when running, placeholder when a supported native service is stopped or its endpoint is unavailable (unsupported native platforms have no exporter), clearly tagged demo in browser. Include transport/version/Bearer placeholder, initialize/tools/list/tools/call examples, tool inputs/results, limitations, and error/stop behavior. Never include live connection code. Native exports through system save dialog, web downloads a file.
- Browser adapter simulates controls only and labels demo; no remote service silently starts on developer computer. iOS explicitly unavailable.

## Work
- [x] Android module, foreground service, authenticated MCP protocol and native execution tools; focused unit tests and native compile.
- [x] Shared RN LAN screen, native service adapter, browser simulation/export, navigation.
- [x] Connection guide generation with tests for accuracy and no credential leakage.
- [x] Independent code review and focused integration verification.
- [x] Browser screenshot and clear delivery evidence / remaining device limitations.

- [ ] Device install and acceptance: awaiting target-device selection; native actions, foreground lifecycle, Wi-Fi changes and SAF not yet verified on a phone.

Evidence: `AwesomeProject/web-preview/lan-mcp-verification.md`. Final Android build and 155 JVM tests passed, including loopback HTTP with fake device actions; 29 JS tests, tsc and Vite build passed.
