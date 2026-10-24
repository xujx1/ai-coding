import type { PipelineGraphState } from '../../workflows/runtime/langgraph/state.js';
import type { StorageContext } from './common.js';

export interface RuntimeCheckpointRecord {
  runId: string;
  checkpointId: string;
  state: PipelineGraphState;
  metadata: {
    workflowId: string;
    workflowVersion: number;
    createdAt: number;
    reason: string;
  };
}

/** Migration-facing checkpoint contract; runtime checkpoints remain an internal graph model. */
export interface RuntimeCheckpointRepository {
  import(ctx: StorageContext, checkpoint: RuntimeCheckpointRecord): Promise<void>;
  findLatest(ctx: StorageContext, runId: string): Promise<RuntimeCheckpointRecord | null>;
}
