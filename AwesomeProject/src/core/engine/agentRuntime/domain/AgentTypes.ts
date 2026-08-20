export type AgentMode =
  | 'cloud_direct'
  | 'cloud_split'
  | 'local_vision_cloud_planner';

export type LocalModelEligibilityState =
  | 'unsupported'
  | 'needs_download'
  | 'needs_test'
  | 'testing'
  | 'ready'
  | 'failed';

export interface EligibilityReport {
  state: LocalModelEligibilityState;
  reasons?: readonly string[];
  checkedAtEpochMs?: number;
  fingerprint?: string;
}

export interface ModelConnection {
  id: string;
  providerId: string;
  baseUrl: string;
  modelName: string;
  secretRef: string;
  credentialDisplay?: {masked: string; lastFour: string};
  /** Non-sensitive compatibility metadata for legacy model management views. */
  metadata?: {
    displayName: string;
    description?: string;
    createdAtEpochMs: number;
    updatedAtEpochMs: number;
  };
  capabilities: {
    vision: boolean;
    jsonOutput: boolean;
    toolCalls: boolean;
    thinking: boolean;
  };
}

export interface AgentConfigV2 {
  version: 2;
  activeMode: AgentMode;
  modeDrafts: {
    cloudDirect: {modelConnectionId?: string};
    cloudSplit: {visionConnectionId?: string; plannerConnectionId?: string};
    localVisionCloudPlanner: {
      localModelId: 'minicpm-v-4.6-q4';
      plannerConnectionId?: string;
    };
  };
  maxSteps: number;
}

/** Normalized x, y, width, and height values in the inclusive 0..1000 range. */
export type ObservationBoundingBox = readonly [number, number, number, number];

export interface ObservationElement {
  id: string;
  role: string;
  text?: string;
  bbox: ObservationBoundingBox;
  enabled: boolean;
  selected?: boolean;
  confidence: number;
}

export interface Observation {
  schemaVersion: 1;
  app?: string;
  page?: string;
  stateSummary: string;
  visibleText: readonly string[];
  elements: readonly ObservationElement[];
  uncertainties: readonly string[];
}

/** Normalized x and y values in the inclusive 0..1000 range. */
export type ActionCoordinates = readonly [number, number];

interface ActionDecisionBase {
  schemaVersion: 1;
  subtaskId: string;
  targetId?: string;
  coordinates?: ActionCoordinates;
  text?: string;
  expectedState: string;
  risk: 'low' | 'medium' | 'high';
}

export type ActionDecision = ActionDecisionBase &
  (
    | {action: 'tap'}
    | {action: 'input'}
    | {action: 'swipe'}
    | {action: 'back'}
    | {action: 'wait'}
    | {action: 'finish'}
    | {action: 'ask_user'}
  );

export type AgentConfigError =
  | 'connection_missing'
  | 'connection_secret_missing'
  | 'connection_vision_unsupported'
  | 'connection_json_output_unsupported'
  | 'connection_tool_calls_unsupported'
  | 'local_model_not_ready'
  | 'max_steps_invalid';

export type AgentConfigValidationResult =
  | {ok: true}
  | {ok: false; errors: AgentConfigError[]};
