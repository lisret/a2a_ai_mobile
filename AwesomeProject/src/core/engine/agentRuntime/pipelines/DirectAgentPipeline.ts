import type {
  AgentPipeline,
  DirectAgentProvider,
  PipelineStepResult,
  StepInput,
} from '../contracts/AgentContracts';

export class DirectAgentPipeline implements AgentPipeline {
  constructor(private readonly provider: DirectAgentProvider) {}

  async decide(input: StepInput): Promise<PipelineStepResult> {
    return {decision: await this.provider.decide(input)};
  }
}
