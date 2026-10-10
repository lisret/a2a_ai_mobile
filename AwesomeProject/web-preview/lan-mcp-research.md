> 研究快照说明：下文完成于用户确认“实现 Android 真实服务”之前。实际实施按 docs/superpowers/plans/2026-10-10-lan-mcp-service.md：协议 2025-11-25、六个 phone_* 工具、Bearer 连接码且导出不带连接码。该报告中的 2025-06-18 / 四工具 / UI-only / 挑战校验均未采用。单动作接口与任务规划分开，不能将按 taskId 的 claim 推断为全设备互斥。

# NoNo 被操控模式 · 局域网 MCP 服务最小接口契约（只读研究）

## 结论

局域网"被操控模式"应实现为**手机侧的 inbound MCP server**（被调用方），传输走官方 **Streamable HTTP**，能力只暴露 `tools`，执行复用现有 `OperateTaskRunner` 单任务循环。它与现有 **VisualAgent connector bridge 方向相反**：后者是 App 主动出站连上游（`VisualAgentUpstreamProtocol` 含 `gateway_ws`/`cloud_agents_http` 等），不能当作入站 MCP server 使用。

## 假设（信息不足处）

1. 本轮只交付 UI 交互契约与连接说明文件；不实现后端，不拨号，不启动服务。
2. "服务连接码"是**人机共享的对称密钥**（配对码），不是 OAuth 授权服务器；无公网/无证书的局域网场景采用静态口令 + 挑战校验。
3. 目标协议版本按官方当前可见规范实现 **2025-06-18**；若客户端请求其他版本，按版本协商规则回落到服务端支持的最新版，不假装支持未实现版本。
4. "导出连接文件"导出的是**给智能体客户端导入的配置文本**，落点与分享方式（文件/剪贴板/二维码）由主 agent 与用户确认。

## 协议兼容建议

