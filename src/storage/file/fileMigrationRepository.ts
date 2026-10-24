import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfig } from '../../config/index.js';
import type { StorageContext } from '../contracts/common.js';
import type { StorageMigrationRecord, StorageMigrationRepository } from '../contracts/migrationRepository.js';

/** Compatibility record store for local migration rehearsals; never production authority. */
export class FileMigrationRepository implements StorageMigrationRepository {
  async find(ctx: StorageContext, sourceRunId: string, sourceChecksum: string): Promise<StorageMigrationRecord | null> {
    return read().find(item => item.tenantId === ctx.tenantId && item.sourceRunId === sourceRunId && item.sourceChecksum === sourceChecksum)?.record ?? null;
  }

  async record(ctx: StorageContext, record: StorageMigrationRecord): Promise<StorageMigrationRecord> {
    const entries = read();
    const index = entries.findIndex(item => item.tenantId === ctx.tenantId && item.sourceRunId === record.sourceRunId && item.sourceChecksum === record.sourceChecksum);
    const value = { tenantId: ctx.tenantId, sourceRunId: record.sourceRunId, sourceChecksum: record.sourceChecksum, record };
    if (index >= 0) entries[index] = value;
    else entries.push(value);
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(entries, null, 2), 'utf8');
    return record;
  }
}

interface Entry { tenantId: string; sourceRunId: string; sourceChecksum: string; record: StorageMigrationRecord; }

function file(): string { return path.join(getConfig().runtimeDir, 'storage-migrations.json'); }
function read(): Entry[] {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')) as Entry[]; }
  catch { return []; }
}
