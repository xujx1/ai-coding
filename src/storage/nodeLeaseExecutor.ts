import type { StorageContext } from './contracts/common.js';
import type { Lease, LeaseRepository } from './contracts/leaseRepository.js';

export interface NodeLeaseExecutorOptions {
  context: StorageContext;
  leases: LeaseRepository;
  workerId: string;
  ttlMs?: number;
}

/**
 * Holds a PostgreSQL lease only while a node is doing executable work.  A
 * confirmation gate is deliberately outside this boundary: waiting for a
 * person must not reserve a Worker lease indefinitely.
 */
export class NodeLeaseExecutor {
  private readonly ttlMs: number;

  constructor(private readonly options: NodeLeaseExecutorOptions) {
    this.ttlMs = options.ttlMs ?? 30_000;
  }

  async execute<T>(runId: string, nodeId: string, work: (lease: Lease) => Promise<T>): Promise<T> {
    const key = `run:${runId}:node:${nodeId}`;
    let lease = await this.options.leases.acquire(this.options.context, key, this.options.workerId, this.ttlMs);
    if (!lease) throw new NodeLeaseUnavailableError(key);

    let renewalFailure: Error | undefined;
    let renewing = false;
    let renewalInFlight: Promise<void> | undefined;
    const heartbeat = setInterval(() => {
      if (renewing || renewalFailure) return;
      renewing = true;
      renewalInFlight = this.options.leases.renew(this.options.context, lease!, this.ttlMs)
        .then(renewed => {
          if (!renewed) renewalFailure = new NodeLeaseLostError(key);
          else lease = renewed;
        })
        .catch(error => { renewalFailure = error instanceof Error ? error : new Error(String(error)); })
        .finally(() => { renewing = false; });
    }, Math.max(1_000, Math.floor(this.ttlMs / 3)));
    heartbeat.unref?.();

    try {
      const result = await work(lease);
      if (renewalFailure) throw renewalFailure;
      await this.options.leases.assertCurrent(this.options.context, lease);
      return result;
    } finally {
      clearInterval(heartbeat);
      // Never let an already scheduled renewal extend a lease after release.
      await renewalInFlight;
      await this.options.leases.release(this.options.context, lease).catch(() => undefined);
    }
  }
}

export class NodeLeaseUnavailableError extends Error {
  constructor(readonly key: string) {
    super(`Workflow node lease '${key}' is held by another Worker.`);
    this.name = 'NodeLeaseUnavailableError';
  }
}

export class NodeLeaseLostError extends Error {
  constructor(readonly key: string) {
    super(`Workflow node lease '${key}' was lost during execution.`);
    this.name = 'NodeLeaseLostError';
  }
}
