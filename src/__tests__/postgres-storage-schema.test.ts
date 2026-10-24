import * as assert from 'assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import type { QueryResultRow } from 'pg';
import { runStorageMigrations, type SqlExecutor } from '../storage/postgres/database.js';
import { PostgresMigrationRepository } from '../storage/postgres/postgresMigrationRepository.js';

test('initial PostgreSQL migration defines durable state, coordination, and event indexes', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'src/storage/postgres/migrations/001_initial_storage.sql'), 'utf8');
  for (const table of ['runs', 'run_nodes', 'run_projects', 'agent_runs', 'lifecycle_states', 'workflow_definitions', 'run_events', 'artifact_refs', 'execution_leases', 'idempotency_records', 'outbox_events', 'storage_migrations']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(sql, /UNIQUE \(tenant_id, run_id, sequence\)/);
  assert.match(sql, /outbox_events_pending_idx/);
  assert.match(sql, /execution_leases_expiry_idx/);
});

test('migration runner records each migration only once', async () => {
  const applied = new Set<string>();
  const executed: string[] = [];
  const db: SqlExecutor = {
    async query<Row extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
      executed.push(text);
      if (text.startsWith('SELECT migration_id')) return { rows: [...applied].map(migration_id => ({ migration_id })) as unknown as Row[], rowCount: applied.size };
      if (text.startsWith('INSERT INTO schema_migrations')) { applied.add(String(values[0])); return { rows: [] as Row[], rowCount: 1 }; }
      return { rows: [] as Row[], rowCount: 0 };
    },
  };
  const directory = path.join(process.cwd(), 'src/storage/postgres/migrations');
  assert.deepEqual(await runStorageMigrations(db, directory), ['001_initial_storage.sql', '002_outbox_claims.sql', '003_langgraph_checkpoint_import.sql']);
  assert.deepEqual(await runStorageMigrations(db, directory), []);
  assert.ok(executed.some(statement => statement.includes('CREATE TABLE IF NOT EXISTS runs')));
});

test('storage migration records preserve checksum, result, and diagnostics', async () => {
  let saved: any;
  const sql: SqlExecutor = {
    async query<Row extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
      if (text.includes('INSERT INTO storage_migrations')) {
        saved = { source_run_id: values[1], source_checksum: values[2], target_schema_version: values[3], status: values[4], diagnostics: JSON.parse(String(values[5])), migrated_at: new Date(Number(values[6])) };
        return { rows: [saved] as Row[], rowCount: 1 };
      }
      return { rows: saved ? [saved] as Row[] : [], rowCount: saved ? 1 : 0 };
    },
  };
  const repository = new PostgresMigrationRepository(sql);
  const value = await repository.record({ tenantId: 'tenant-a' }, {
    sourceRunId: 'run-a', sourceChecksum: 'checksum-a', targetSchemaVersion: '001_initial_storage',
    status: 'failed', diagnostics: ['bad checkpoint'], migratedAt: 1234,
  });
  assert.deepEqual(value, {
    sourceRunId: 'run-a', sourceChecksum: 'checksum-a', targetSchemaVersion: '001_initial_storage',
    status: 'failed', diagnostics: ['bad checkpoint'], migratedAt: 1234,
  });
  assert.equal((await repository.find({ tenantId: 'tenant-a' }, 'run-a', 'checksum-a'))?.sourceChecksum, 'checksum-a');
});
