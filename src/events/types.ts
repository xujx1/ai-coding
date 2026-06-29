/**
 * Event types for the pipeline execution trace.
 * Events are written as NDJSON to logs/events.ndjson.
 */

export type EventType =
  // Pipeline-level events
  | 'pipeline_created'
  | 'pipeline_started'
  | 'pipeline_resumed'
  | 'pipeline_node_start'
  | 'pipeline_node_end'
  | 'pipeline_completed'
  | 'pipeline_failed'
  | 'pipeline_cancelled'
  // Agent-level events
  | 'agent_wakeup'
  | 'agent_start'
  | 'agent_suspend'
  | 'agent_resume'
  | 'agent_end'
  | 'agent_text'
  | 'agent_thinking'
  | 'agent_error'
  // Model events
  | 'model_selected'
  | 'model_switched'
  // Tool events
  | 'tool_start'
  | 'tool_end'
  | 'tool_error'
  // Context events
  | 'compact_start'
  | 'compact_end'
  | 'context_compacted'
  // Rollback events
  | 'node_rollback_requested'
  | 'node_rollback_started'
  | 'node_retry_scheduled'
  | 'fanout_decision'
  | 'branch_transition'
  | 'join_state_updated'
  | 'branch_rerun_scheduled'
  | 'branch_cancelled'
  // Confirmation events
  | 'confirmation_waiting'
  | 'confirmation_resolved'
  // Artifact events
  | 'artifact_written'
  // Plan mode
  | 'plan_created'
  | 'plan_confirmed'
  | 'plan_rejected'
  // Session events
  | 'session_created'
  | 'session_suspended'
  | 'session_resumed'
  | 'session_cancelled'
  // General error
  | 'error';

export interface PipelineEvent {
  id: string;
  type: EventType;
  runId: string;
  timestamp: number;
  agentRunId?: string;
  nodeId?: string;
  data?: Record<string, unknown>;
}

export interface ModelSelectedData {
  modelId: string;
  providerId: string;
  intelligenceLevel: number;
  reason: string;
  stageId?: string;
}

export interface ModelSwitchedData {
  fromModel: string;
  toModel: string;
  reason: string;
  failureCount?: number;
}

export interface ToolStartData {
  toolName: string;
  toolUseId: string;
  input: unknown;
  isReadOnly: boolean;
}

export interface ToolEndData {
  toolName: string;
  toolUseId: string;
  outputTruncated: boolean;
  outputLength: number;
  isError?: boolean;
}

export interface ConfirmationWaitingData {
  nodeId: string;
  agentRunId?: string;
  title: string;
  content: string;
  artifactPath?: string;
}

export interface ConfirmationResolvedData {
  nodeId: string;
  approved: boolean;
  feedback?: string;
}

export interface ArtifactWrittenData {
  nodeId: string;
  artifactPath: string;
  size: number;
  description?: string;
}
