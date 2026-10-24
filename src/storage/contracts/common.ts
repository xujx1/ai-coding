export type TenantId = string;

export interface StorageContext {
  tenantId: TenantId;
  transactionId?: string;
  /** Migration/shadow-only flag that retains canonical historical timestamps. */
  preserveTimestamps?: boolean;
}

export interface Versioned<T> {
  value: T;
  version: number;
}

export interface PageRequest {
  limit?: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export interface IdempotencyKey {
  key: string;
  payloadHash: string;
}

export interface IdempotencyRecord<T = unknown> extends IdempotencyKey {
  scope: string;
  result: T;
  createdAt: number;
}

export class StorageError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}

export class ConcurrentModificationError extends StorageError {
  constructor(readonly aggregate: string, readonly id: string) {
    super(`Concurrent modification detected for ${aggregate} '${id}'.`);
    this.name = 'ConcurrentModificationError';
  }
}

export class IdempotencyConflictError extends StorageError {
  constructor(readonly scope: string, readonly key: string) {
    super(`Idempotency key '${key}' was reused with a different payload in scope '${scope}'.`);
    this.name = 'IdempotencyConflictError';
  }
}
