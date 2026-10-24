import * as assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';
import { PostgresDatabase, runStorageMigrations } from '../storage/postgres/database.js';
import { PostgresLeaseRepository } from '../storage/postgres/postgresLeaseRepository.js';
import { clearStorageLogRecords, getStorageLogRecords } from '../storage/structuredLogging.js';

const databaseUrl = process.env.DATABASE_URL;

test('PostgreSQL lease fencing permits one Worker, transfers expired work, and rejects stale completion', { skip: !databaseUrl }, async () => {
  const database = new PostgresDatabase({ ...DEFAULT_STORAGE_CONFIG, databaseUrl, databaseSsl: false });
  const ctx = { tenantId: `lease-coordination-${Date.now()}` };
  const key = 'run:lease-test:node:implementation';
  const leases = new PostgresLeaseRepository(database);
  await runStorageMigrations(database);

  try {
    clearStorageLogRecords();
    const competing = await Promise.all([
      leases.acquire(ctx, key, 'worker-a', 30_000),
      leases.acquire(ctx, key, 'worker-b', 30_000),
    ]);
    const winner = competing.find((lease): lease is NonNullable<typeof lease> => lease !== null);
    assert.ok(winner);
    assert.equal(competing.filter(Boolean).length, 1);

    const expiryKey = `${key}:expiry`;
    const expired = await leases.acquire(ctx, expiryKey, 'worker-expired', 10);
    assert.ok(expired);
    await new Promise<void>(resolve => setTimeout(resolve, 30));
    const takeover = await leases.acquire(ctx, expiryKey, 'worker-takeover', 30_000);
    assert.ok(takeover);
    assert.ok(takeover.fencingToken > expired.fencingToken);
    await assert.rejects(() => leases.assertCurrent(ctx, expired), /no longer current/);
    await leases.assertCurrent(ctx, takeover);
    const stale = getStorageLogRecords().find(record => record.event === 'storage_lease_stale');
    assert.equal(stale?.workerId, 'worker-expired');
    assert.equal(stale?.fencingToken, expired.fencingToken);
  } finally {
    await database.query('DELETE FROM execution_leases WHERE tenant_id = $1', [ctx.tenantId]);
    await database.close();
  }
});

test('transactional fencing validation locks the lease row until terminal commit finishes', { skip: !databaseUrl }, async () => {
  const database = new PostgresDatabase({ ...DEFAULT_STORAGE_CONFIG, databaseUrl, databaseSsl: false });
  const ctx = { tenantId: `lease-commit-race-${Date.now()}-${process.pid}` };
  const key = 'run:lease-race:node:archive';
  const leases = new PostgresLeaseRepository(database);
  await runStorageMigrations(database);
  let releaseTransaction!: () => void;
  const holdTransaction = new Promise<void>(resolve => { releaseTransaction = resolve; });
  let validationLocked!: () => void;
  const validationAcquired = new Promise<void>(resolve => { validationLocked = resolve; });

  try {
    const original = await leases.acquire(ctx, key, 'worker-original', 80);
    assert.ok(original);
    const terminalTransaction = database.transaction(async client => {
      const transactionalLeases = new PostgresLeaseRepository(client);
      await transactionalLeases.assertCurrent(ctx, original);
      validationLocked();
      await holdTransaction;
      // Represents the remaining state/lifecycle/event/outbox writes before
      // the transaction commits and releases the lease-row lock.
      await client.query('SELECT 1');
    });

    await validationAcquired;
    await new Promise(resolve => setTimeout(resolve, 120));
    let takeoverSettled = false;
    const takeoverAttempt = leases.acquire(ctx, key, 'worker-takeover', 30_000)
      .then(value => { takeoverSettled = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(takeoverSettled, false, 'takeover must wait for the terminal transaction row lock');

    releaseTransaction();
    await terminalTransaction;
    const takeover = await takeoverAttempt;
    assert.ok(takeover);
    assert.ok(takeover.fencingToken > original.fencingToken);
    await assert.rejects(() => leases.assertCurrent(ctx, original), /no longer current/);
  } finally {
    releaseTransaction();
    await database.query('DELETE FROM execution_leases WHERE tenant_id = $1', [ctx.tenantId]);
    await database.close();
  }
});
