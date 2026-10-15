import {
  AgentConfigError,
  AgentConfigV2,
  AgentConfigValidationResult,
  EligibilityReport,
  ModelConnection,
} from './AgentTypes';

type RequiredCapability = 'vision' | 'jsonOutput';

const capabilityErrors: Record<RequiredCapability, AgentConfigError> = {
  vision: 'connection_vision_unsupported',
  jsonOutput: 'connection_json_output_unsupported',
};

const validateConnection = (
  id: string | undefined,
  connectionsById: Readonly<Record<string, ModelConnection>>,
  requiredCapabilities: readonly RequiredCapability[],
  errors: AgentConfigError[],
): void => {
  const connection = id ? connectionsById[id] : undefined;
  if (!connection) {
    errors.push('connection_missing');
    return;
  }
  if (!connection.secretRef.trim()) {
    errors.push('connection_secret_missing');
  }
  requiredCapabilities.forEach(capability => {
    if (!connection.capabilities[capability]) {
      errors.push(capabilityErrors[capability]);
    }
  });
};

export function validateAgentConfig(
  config: AgentConfigV2,
  connections: readonly ModelConnection[],
  eligibility?: EligibilityReport,
): AgentConfigValidationResult {
  const errors: AgentConfigError[] = [];
  const connectionsById = Object.fromEntries(
    connections.map(connection => [connection.id, connection]),
  ) as Record<string, ModelConnection>;

  if (config.maxSteps < 1) {
    errors.push('max_steps_invalid');
  }

  switch (config.activeMode) {
    case 'cloud_direct':
      validateConnection(
        config.modeDrafts.cloudDirect.modelConnectionId,
        connectionsById,
        ['vision', 'jsonOutput'],
        errors,
      );
      break;
    case 'cloud_split':
      validateConnection(
        config.modeDrafts.cloudSplit.visionConnectionId,
        connectionsById,
        ['vision'],
        errors,
      );
      validateConnection(
        config.modeDrafts.cloudSplit.plannerConnectionId,
        connectionsById,
        ['jsonOutput'],
        errors,
      );
      break;
    case 'local_vision_cloud_planner':
      if (eligibility?.state !== 'ready') {
        errors.push('local_model_not_ready');
      }
      validateConnection(
        config.modeDrafts.localVisionCloudPlanner.plannerConnectionId,
        connectionsById,
        ['jsonOutput'],
        errors,
      );
      break;
  }

  return errors.length > 0 ? {ok: false, errors} : {ok: true};
}
