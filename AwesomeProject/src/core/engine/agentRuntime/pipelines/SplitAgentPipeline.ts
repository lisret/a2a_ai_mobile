import type {
  AgentPipeline,
  PerceptionProvider,
  PipelineStepResult,
  PlannerProvider,
  StepInput,
} from '../contracts/AgentContracts';
import {sanitizePlannerInput} from '../contracts/PlannerPayload';

export class SplitAgentPipeline implements AgentPipeline {
  constructor(
    private readonly perception: PerceptionProvider,
    private readonly planner: PlannerProvider,
  ) {}

  async decide(input: StepInput): Promise<PipelineStepResult> {
    const rawObservation = await this.perception.observe({
      screenshotUri: input.screenshotUri,
      instruction: input.instruction,
      signal: input.signal,
    });
    const plannerInput = sanitizePlannerInput({
      observation: rawObservation,
      instruction: input.instruction,
      history: input.history,
      signal: input.signal,
    });
    const decision = await this.planner.plan(plannerInput);
    const {observation} = plannerInput;
    return {observation, decision};
  }
}
