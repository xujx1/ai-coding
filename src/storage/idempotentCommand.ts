import { checksum } from './migration/canonical.js';
import type { StorageContext } from './contracts/common.js';
import { IdempotencyConflictError } from './contracts/common.js';
import type { LeaseRepository } from './contracts/leaseRepository.js';
import type { UnitOfWork } from './contracts/unitOfWork.js';
import { NodeLeaseExecutor } from './nodeLeaseExecutor.js';

export interface IdempotentCommandInput<T> {
  scope: string;
  key: string;
  payload: unknown;
  execute: () => Promise<T>;
}

export interface IdempotentCommandResult<T> {
  result: T;
  replayed: boolean;
}

/**
 * Serializes a production workflow command by its client-supplied stable key,
 * then records the committed response for retry replay. Node-result commands
 * use NodeTransitionService; this class covers HTTP/runtime commands.
 */
export class IdempotentCommandExecutor {
  private readonly leases: NodeLeaseExecutor;

  constructor(
    leaseRepository: LeaseRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly context: StorageContext,
    workerId: string,
  ) {
    this.leases = new NodeLeaseExecutor({
      context,
      leases: leaseRepository,
      workerId,
      ttlMs: 30_000,
    });
  }

  async execute<T>(input: IdempotentCommandInput<T>): Promise<IdempotentCommandResult<T>> {
    const key = validateKey(input.key);
    const payloadHash = checksum(input.payload);
    const prior = await this.find<T>(input.scope, key);
    if (prior) return replay(input.scope, key, payloadHash, prior.payloadHash, prior.result);

    const commandIdentity = checksum({ scope: input.scope, key }).slice(0, 40);
    return this.leases.execute('workflow-commands', commandIdentity, async () => {
      const afterLock = await this.find<T>(input.scope, key);
      if (afterLock) return replay(input.scope, key, payloadHash, afterLock.payloadHash, afterLock.result);

      const result = await input.execute();
      const recorded = await this.unitOfWork.transaction(this.context, repositories =>
        repositories.leases.recordIdempotent(this.context, {
          scope: input.scope,
          key,
          payloadHash,
          result,
          createdAt: Date.now(),
        }));
      if (recorded.payloadHash !== payloadHash) {
        throw new IdempotencyConflictError(input.scope, key);
      }
      return { result: recorded.result, replayed: false };
    });
  }

  private find<T>(scope: string, key: string) {
    return this.unitOfWork.transaction(this.context, repositories =>
      repositories.leases.findIdempotent<T>(this.context, scope, key));
  }
}

function replay<T>(scope: string, key: string, payloadHash: string, recordedHash: string, result: T): IdempotentCommandResult<T> {
  if (recordedHash !== payloadHash) throw new IdempotencyConflictError(scope, key);
  return { result, replayed: true };
}

function validateKey(value: string): string {
  const key = value.trim();
  if (!key || key.length > 200 || /[\r\n\0]/.test(key)) {
    throw new Error('Idempotency-Key must contain 1-200 safe characters.');
  }
  return key;
}
