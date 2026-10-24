import type { StorageContext } from '../contracts/common.js';
import type { StorageMigrationRecord, StorageMigrationRepository } from '../contracts/migrationRepository.js';
import type { SqlExecutor } from './database.js';

interface Row {
  source_run_id: string;
  source_checksum: string;
  target_schema_version: string;
  status: StorageMigrationRecord['status'];
  diagnostics: string[] | null;
  migrated_at: Date;
}

export class PostgresMigrationRepository implements StorageMigrationRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async find(ctx: StorageContext, sourceRunId: string, sourceChecksum: string): Promise<StorageMigrationRecord | null> {
    const result = await this.sql.query<Row>(`SELECT source_run_id, source_checksum, target_schema_version, status, diagnostics, migrated_at
      FROM storage_migrations WHERE tenant_id = $1 AND source_run_id = $2 AND source_checksum = $3`, [ctx.tenantId, sourceRunId, sourceChecksum]);
    return result.rows[0] ? record(result.rows[0]) : null;
  }

  async record(ctx: StorageContext, value: StorageMigrationRecord): Promise<StorageMigrationRecord> {
    const result = await this.sql.query<Row>(`INSERT INTO storage_migrations
      (tenant_id, source_run_id, source_checksum, target_schema_version, status, diagnostics, migrated_at)
      VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7 / 1000.0))
      ON CONFLICT (tenant_id, source_run_id, source_checksum) DO UPDATE SET
        target_schema_version = EXCLUDED.target_schema_version, status = EXCLUDED.status,
        diagnostics = EXCLUDED.diagnostics, migrated_at = EXCLUDED.migrated_at
      RETURNING source_run_id, source_checksum, target_schema_version, status, diagnostics, migrated_at`,
    [ctx.tenantId, value.sourceRunId, value.sourceChecksum, value.targetSchemaVersion, value.status, JSON.stringify(value.diagnostics), value.migratedAt]);
    return record(result.rows[0]);
  }
}

function record(row: Row): StorageMigrationRecord {
  return { sourceRunId: row.source_run_id, sourceChecksum: row.source_checksum, targetSchemaVersion: row.target_schema_version, status: row.status, diagnostics: row.diagnostics ?? [], migratedAt: row.migrated_at.getTime() };
}
