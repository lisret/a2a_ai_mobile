# V1 Visual Agent and Model Provider Research

Filled before candidate freeze from the frozen adapter/provider source on
`codex/v1-runtime-integration` (checked 2026-08-25). Adopted endpoints are the
ones this branch actually binds; official URLs are the public docs for those
same hosts/protocols. Envelope field remains `visualAgent`; OpenClaw is only
`toolId: 'openclaw'`. Do not change these protocol assumptions during acceptance.

## Visual agent adapters

| Tool | Official URL | Docs/protocol version or commit/tag | Verified date | Transport/catalog endpoint adopted | Maturity | Known capability gap | Owning adapter | Next review trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OpenClaw Gateway | https://docs.openclaw.ai | Adapter `1.0.0`, protocolVersions `[1]`; upstream `gateway_ws` | 2026-08-25 | Connector Bridge `VisualAgentUpstreamPort` / `gateway_ws`; never opens a socket from mobile | stable | Fail-closed on disconnect / missing `imageInput`+`structuredAction`; tokens never echoed | `src/connectorBridge/visualAgent/adapters/openclaw/OpenClawAdapter.ts` | Binding protocol or Gateway frame schema change |
| Codex exec / App Server | https://developers.openai.com/codex | Adapter `1.0.0`; binding `cli_exec_jsonl` \| `app_server_json_rpc_stdio` | 2026-08-25 | Bridge-owned upstream only; WS / `codex mcp-server` excluded | beta | `resume` and `preferences` declared false | `src/connectorBridge/visualAgent/adapters/codex/CodexAdapter.ts` | New Codex transport becomes lifecycle-complete |
| Cursor ACP / Cloud Agents | https://cursor.com/docs | Adapter `1.0.0`; `agent_cli_ndjson` \| `acp_json_rpc_stdio` \| `cloud_agents_http` | 2026-08-25 | Bridge-owned upstream; Cursor MCP is not a transport | beta | `preferences` declared false; cancel only if CLI acknowledges it | `src/connectorBridge/visualAgent/adapters/cursor/CursorAdapter.ts` | Cursor ACP or Cloud Agents auth/session change |
| DeepSeek Harness | https://github.com/deepseek-ai | Adapter `1.0.0`; product bind `deepseek-harness` only | 2026-08-25 | `VisualAgentUpstreamPort`; never aliases Dify; default disabled | experimental | No `imageInput` / approval / resume / steer / preferences | `src/connectorBridge/visualAgent/adapters/dsh/DshAdapter.ts` | `dsh` default-enable or product id change |
| Hermes ACP / TUI / API | https://github.com/NousResearch | Adapter `1.0.0`; ACP stdio, TUI Gateway JSON-RPC stdio/WS, Runs HTTP+SSE | 2026-08-25 | One binding mode at a time, no fallback | beta | Requested-but-not-negotiated capabilities fail closed | `src/connectorBridge/visualAgent/adapters/hermes/HermesAdapter.ts` | Hermes transport set or approval/resume contract change |

## Model provider presets — model catalog policy (11 presets)

Source: `src/core/engine/operateRuntime/model/ModelProviderRegistry.ts` `BUILT_IN_REGISTRATIONS`.

| Preset | Official URL | Docs/protocol version or commit/tag | Verified date | Catalog endpoint adopted | Maturity | Known capability gap | Owning adapter | Next review trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai | https://platform.openai.com/docs/api-reference | `openai_responses` + `/responses`; catalog `/models` pagination none | 2026-08-25 | `https://api.openai.com/v1` + `/models` | stable | Custom mode is a separate transport, never a silent alias | `OpenAIProviderTransportAdapter` | OpenAI Responses vs Chat Completions default flip |
| anthropic | https://docs.anthropic.com/en/api | `anthropic_messages` + `/messages`; catalog `/models` cursor | 2026-08-25 | `https://api.anthropic.com/v1` + `/models` | stable | Auth header `x-api-key` only; no bearer alias | `AnthropicProviderTransportAdapter` | Anthropic `/models` pagination change |
| gemini | https://ai.google.dev/gemini-api/docs | `gemini_generate_content`; catalog `/models` page_token | 2026-08-25 | `https://generativelanguage.googleapis.com/v1beta` + `/models` | stable | Path template `/models/{modelId}:generateContent` | `GeminiProviderTransportAdapter` | v1beta path or page-token contract change |
| deepseek | https://api-docs.deepseek.com | `openai_chat_completions` + `/chat/completions`; catalog `/models` | 2026-08-25 | `https://api.deepseek.com` + `/models` | stable | OpenAI-compatible only; not DSH | `OpenAIProviderTransportAdapter` | Base URL or `/models` change |
| xai | https://docs.x.ai/docs | `openai_chat_completions`; catalog `/models` | 2026-08-25 | `https://api.x.ai/v1` + `/models` | stable | OpenAI-compatible only | `OpenAIProviderTransportAdapter` | xAI catalog path change |
| alibaba_bailian_qwen | https://help.aliyun.com/zh/model-studio | signed_static catalog (no live `/models`) | 2026-08-25 | `https://dashscope.aliyuncs.com/compatible-mode/v1`; catalog kind `signed_static` | stable | Live list disabled; asset catalog only | `OpenAIProviderTransportAdapter` + signed static asset | Bailian adds a trusted remote list |
| zhipu_glm | https://open.bigmodel.cn/dev/api | signed_static catalog | 2026-08-25 | `https://open.bigmodel.cn/api/paas/v4`; catalog kind `signed_static` | stable | Live list disabled | same | Zhipu publishes a pinned remote list |
| moonshot_kimi | https://platform.moonshot.cn/docs | `openai_chat_completions`; catalog `/models` | 2026-08-25 | `https://api.moonshot.cn/v1` + `/models` | stable | OpenAI-compatible only | `OpenAIProviderTransportAdapter` | Moonshot catalog path change |
| minimax | https://platform.minimaxi.com/document | `openai_chat_completions`; catalog `/models` | 2026-08-25 | `https://api.minimax.io/v1` + `/models` | stable | OpenAI-compatible only | `OpenAIProviderTransportAdapter` | MiniMax host/path change |
| volcano_ark_doubao | https://www.volcengine.com/docs/82379 | signed_static catalog | 2026-08-25 | `https://ark.cn-beijing.volces.com/api/v3`; catalog kind `signed_static` | stable | Live list disabled | same | Ark adds a trusted remote list |
| modelscope | https://www.modelscope.cn/docs | signed_static catalog | 2026-08-25 | `https://api-inference.modelscope.cn/v1`; catalog kind `signed_static` | stable | Live list disabled | same | ModelScope adds a trusted remote list |

## Sign-off

- [x] All rows above filled with real, source-backed evidence (no TBD remaining)
- [x] No protocol assumption changed after this record was filled
- [x] Filled before candidate freeze
