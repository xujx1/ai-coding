import type { ArtifactObject, ArtifactRepository } from '../contracts/artifactStore.js';
import type { Page, PageRequest, StorageContext } from '../contracts/common.js';
import type { SqlExecutor } from './database.js';

interface ArtifactRow {
  artifact_id: string;
  run_id: string;
  kind: string;
  storage_key: string;
  content_type: string;
  size_bytes: string | number;
  sha256: string;
  producer_node_id: string | null;
  retention_class: ArtifactObject['retentionClass'];
  committed: boolean;
  created_at: Date;
}

export class PostgresArtifactRepository implements ArtifactRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async save(ctx: StorageContext, artifact: ArtifactObject): Promise<ArtifactObject> {
    const result = await this.sql.query<ArtifactRow>(`
      INSERT INTO artifact_refs (
        tenant_id, artifact_id, run_id, kind, storage_key, content_type, size_bytes, sha256,
        producer_node_id, retention_class, committed, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,to_timestamp($12 / 1000.0))
      ON CONFLICT (tenant_id, artifact_id) DO UPDATE SET
        kind = EXCLUDED.kind, storage_key = EXCLUDED.storage_key, content_type = EXCLUDED.content_type,
        size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256, producer_node_id = EXCLUDED.producer_node_id,
        retention_class = EXCLUDED.retention_class, committed = EXCLUDED.committed
      RETURNING *
    `, [ctx.tenantId, artifact.artifactId, artifact.runId, artifact.kind, artifact.storageKey, artifact.contentType,
      artifact.sizeBytes, artifact.sha256, artifact.producerNodeId ?? null, artifact.retentionClass, artifact.committed, artifact.createdAt]);
    return rowToArtifact(ctx, result.rows[0]);
  }

  async findById(ctx: StorageContext, artifactId: string): Promise<ArtifactObject | null> {
    const result = await this.sql.query<ArtifactRow>('SELECT * FROM artifact_refs WHERE tenant_id = $1 AND artifact_id = $2', [ctx.tenantId, artifactId]);
    return result.rows[0] ? rowToArtifact(ctx, result.rows[0]) : null;
  }

  async listByRun(ctx: StorageContext, runId: string, page: PageRequest = {}): Promise<Page<ArtifactObject>> {
    const limit = Math.max(1, Math.min(page.limit ?? 100, 500));
    const offset = Number.parseInt(page.cursor ?? '0', 10) || 0;
    const result = await this.sql.query<ArtifactRow & { total_count: string | number }>(`
      SELECT *, count(*) OVER() AS total_count FROM artifact_refs
      WHERE tenant_id = $1 AND run_id = $2 ORDER BY created_at DESC, artifact_id ASC LIMIT $3 OFFSET $4
    `, [ctx.tenantId, runId, limit, offset]);
    const items = result.rows.map(row => rowToArtifact(ctx, row));
    const nextOffset = offset + items.length;
    return { items, nextCursor: nextOffset < Number(result.rows[0]?.total_count ?? 0) ? String(nextOffset) : undefined };
  }

  async markCommitted(ctx: StorageContext, artifactId: string): Promise<ArtifactObject> {
    const result = await this.sql.query<ArtifactRow>(`
      UPDATE artifact_refs SET committed = TRUE WHERE tenant_id = $1 AND artifact_id = $2 RETURNING *
    `, [ctx.tenantId, artifactId]);
    if (!result.rows[0]) throw new Error(`Artifact '${artifactId}' was not found.`);
    return rowToArtifact(ctx, result.rows[0]);
  }
}

function rowToArtifact(ctx: StorageContext, row: ArtifactRow): ArtifactObject {
  return {
    artifactId: row.artifact_id, runId: row.run_id, tenantId: ctx.tenantId, kind: row.kind,
    storageKey: row.storage_key, contentType: row.content_type, sizeBytes: Number(row.size_bytes), sha256: row.sha256,
    producerNodeId: row.producer_node_id ?? undefined, retentionClass: row.retention_class,
    committed: row.committed, createdAt: row.created_at.getTime(),
  };
}
