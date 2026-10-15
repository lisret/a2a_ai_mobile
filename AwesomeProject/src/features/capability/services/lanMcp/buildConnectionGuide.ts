import type {LanMcpStatus} from './LanMcpContracts';

export const CONNECTION_GUIDE_FILENAME = 'nono-mcp-connection.md';

// The export has no connection-code parameter: credentials are entered separately
// by the user in their MCP client and never travel with this document.
export function buildConnectionGuide(
  status: Pick<LanMcpStatus, 'endpoint' | 'running' | 'preview'>,
): string {
  const endpoint =
    !status.preview && status.running && status.endpoint
      ? status.endpoint
      : 'http://<手机局域网IP>:8765/mcp';
  const notice = status.preview
    ? '**浏览器演示文件：没有启动真实 MCP 服务，地址仅为占位符。请在 Android 手机上开启服务后重新导出。**'
    : status.running && status.endpoint
    ? '导出时服务已开启。连接前请确认手机仍处于开启状态，且 Wi-Fi 地址未变化。'
    : status.running
    ? '**暂时无法获取服务地址。请检查手机 Wi-Fi 和服务状态，获得实际地址后重新导出。**'
    : '**导出时服务未开启。请在手机上设置连接码、开启服务，再使用页面显示的实际地址或重新导出。**';
  const rpc = (method: string, params: unknown, id: number) =>
    JSON.stringify({jsonrpc: '2.0', id, method, params}, null, 2);
  return `# NoNo 局域网 MCP 连接与调用说明

${notice}

## 连接条件

1. Android 手机与调用方处于可互访的同一 Wi-Fi 网络。访客网络/客户端隔离可能阻止连接。
2. 在「能力 → 被操控模式 → 局域网模式」设置连接码并开启服务。
3. 操作和截图需要手机已解锁，并授予 NoNo 无障碍权限；截图还取决于系统版本及当前页面限制。
4. 本模式使用局域网 HTTP，不提供传输加密。仅在可信 Wi-Fi 使用，连接码不要复用其他账号密码。

## 客户端连接配置

- 传输：MCP Streamable HTTP（JSON 响应）。
- MCP 地址：\`${endpoint}\`
- 协议版本：\`2025-11-25\`；以 initialize 响应协商的版本为准。
- 请求认证：\`Authorization: Bearer <服务连接码>\`，每次请求都要携带。
- Content-Type：\`application/json\`
- Accept：\`application/json, text/event-stream\`
- 初始化后的请求附带 \`MCP-Protocol-Version: 2025-11-25\`（或协商版本）。
- 本文件不包含实际连接码，请在自己的 MCP 客户端中单独配置。

以下为常见的 mcpServers 配置示意，不保证所有客户端使用相同字段或支持环境变量替换。请按客户端文档填写远程 HTTP 地址和认证头；不要把占位符原样当作可用凭证。

\`\`\`json
{
  "mcpServers": {
    "nono-phone": {
      "url": "${endpoint}",
      "headers": {"Authorization": "Bearer <服务连接码>"}
    }
  }
}
\`\`\`

## 调用顺序

所有请求 POST 到同一个 /mcp 地址。先 initialize，接收服务端能力与协议版本，再发送 notifications/initialized，随后 tools/list 获取实际工具与输入 schema。以运行中服务返回的工具列表为准。

初始化请求：

\`\`\`json
${rpc(
  'initialize',
  {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: {name: 'your-agent', version: '1.0.0'},
  },
  1,
)}
\`\`\`

初始化完成通知（没有 id）：

\`\`\`json
{"jsonrpc":"2.0","method":"notifications/initialized"}
\`\`\`

获取工具：

\`\`\`json
${rpc('tools/list', {}, 2)}
\`\`\`

## 工具与参数

| 工具 | arguments | 用途 |
| --- | --- | --- |
| phone_status | {} | 查看设备和无障碍状态、屏幕尺寸 |
| phone_screenshot | {} | 获取当前屏幕；结果包含 MCP image 内容 |
| phone_tap | {"x":120,"y":240} | 点击屏幕坐标 |
| phone_swipe | {"startX":200,"startY":600,"endX":200,"endY":200,"durationMs":300} | 滑动 |
| phone_type | {"text":"示例文本"} | 向当前可编辑输入框输入文字 |
| phone_key | {"key":"back"} 或 {"key":"home"} | 返回或主页 |

坐标使用设备屏幕像素，以当前方向和截图/状态返回的尺寸为准，不使用浏览器预览的逻辑像素。滑动时长 durationMs 为 1–2000 毫秒，输入文本最多 4096 字符。每次动作后重新观察屏幕；截图工具的图像可能包含私人内容，只交给你已授权的智能体。

看屏请求：

\`\`\`json
${rpc('tools/call', {name: 'phone_screenshot', arguments: {}}, 3)}
\`\`\`

点击请求（示例坐标，必须先观察屏幕再决定）：

\`\`\`json
${rpc('tools/call', {name: 'phone_tap', arguments: {x: 120, y: 240}}, 4)}
\`\`\`

调用方案：查看 phone_status → 获取 phone_screenshot → 智能体判断动作 → 调用一个动作工具 → 再截图确认结果。第一版由外部智能体规划，没有“提交自然语言任务后自动完成”的 MCP 工具。

## 停止与错误处理

- 关闭手机页面的服务开关，或点击系统常驻通知中的停止按钮，即停止接受新调用。已经受理并执行中的动作可能完成，已完成的点击/输入无法撤销。
- 同时只执行一个设备操作。遇到忙碌、锁屏、权限不足或断线时，停止发送动作并检查设备状态；不要无条件重试点击、输入等可能已经完成的操作。
- tools/call 可能返回 isError:true；JSON-RPC 协议错误和 HTTP 错误同样必须处理。HTTP 401 表示连接码缺失/错误，重新确认凭证。
- 连接码更换前先关闭服务；换码后所有客户端都要更新凭证。
- 离开当前 Wi-Fi 或 IP 变化后重新检查服务地址。此文件是导出时的快照，不是在线状态保证。
- 公网模式暂不开放，不要把该 HTTP 端口直接暴露到公网。

协议参考：https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
工具参考：https://modelcontextprotocol.io/specification/2025-11-25/server/tools
`;
}
