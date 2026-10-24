import type { RuntimeCheckpointRecord, RuntimeCheckpointRepository } from '../contracts/checkpointRepository.js';
import type { StorageContext } from '../contracts/common.js';
import { readLatestFileCheckpoint, writeFileCheckpoint } from '../../workflows/runtime/langgraph/checkpointer.js';

export class FileCheckpointRepository implements RuntimeCheckpointRepository {
  async import(_ctx: StorageContext, checkpoint: RuntimeCheckpointRecord): Promise<void> {
    writeFileCheckpoint(checkpoint.runId, checkpoint.state, checkpoint.metadata.reason);
  }

  async findLatest(_ctx: StorageContext, runId: string): Promise<RuntimeCheckpointRecord | null> {
    const checkpoint = readLatestFileCheckpoint(runId);
    if (!checkpoint) return null;
    return {
      runId,
      checkpointId: checkpoint.id,
      state: checkpoint.state,
      metadata: checkpoint.metadata,
    };
  }
}
