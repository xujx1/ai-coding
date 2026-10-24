import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { Checkpoint, CheckpointMetadata } from '@langchain/langgraph-checkpoint';
import type { RuntimeCheckpointRecord, RuntimeCheckpointRepository } from '../contracts/checkpointRepository.js';
import type { StorageContext } from '../contracts/common.js';
import type { SqlExecutor } from './database.js';

type CheckpointCodec = {
  _dumpCheckpoint(checkpoint: Checkpoint): Record<string, unknown>;
  _dumpBlobs(threadId: string, namespace: string, values: Record<string, unknown>, versions: Record<string, string>): Promise<Array<[string, string, string, string, string, Uint8Array | undefined]>>;
  _dumpMetadata(metadata: CheckpointMetadata): Promise<Record<string, unknown>>;
  _loadBlobs(values: Array<[Uint8Array, Uint8Array, Uint8Array]>): Promise<Record<string, unknown>>;
};

/** Writes migration checkpoints directly into the official LangGraph schema and current transaction. */
export class PostgresCheckpointRepository implements RuntimeCheckpointRepository {
  private readonly codec = new PostgresSaver({} as never, undefined, { schema: 'ai_coding_langgraph' }) as unknown as CheckpointCodec;

  constructor(private readonly sql: SqlExecutor) {}

  async import(_ctx: StorageContext, record: RuntimeCheckpointRecord): Promise<void> {
    const version = String(record.metadata.createdAt || 1);
    const checkpoint: Checkpoint = {
      v: 1,
      id: record.checkpointId,
      ts: new Date(record.metadata.createdAt).toISOString(),
      channel_values: { graph: record.state },
      channel_versions: { graph: version },
      versions_seen: {},
    };
    const [blobs, metadata] = await Promise.all([
      this.codec._dumpBlobs(record.runId, '', checkpoint.channel_values, checkpoint.channel_versions as Record<string, string>),
      this.codec._dumpMetadata({
        source: 'update', step: -1,
        parents: {},
        migrationSource: 'legacy-file-migration',
        ...record.metadata,
      } as unknown as CheckpointMetadata),
    ]);
    for (const blob of blobs) {
      await this.sql.query(`INSERT INTO ai_coding_langgraph.checkpoint_blobs
        (thread_id, checkpoint_ns, channel, version, type, blob)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (thread_id, checkpoint_ns, channel, version) DO NOTHING`, blob);
    }
    await this.sql.query(`INSERT INTO ai_coding_langgraph.checkpoints
      (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)
      VALUES ($1, '', $2, NULL, $3, $4, $5)
      ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id) DO UPDATE SET
        checkpoint = EXCLUDED.checkpoint, metadata = EXCLUDED.metadata`, [
      record.runId, record.checkpointId, 'json', this.codec._dumpCheckpoint(checkpoint), metadata,
    ]);
  }

  async findLatest(_ctx: StorageContext, runId: string): Promise<RuntimeCheckpointRecord | null> {
    const result = await this.sql.query<{
      checkpoint_id: string;
      checkpoint: Record<string, unknown>;
      metadata: RuntimeCheckpointRecord['metadata'];
      blob_type: string | null;
      blob: Uint8Array | null;
    }>(`SELECT cp.checkpoint_id, cp.checkpoint, cp.metadata,
        bl.type AS blob_type, bl.blob
      FROM ai_coding_langgraph.checkpoints cp
      LEFT JOIN ai_coding_langgraph.checkpoint_blobs bl
        ON bl.thread_id = cp.thread_id AND bl.checkpoint_ns = cp.checkpoint_ns
        AND bl.channel = 'graph'
        AND bl.version = cp.checkpoint -> 'channel_versions' ->> 'graph'
      WHERE cp.thread_id = $1 AND cp.checkpoint_ns = ''
      ORDER BY cp.checkpoint_id DESC LIMIT 1`, [runId]);
    const row = result.rows[0];
    if (!row || !row.blob || !row.blob_type) return null;
    const values = await this.codec._loadBlobs([[
      Buffer.from('graph'), Buffer.from(row.blob_type), row.blob,
    ]]);
    return {
      runId,
      checkpointId: row.checkpoint_id,
      state: values.graph as RuntimeCheckpointRecord['state'],
      metadata: {
        workflowId: String(row.metadata.workflowId),
        workflowVersion: Number(row.metadata.workflowVersion),
        createdAt: Number(row.metadata.createdAt),
        reason: String(row.metadata.reason),
      },
    };
  }
}
