import {
  getLocalModelEligibility,
  verifyAndSelfTestLocalModel,
} from '../localModel/LocalModelBridge';
import type {LocalModelEligibility} from '../localModel/LocalModelEligibility';
import type {EligibilityReport} from '../domain/AgentTypes';

const LOCAL_MODEL_ID = 'minicpm-v-4.6-q4';
const NATIVE_MODULE_UNAVAILABLE =
  'LocalModelEligibility native module is not available';

export interface LocalModelEligibilityOperations {
  getLocalModelEligibility(modelId: string): Promise<LocalModelEligibility>;
  verifyAndSelfTestLocalModel(modelId: string): Promise<LocalModelEligibility>;
}

const defaultOperations: LocalModelEligibilityOperations = {
  getLocalModelEligibility,
  verifyAndSelfTestLocalModel,
};

function toReport(value: LocalModelEligibility): EligibilityReport {
  return {
    state: value.state,
    ...(value.reason ? {reasons: [value.reason]} : {}),
    ...(value.checkedAtEpochMs === undefined
      ? {}
      : {checkedAtEpochMs: value.checkedAtEpochMs}),
    ...(value.fingerprint === undefined
      ? {}
      : {fingerprint: value.fingerprint}),
  };
}

function unavailableReport(): EligibilityReport {
  return {state: 'unsupported', reasons: ['native_module_unavailable']};
}

function isNativeModuleUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message === NATIVE_MODULE_UNAVAILABLE;
}

export class NativeLocalModelEligibilityChecker {
  constructor(
    private readonly operations: LocalModelEligibilityOperations = defaultOperations,
  ) {}

  async getCurrent(): Promise<EligibilityReport> {
    try {
      return toReport(
        await this.operations.getLocalModelEligibility(LOCAL_MODEL_ID),
      );
    } catch (error) {
      if (isNativeModuleUnavailable(error)) {
        return unavailableReport();
      }
      throw new Error('local_model_eligibility_unavailable');
    }
  }

  async check(): Promise<EligibilityReport> {
    try {
      return toReport(
        await this.operations.verifyAndSelfTestLocalModel(LOCAL_MODEL_ID),
      );
    } catch (error) {
      if (isNativeModuleUnavailable(error)) {
        return unavailableReport();
      }
      throw new Error('local_model_eligibility_check_failed');
    }
  }
}