| source | exact quote or line | impact |
| --- | --- | --- |
| [MCP Transports 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http) | "The server **MUST** provide a single HTTP endpoint path ... that supports both POST and GET methods." | 单一 MCP endpoint，如 `http://<手机IP>:<端口>/mcp`；POST 收消息，GET 可选开 SSE 流。 |
| 同上 | "Servers **MUST** validate the `Origin` header on all incoming connections to prevent DNS rebinding attacks" | 必须校验 `Origin`（无 Origin 的本地 CLI 客户端按策略放行或拒绝，需显式记录决策），不能因局域网就省略。 |
| 同上 | "When running locally, servers **SHOULD** bind only to localhost (127.0.0.1) rather than all network interfaces (0.0.0.0)" | 与"同网段智能体连接"直接冲突：按 SHOULD 例外处理，绑定具体 LAN 地址而非 `0.0.0.0`，并以连接码鉴权补偿。 |
| 同上 | "The client **MUST** include an `Accept` header, listing both `application/json` and `text/event-stream`" | 服务端要同时支持 `application/json`（整包返回）与 `text/event-stream`（SSE）；最小实现可只返回 JSON，但必须接受该 Accept。 |
| 同上 | "the server **MUST** return HTTP status code 202 Accepted with no body"（notification/response 输入） | `notifications/initialized`、`notifications/cancelled` 一律 202 空体，不是 200。 |
| 同上 | "the server **MUST** either return `Content-Type: text/event-stream` ... or `Content-Type: application/json`" | 最小版选 JSON 单响应即可合规；SSE 作为后续增强，不阻塞首版。 |
| 同上 | "servers **SHOULD** respond to requests without an `Mcp-Session-Id` header (other than initialization) with HTTP 400 Bad Request" | 会话 ID 可选：首版可不发会话 ID，则不做 400 校验；若发，就必须在所有后续请求上强制。 |
| 同上 | "the client **MUST** include the `MCP-Protocol-Version: <protocol-version>` HTTP header on all subsequent requests" | 服务端要读取该头；缺失且无法从 initialize 推断时"**SHOULD** assume protocol version `2025-03-26`"，无效/不支持时"**MUST** respond with `400 Bad Request`"。 |
| [MCP Lifecycle 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle#initialization) | "The initialization phase **MUST** be the first interaction between client and server." | 未 `initialize` 前不处理 `tools/call`；`initialize` 请求**不可被取消**。 |
| 同上 | "If the server supports the requested protocol version, it **MUST** respond with the same version. Otherwise, the server **MUST** respond with another protocol version it supports." | 版本协商是服务端职责；回落后要如实声明自己的 `serverInfo.version`，不得声称支持未实现的能力。 |
| [MCP Tools 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#capabilities) | "Servers that support tools **MUST** declare the `tools` capability" | initialize 响应 `capabilities.tools`；若工具集固定不变，省略 `listChanged`。 |
| 同上 | "Tools use two error reporting mechanisms: 1. **Protocol Errors** ... 2. **Tool Execution Errors**: Reported in tool results with `isError: true`" | 未知工具/参数非法 → JSON-RPC error；设备能力不足、动作执行失败 → `isError: true` 结果，供模型自我修正。 |
| 同上 | "If an output schema is provided: Servers **MUST** provide structured results that conform to this schema." | 首版可不给 `outputSchema`，只返回 `content` + `structuredContent`；一旦声明就必须严格符合。 |
| [MCP Authorization 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization#protocol-requirements) | "Authorization is **OPTIONAL** for MCP implementations." | 局域网首版不实现 OAuth 授权服务器是合规的；连接码走请求头校验即可，但必须明说自己不是 OAuth。 |
| 同上 | "Implementations using an HTTP-based transport **SHOULD** conform to this specification." | 长期若要被标准客户端自动授权，才需要补 RFC9728/RFC8414 元数据；首版明确不支持并给出失败码。 |
| [MCP Cancellation 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation#behavior-requirements) | "Receivers of cancellation notifications **SHOULD**: Stop processing the cancelled request ... Not send a response for the cancelled request" | 收到 `notifications/cancelled` 后停止对应 `tools/call` 处理且**不回响应**；与本仓库 lease 取消语义天然一致。 |
| 同上 | "The `initialize` request **MUST NOT** be cancelled by clients" | 初始化请求不参与取消映射。 |

## 工具最小集合（4 个）

| 工具 | 语义 | 现有能力 | 待实现 |
| --- | --- | --- | --- |
| `device_status` | 读状态：服务是否开启、无障碍/截图权限、屏幕尺寸、当前任务与 `{taskId, sessionRevision}` | `AccessibilityModule.isEnabled`（`AccessibilityModule.kt:54`）、`getScreenSize`（`:582`）、`CapabilityService.getScreenSize`（`CapabilityService.ts:133`）、`OperateTaskEventBase`（`TaskExecutionContracts.ts:3`） | 组装为只读快照；服务开关/端口/已连接客户端计数状态源 |
| `screen_observe` | 观察屏幕：截图 | `captureScreen` 返回 JPEG(70%) 原分辨率 data URI（`ScreenshotManager.kt:37-41`，`AccessibilityModule.kt:649-689`） | 剥掉 data URI 前缀拆成 MCP `image` 内容块（`data` + `mimeType: image/jpeg`）；给出体积上限与降级策略 |
| `device_action` | 动作：`click`/`longPress`/`doubleTap`/`swipe`/`input`/`back`/`home`/`launch` | 动作词汇表 `ActionType`（`Task.ts:10`）；`executeTaskAction` 目前只实现 `click`/`back`/`home`/`wait`（`RuntimeApplicationPorts.ts:721-741`）；原生 `AccessibilityActionModule` 已有全部方法（`performClick:32`、`performSwipe:89`、`performTextInput:108`、`launchApp:367`） | 补 `longPress`/`doubleTap`/`swipe`/`input`/`launch` 到 `executeTaskAction`；坐标以 0..1000 归一化（`AgentTypes.ts:80-81`） |
| `task_cancel` | 取消：按 `taskId`（+`sessionRevision`）取消在跑任务 | `OperateApplicationPort.cancel(taskId)`（`UiRuntimeContracts.ts:445`）、`RuntimeOperatePort.cancel` 调 `abort()`（`RuntimeApplicationPorts.ts:224-229`）、lease `cancel()`（`OperateSessionContracts.ts:54`，`OperateSessionStore.ts:85-91`） | 从 MCP `notifications/cancelled`/`tools/call` 映射到该入口；明确"取消不等于立即停止" |

**边界**：单任务互斥由 lease 保证——重复 claim 返回 `operate_session_already_claimed`（`OperateSessionStore.ts:181-183`），所以 MCP 并发 `device_action` 必须显式返回"已有任务在跑"，而不是排队或静默丢弃。

## 现有能力 vs 待实现（逐项）

| 项 | 现有 | 待实现 |
| --- | --- | --- |
| 出站连接智能体 | `VisualAgentExecutionPort`/`connectorBridge` 五个内置适配器（`VisualAgentContracts.ts:219-256`，`BuiltInVisualAgentToolRegistry.ts:52-66`），默认 transport 抛 `visual_agent_not_ready`（`:31`） | — |
| 入站 HTTP/JSON-RPC 服务 | **无**。全仓只读检索未发现 `ServerSocket`/`HttpServer`/入站 socket；既有 `socket` 字样均为出站 WS/单测字符串 | HTTP/1.1 最小服务 + JSON-RPC 2.0 编解码 + `initialize`/`tools/list`/`tools/call` |
| 页面入口 | `RemoteControlScreen.tsx` 仅有"局域网模式"占位 Alert："局域网连接功能尚未接入，当前无法配对或接收远程指令。"（`:15`）；路由 `RemoteControl`（`navigation.ts:17`，`AppNavigator.tsx:157`） | 开启服务开关、连接码设置、导出连接文件、状态与错误展示 |
| 密钥存储 | `SecureCredentialModule`（`put/get/delete`）+ `CredentialStore` 接口、Keystore 实现 | 连接码以 `secretRef` 存取；不得落明文日志/持久化 |
| 前台服务 | `TaskExecutionService`（`TaskExecutionService.kt:21`，`startForeground` 通知渠道）、`AccessibilityModule.startTaskExecutionService:364`/`stopTaskExecutionService:400` | 局域网服务的常驻前台服务与唤醒锁（`acquireWakeLock:505`）复用同一模式 |
| 网络权限/地址 | `INTERNET`、`ACCESS_NETWORK_STATE`（`AndroidManifest.xml:5-6`） | 读取本机 LAN IPv4 的能力（当前无 `WifiManager`/`NetworkInterface` 使用）；`NSLocalNetworkUsageDescription` 类 iOS 权限文案 |
| 传输层依赖 | Android 仅有 `react-android`、`commons-compress`、`sherpa-onnx.aar`（`android/app/build.gradle:167-181`）；JS 侧无 HTTP server 库 | 原生 `ServerSocket` 自写最小 HTTP，或引入轻量依赖（需单独评审） |

## 连接说明文件（拟定契约，尚未实现）

> **状态：拟定契约草案，非已可用功能。** 工具与端点目前**尚不可用**，任何客户端导入后只会连接失败。不得给用户当作可用连接信息。
> 官方文档只给出**通用形态**（远程 MCP server 用 URL，本地 stdio 用 command/args）；**没有**任何"所有智能体客户端都支持某一种配置格式"的保证，故此处不声称兼容任何具体客户端。

```
# NoNo 被操控模式 · 局域网 MCP 连接说明（拟定契约 DRAFT）
# 状态: 未实现 / 不可用

传输: Streamable HTTP (MCP 2025-06-18)
端点: http://<设备局域网IPv4>:<端口>/mcp        # 单一 endpoint, POST + GET
认证: 请求头 Authorization: Bearer <服务连接码>  # 非 OAuth, 静态配对码
请求头: Accept: application/json, text/event-stream
        MCP-Protocol-Version: 2025-06-18
可选: Mcp-Session-Id: <服务端 initialize 返回时>   # 首版可不返回
工具: device_status / screen_observe / device_action / task_cancel
安全: 仅同一局域网; 服务端校验 Origin; 关闭服务即撤销
```

导出文件字段建议：`schemaVersion`、`generatedAtEpochMs`、`transport`、`url`、`auth`(`type: bearer`, `code`)、`protocolVersion`、`tools[]`、`device`(名称/型号)、`status`(`draft_contract`)。连接码是否写入导出文件由用户确认；默认应**不**写入，改为单独展示一次。

## 设备能力不足时如何报告

| 情形 | 现有信号 | 建议 MCP 表达 |
| --- | --- | --- |
| 无障碍服务未启用 | `isEnabled` 返回 false（`AccessibilityCapability.ts:52-62`）；截图 reject "无障碍服务未启动..."（`AccessibilityModule.kt:662`） | `device_status` 返回 `capabilities.accessibility: "disabled"` 与修复指引；`device_action`/`screen_observe` 返回 `isError: true` + `structuredContent.code: "accessibility_disabled"` |
| 无截图权限（Android < R） | "截图失败：需要先请求截图权限"（`AccessibilityModule.kt:671`） | `screen_observe` → `isError: true`，`code: "screenshot_permission_required"`，不返回伪截图 |
| 能力全不可用 | `CapabilityManager.executeWithFallback` 抛 `没有可用的能力来执行 <操作>`（`CapabilityManager.ts:102-104, 129-131`） | 映射为稳定码（如 `no_capability_available`），不使用中文异常文本作为机器码 |
| 服务未开启 / 连接码错误 | 无 | HTTP `401`（缺/错凭据，带 `WWW-Authenticate` 提示为静态码，非 OAuth）、`403`（Origin 校验失败） |
| 版本不支持 | `VisualAgentErrorCode.visual_agent_capability_unsupported`（`VisualAgentContracts.ts:9`）可复用风格 | initialize 错误 `-32602`，`data.supported` 列出真实支持版本（对齐 lifecycle 示例） |
| 已有任务在跑 | `operate_session_already_claimed`（`OperateSessionStore.ts:182`） | `isError: true` + `code: "device_busy"`，附当前 `taskId`/`sessionRevision` |
| 未支持的 action | `unsupported_action:${action.type}`（`RuntimeApplicationPorts.ts:740`） | 参数校验阶段就返回 `-32602`，并让 `tools/list` 的 `inputSchema` 只列出真实已实现的 action |

## 可复用代码锚点

| 用途 | 锚点 |
| --- | --- |
| 唯一执行循环（不得另建） | `OperateTaskRunner.run(lease)`（`OperateTaskRunner.ts:83`）、端口契约 `OperateTaskRunnerPorts`（`OperateTaskPorts.ts:139-167`） |
| 组合根（新端口的注入点） | `RuntimeOperatePort.drive`（`RuntimeApplicationPorts.ts:231-294`）、`executeTaskAction`（`:721`） |
| 会话/任务身份与互斥 | `ResolvedOperateSessionV1`、`OperateSessionLease`（`OperateSessionContracts.ts:28-57`）、claim 冲突码（`OperateSessionStore.ts:170-189`） |
| 事件映射 | `OperateTaskEvent`（`OperateTaskPorts.ts:34-60`）、`mapOperateEvent`（`RuntimeApplicationPorts.ts:690-719`） |
| 截图 | `accessibilityService.captureScreen()`（`AccessibilityService.ts:317`）、`ScreenshotManager.kt:19-46` |
| 动作原生实现 | `AccessibilityActionModule.kt`（`performClick:32`、`performLongPress:51`、`performDoubleTap:70`、`performSwipe:89`、`performTextInput:108`、`performBack:127`、`performHome:146`、`launchApp:367`） |
| 密钥 | `SecureCredentialModule.kt`、`CredentialStore.kt`、`AndroidKeystoreCredentialStore.kt` |
| 前台服务模式 | `TaskExecutionService.kt:21`、`AccessibilityModule.kt:364/400/505/523` |
| UI 入口与状态范式 | `RemoteControlScreen.tsx:6-38`、`VisualAgentToolsScreen.tsx`（`VisualAgentReadiness` 状态 + 开关范式）、`UiRuntimeContracts.ts:442-446` |
| 契约风格参考 | `CapabilityError`（`CapabilityError.ts:6-23`）、`VisualAgent*` 冻结契约命名与版本字段 |

## 参考

- [MCP Transports 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [MCP Lifecycle 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)
- [MCP Tools 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP Authorization 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [MCP Cancellation 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation)
- [MCP Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)（客户端配置形态仅作示例，非通用保证）
