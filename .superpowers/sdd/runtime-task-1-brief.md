### Task 1: Port The Verified AgentRuntime Decision Core

**Files:**

- Create: the 19 production files listed in “Pure files copied from phase1 final state”.
- Test: the 11 corresponding test files listed in that section.

**Interfaces:**

- Consumes: existing `TaskAction`, `AbortSignal`, phase1 source SHA `ce9e4a6…`.
- Produces: `AgentRuntime.createTaskSnapshot()`, `AgentRuntime.decideStep(snapshot, input)`, `createAgentRuntime()`, `RuntimeTaskSnapshot`, `RuntimeStepResult`, provider pipelines, privacy projection, validation and `TaskAction` mapping.

The public shapes remain exactly:

```ts
export interface AgentTaskConfigSnapshot {
  readonly config: Readonly<AgentConfigV2>;
  readonly connections: Readonly<Record<string, ModelConnection>>;
  readonly eligibility?: Readonly<EligibilityReport>;
}

export interface RuntimeStepResult {
  readonly decision: ValidatedActionDecision;
  readonly observation?: Observation;
  readonly taskAction: TaskAction;
  readonly diagnostics: Readonly<{mode: AgentMode; durationMs: number}>;
}

export class AgentRuntime {
  createTaskSnapshot(): Promise<RuntimeTaskSnapshot>;
  decideStep(
    snapshot: RuntimeTaskSnapshot,
    input: RuntimeStepInput,
  ): Promise<RuntimeStepResult>;
}
```

- [ ] **Step 1: Restore tests only and capture missing-module RED**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/adapters \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/domain \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/pipelines \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/policy \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/runtime
cd AwesomeProject
npm test -- --runInBand --no-cache src/__tests__/core/engine/agentRuntime
```

Expected: FAIL with missing modules below `src/core/engine/agentRuntime`; failures must not be config/React Native mock failures.

- [ ] **Step 2: Restore the exact decision-core production files**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/core/engine/agentRuntime/adapters \
  AwesomeProject/src/core/engine/agentRuntime/contracts \
  AwesomeProject/src/core/engine/agentRuntime/domain \
  AwesomeProject/src/core/engine/agentRuntime/pipelines \
  AwesomeProject/src/core/engine/agentRuntime/policy \
  AwesomeProject/src/core/engine/agentRuntime/providers \
  AwesomeProject/src/core/engine/agentRuntime/runtime \
  AwesomeProject/src/core/engine/agentRuntime/index.ts
```

Expected: only new `agentRuntime` production/test paths are added. Do not restore `ModelService.ts`, package files, Screen/Hook files, or task engine files.

- [ ] **Step 3: Verify privacy and routing GREEN**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache \
  src/__tests__/core/engine/agentRuntime/adapters \
  src/__tests__/core/engine/agentRuntime/domain \
  src/__tests__/core/engine/agentRuntime/pipelines \
  src/__tests__/core/engine/agentRuntime/policy \
  src/__tests__/core/engine/agentRuntime/runtime
npx tsc --noEmit
npx eslint src/core/engine/agentRuntime src/__tests__/core/engine/agentRuntime
```

Expected: restored suites pass; `RuntimePrivacy` proves local screenshots never reach the cloud planner, local failure invokes no cloud planner, and abort does not return an action. TypeScript and ESLint exit 0.

- [ ] **Step 4: Verify exact donor content before local adaptations begin**

```bash
git diff --check
git diff --name-status codex/checkpoint-v1-runtime-baseline -- AwesomeProject/src/core/engine/agentRuntime AwesomeProject/src/__tests__/core/engine/agentRuntime
```

Expected: only the declared paths, no whitespace errors. Compare `AgentRuntime.ts` with donor:

```bash
git show ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b:AwesomeProject/src/core/engine/agentRuntime/runtime/AgentRuntime.ts | shasum -a 256
shasum -a 256 AwesomeProject/src/core/engine/agentRuntime/runtime/AgentRuntime.ts
```

Expected: both hashes equal `e833944838a1560a6e5575bd8dbafca77c20f8e51e33adb31e84941f4addb880`.

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/core/engine/agentRuntime AwesomeProject/src/__tests__/core/engine/agentRuntime
git commit -m "feat: port verified AgentRuntime decision core"
```

---

