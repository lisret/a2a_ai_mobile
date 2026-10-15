# NoNo Runtime 通道改造计划审查与接手建议

日期：2026-08-19\
对象：`docs/superpowers/plans/2026-08-19-nono-runtime-channel-refactor.md`

## 结论

这份计划方向是正确的：**先把运行时路由按`companion / direct / split / openclaw`拆开**，并把“本地视觉失败不能回退云端视觉”作为核心约束落地。\
最有价值的是：它把问题定义清楚、测试先行、并把隐私和行为边界写进每个 task（这对于后续接手模型很友好）。

不过计划和当前代码存在多处实际偏差，当前代码要先补齐 `agentRuntime` 生产文件，先别进业务逻辑重构，否则会踩测试红灯。

## 当前代码对齐快检（已验证）

- 目标路径文件目前**不存在**，`npx jest src/__tests__/core/engine/agentRuntime --runInBand` 失败点对点是 `Cannot find module .../CloudPerceptionProvider`、`DirectAgentPipeline`、`SplitAgentPipeline`、`OpenAICompatiblePlannerProvider`（4 个测试套都红，0 个用例通过）\
  详见本地命令输出中的 error：`Cannot find module`（与 [Task 1 预期]一致）。
- `TaskExecutionEngine` 当前仍是单一路径 `screenshot -> modelInference -> execute`，并未按 `resolveOperateSession` 分发。\
  - 引用: [TaskExecutionEngine.ts] 仍从 `modelInferenceModule.infer(...)` 直接走 `TaskAction`（见文件）。
- 前台 `useTaskExecution.ts` 与后台 `TaskExecutionHeadless.ts` 仍将 `model` 作为直接入口，没有 resolver。\
- `HomeScreen.tsx` 的执行模型加载仍是 `modelService.getSelectedModel()`（默认 unified）与直接执行模型耦合。\
- `AIModel` 当前结构只含 `apiKey`，没有 `secretRef/secretRefAlias`，与 plan 的 `modelToConnection` 兼容策略存在字段缺口。\
- `DebugLogService` 当前会把 console 内容和字符串化对象原样入库，未做脱敏（计划的 Task 8 需求尚未实现）。

## 优化建议（重要程度）

### P0（必须先改）

1. **`modelToConnection` 兼容层必须补齐**\
   当前 `AIModel` 没有 `secretRef`，直接按 plan 中的字段会导致类型/运行期不一致。建议：\
   - 先以 `model.apiKey` 作为当前唯一可用 source 生成 `credential://model/${model.id}` 解析链。\
   - 再逐步扩展 `secretRef/secretRefAlias`（若后续 storage schema 有 migration）。\
   - 这会影响 `modelToConnection()` 和 `CredentialResolver` 的实现。

2. **`Task 1` 真实补齐生产文件是所有后续的前置条件**\
   4 个 agentRuntime 测试目前全报缺失模块；在未创建这些生产文件前，后续 Task 3/4/5 的逻辑改造会掩盖问题。\
   先按 plan Task 1 走完后再接 Task2 以后步骤。

3. **`OpenAICompatibleTransport` 与 `FetchOpenAICompatibleTransport` 命名一致性要尽早收口**\
   计划里有“统一导出/命名”提醒，但这类偏差会在测试阶段迅速放大，建议直接在 Task 1 统一落地。

### I1（影响正确性）

4. **`ActionDecision` 映射应更严格地做类型约束**\
   plan 已建议 discriminated union，但当前运行代码历史仍偏向 `any` 风格。建议把 `type/swipe/launch/wait` 这类参数在 mapper 层做“缺失即失败”并直接映射到统一失败（不要默认瞎点/默认值填充），避免沉默误操作。\
   对应到计划 Task 4 / `mapDecisionToTaskAction`。

5. **`task_in_progress_mode_locked` 的测试范围建议扩大到 front+headless 两端**\
   仅 resolver 返回锁不足，headless 与前台启动入口都要验证“任务进行中 mode 切换不会重路由”。

6. **OpenClaw 高优先级分支时建议补齐连接失败诊断**\
   plan 已定义 openclaw 优先，但要避免出现“openclaw 开启→直接 fallback 到 phoneOperate”的隐式分支。建议在 resolver + adapter 中加入一次性日志与 reason mapping（openclaw_not_connected），并保持 companion 不受影响。

### M1（体验可优化）

7. **首页分流建议先用“高置信规则”+确认兜底**\
   plan 的 Task 5 已建议“宁肯多问一句”，建议明确“操作词触发”为少量触发词 + 明确 UI 按钮确认，否则陪伴场景会有误截图风险。

8. **本地视觉 fallback 行为要记录可观测性字段**\
   `local_vision_cloud_planner` 的失败分支建议写明确可观测指标（vision unavailable / blocked / blocked_by_local_model），避免未来“为什么没回退到云端”难排查。

9. **调度器触发策略要在文档标为“已知不完整”**\
   plan 里是 AppState 前台轮询，这点没问题，但建议在交付说明显式保留“进程杀死漏触发”边界（已有注释，建议在 release notes 重申一次）。

## 里程碑建议（给接手模型）

### Phase 1（先打通）
- Task 1：实现 `agentRuntime` 契约文件（4 套测试红→绿）
- Task 2：实现 `OperateSessionResolver` + `modelToConnection` 兼容层
- Task 3：在前台/后台入口接入 resolver（仅 `local_direct` 实际运行）

### Phase 2（功能补齐）
- Task 4：拆分流水线映射 + 风险确认策略
- Task 5：Companion 分流 + 记忆/交代副作用
- Task 8：日志脱敏

### Phase 3（非阻塞增强）
- Task 6：errand 调度（可先保留后台触发边界）
- Task 7：OpenClaw 接口骨架（保持 blocked，不接真网关）

## 接手提示（建议先做的改动顺序）

1) 先修 `AIModel`/`modelToConnection` 兼容，不让后面全栈测试卡在编译级别。\
2) 按 plan 逐 task 做，不要改存储 key。\
3) 每个新行为要有“失败测试先行”，尤其是:
   - `openclaw` 无连接
   - `minicpm_not_ready` 不回退
   - `missing_unified_model` 明确 blocked
   - `task_in_progress_mode_locked`
4) 所有日志写入点统一挂 `sanitizeLog`，尤其 `DebugLogService` 的 `formatMessage`。

## 最终判定

总体上 plan 是“方向正确、结构清楚、可执行”的；但建议不要直接按 Task 4 或 Task 7 开始。\
**先按兼容字段与生产缺失文件补齐，再做 resolver 与执行链改造，成功率会明显更高。**
