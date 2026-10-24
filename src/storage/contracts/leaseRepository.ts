import type { IdempotencyRecord, StorageContext } from './common.js';

export interface Lease {
  key: string;
  ownerId: string;
  fencingToken: number;
  leaseUntil: number;
  heartbeatAt: number;
}

export interface LeaseRepository {
  acquire(ctx: StorageContext, key: string, ownerId: string, ttlMs: number): Promise<Lease | null>;
  renew(ctx: StorageContext, lease: Lease, ttlMs: number): Promise<Lease | null>;
  release(ctx: StorageContext, lease: Lease): Promise<void>;
  find(ctx: StorageContext, key: string): Promise<Lease | null>;
  assertCurrent(ctx: StorageContext, lease: Lease): Promise<void>;
  recordIdempotent<T>(ctx: StorageContext, record: IdempotencyRecord<T>): Promise<IdempotencyRecord<T>>;
  findIdempotent<T>(ctx: StorageContext, scope: string, key: string): Promise<IdempotencyRecord<T> | null>;
}
