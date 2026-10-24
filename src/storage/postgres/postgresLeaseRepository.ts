import type { IdempotencyRecord, StorageContext } from '../contracts/common.js';
import { IdempotencyConflictError, StorageError } from '../contracts/common.js';
import type { Lease, LeaseRepository } from '../contracts/leaseRepository.js';
import type { SqlExecutor } from './database.js';
import { logStorageEvent } from '../structuredLogging.js';

interface LeaseRow {
  lease_key: string;
  owner_id: string;
  fencing_token: string | number;
  lease_until: Date;
  heartbeat_at: Date;
}

interface IdempotencyRow<T> {
  scope: string;
  idempotency_key: string;
  payload_hash: string;
  result: T;
  created_at: Date;
}

/** PostgreSQL is the sole lock and fencing authority. */
export class PostgresLeaseRepository implements LeaseRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async acquire(ctx: StorageContext, key: string, ownerId: string, ttlMs: number): Promise<Lease | null> {
    const result = await this.sql.query<LeaseRow>(`
      INSERT INTO execution_leases (tenant_id, lease_key, owner_id, fencing_token, lease_until, heartbeat_at)
      VALUES ($1, $2, $3, 1, now() + ($4 * interval '1 millisecond'), now())
      ON CONFLICT (tenant_id, lease_key) DO UPDATE SET
        owner_id = EXCLUDED.owner_id,
        fencing_token = execution_leases.fencing_token + 1,
        lease_until = now() + ($4 * interval '1 millisecond'),
        heartbeat_at = now()
      WHERE execution_leases.lease_until <= now()
      RETURNING lease_key, owner_id, fencing_token, lease_until, heartbeat_at
    `, [ctx.tenantId, key, ownerId, validTtl(ttlMs)]);
    const lease = result.rows[0] ? toLease(result.rows[0]) : null;
    logStorageEvent('storage_lease_acquire', { tenantId: ctx.tenantId, transactionId: ctx.transactionId, workerId: ownerId, leaseKey: key, fencingToken: lease?.fencingToken, acquired: Boolean(lease) });
    return lease;
  }

  async renew(ctx: StorageContext, lease: Lease, ttlMs: number): Promise<Lease | null> {
    const result = await this.sql.query<LeaseRow>(`
      UPDATE execution_leases
      SET lease_until = now() + ($5 * interval '1 millisecond'), heartbeat_at = now()
      WHERE tenant_id = $1 AND lease_key = $2 AND owner_id = $3 AND fencing_token = $4 AND lease_until > now()
      RETURNING lease_key, owner_id, fencing_token, lease_until, heartbeat_at
    `, [ctx.tenantId, lease.key, lease.ownerId, lease.fencingToken, validTtl(ttlMs)]);
    const renewed = result.rows[0] ? toLease(result.rows[0]) : null;
    logStorageEvent('storage_lease_renew', { tenantId: ctx.tenantId, transactionId: ctx.transactionId, workerId: lease.ownerId, leaseKey: lease.key, fencingToken: lease.fencingToken, renewed: Boolean(renewed) });
    return renewed;
  }

  async release(ctx: StorageContext, lease: Lease): Promise<void> {
    await this.sql.query(`
      UPDATE execution_leases SET lease_until = now(), heartbeat_at = now()
      WHERE tenant_id = $1 AND lease_key = $2 AND owner_id = $3 AND fencing_token = $4
    `, [ctx.tenantId, lease.key, lease.ownerId, lease.fencingToken]);
    logStorageEvent('storage_lease_released', { tenantId: ctx.tenantId, transactionId: ctx.transactionId, workerId: lease.ownerId, leaseKey: lease.key, fencingToken: lease.fencingToken });
  }

  async find(ctx: StorageContext, key: string): Promise<Lease | null> {
    const result = await this.sql.query<LeaseRow>(`
      SELECT lease_key, owner_id, fencing_token, lease_until, heartbeat_at FROM execution_leases
      WHERE tenant_id = $1 AND lease_key = $2
    `, [ctx.tenantId, key]);
    return result.rows[0] ? toLease(result.rows[0]) : null;
  }

  async assertCurrent(ctx: StorageContext, lease: Lease): Promise<void> {
    // NodeTransitionService calls this through the transaction-scoped
    // repository. Locking the lease row closes the check/commit race: an
    // expired-lease takeover must wait until the terminal transaction commits
    // or rolls back, so a new fencing token cannot appear between validation
    // and the authoritative state write.
    const result = await this.sql.query('SELECT 1 FROM execution_leases WHERE tenant_id = $1 AND lease_key = $2 AND owner_id = $3 AND fencing_token = $4 AND lease_until > now() FOR UPDATE',
      [ctx.tenantId, lease.key, lease.ownerId, lease.fencingToken]);
    if (!result.rowCount) {
      logStorageEvent('storage_lease_stale', { tenantId: ctx.tenantId, transactionId: ctx.transactionId, workerId: lease.ownerId, leaseKey: lease.key, fencingToken: lease.fencingToken }, 'warn');
      throw new StorageError(`Lease '${lease.key}' is no longer current.`);
    }
  }

  async recordIdempotent<T>(ctx: StorageContext, record: IdempotencyRecord<T>): Promise<IdempotencyRecord<T>> {
    const prior = await this.findIdempotent<T>(ctx, record.scope, record.key);
    if (prior) {
      if (prior.payloadHash !== record.payloadHash) throw new IdempotencyConflictError(record.scope, record.key);
      return prior;
    }
    const inserted = await this.sql.query<IdempotencyRow<T>>(`
      INSERT INTO idempotency_records (tenant_id, scope, idempotency_key, payload_hash, result, created_at)
      VALUES ($1,$2,$3,$4,$5,to_timestamp($6 / 1000.0))
      ON CONFLICT (tenant_id, scope, idempotency_key) DO NOTHING
      RETURNING scope, idempotency_key, payload_hash, result, created_at
    `, [ctx.tenantId, record.scope, record.key, record.payloadHash, JSON.stringify(record.result), record.createdAt]);
    if (inserted.rows[0]) return toIdempotency(inserted.rows[0]);
    return this.recordIdempotent(ctx, record);
  }

  async findIdempotent<T>(ctx: StorageContext, scope: string, key: string): Promise<IdempotencyRecord<T> | null> {
    const result = await this.sql.query<IdempotencyRow<T>>(`
      SELECT scope, idempotency_key, payload_hash, result, created_at FROM idempotency_records
      WHERE tenant_id = $1 AND scope = $2 AND idempotency_key = $3
    `, [ctx.tenantId, scope, key]);
    return result.rows[0] ? toIdempotency(result.rows[0]) : null;
  }
}

function validTtl(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new StorageError('Lease TTL must be a positive finite number.');
  return Math.floor(value);
}

function toLease(row: LeaseRow): Lease {
  return { key: row.lease_key, ownerId: row.owner_id, fencingToken: Number(row.fencing_token), leaseUntil: row.lease_until.getTime(), heartbeatAt: row.heartbeat_at.getTime() };
}

function toIdempotency<T>(row: IdempotencyRow<T>): IdempotencyRecord<T> {
  return { scope: row.scope, key: row.idempotency_key, payloadHash: row.payload_hash, result: row.result, createdAt: row.created_at.getTime() };
}
