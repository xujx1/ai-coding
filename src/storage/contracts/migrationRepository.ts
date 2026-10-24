import type { StorageContext } from './common.js';

export type StorageMigrationStatus = 'completed' | 'failed' | 'skipped';

export interface StorageMigrationRecord {
  sourceRunId: string;
  sourceChecksum: string;
  targetSchemaVersion: string;
  status: StorageMigrationStatus;
  diagnostics: string[];
  migratedAt: number;
}

export interface StorageMigrationRepository {
  find(ctx: StorageContext, sourceRunId: string, sourceChecksum: string): Promise<StorageMigrationRecord | null>;
  record(ctx: StorageContext, record: StorageMigrationRecord): Promise<StorageMigrationRecord>;
}
