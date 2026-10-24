import * as fs from 'node:fs';
import * as path from 'node:path';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type { StorageConfig } from '../../config/types.js';

export interface SqlExecutor {
  query<Row extends QueryResultRow = any>(text: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
}

export class PostgresDatabase implements SqlExecutor {
  private readonly pool: Pool;

  constructor(config: StorageConfig) {
    if (!config.databaseUrl) throw new Error('PostgreSQL storage requires DATABASE_URL.');
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      min: config.databasePoolMin,
      max: config.databasePoolMax,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
    });
  }

  async query<Row extends QueryResultRow = any>(text: string, values: unknown[] = []): Promise<{ rows: Row[]; rowCount: number | null }> {
    return this.pool.query<Row>(text, values);
  }

  async transaction<T>(work: (client: PostgresClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(new PostgresClient(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async health(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export class PostgresClient implements SqlExecutor {
  constructor(private readonly client: PoolClient) {}

  async query<Row extends QueryResultRow = any>(text: string, values: unknown[] = []): Promise<{ rows: Row[]; rowCount: number | null }> {
    return this.client.query<Row>(text, values);
  }
}

export async function runStorageMigrations(database: SqlExecutor, migrationsDir = path.join(process.cwd(), 'src', 'storage', 'postgres', 'migrations')): Promise<string[]> {
  await database.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const applied = new Set((await database.query<{ migration_id: string }>('SELECT migration_id FROM schema_migrations')).rows.map(row => row.migration_id));
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
  const completed: string[] = [];
  for (const file of migrationFiles) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    // A migration and its bookkeeping row must either both commit or both roll
    // back. Unit tests may supply a bare executor, while production supplies
    // PostgresDatabase and therefore gets the transaction boundary.
    const apply = async (executor: SqlExecutor): Promise<void> => {
      await executor.query(sql);
      await executor.query('INSERT INTO schema_migrations (migration_id) VALUES ($1)', [file]);
    };
    if (database instanceof PostgresDatabase) await database.transaction(apply);
    else await apply(database);
    completed.push(file);
  }
  return completed;
}
