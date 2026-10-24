import { ConcurrentModificationError } from './contracts/common.js';

export interface StorageMetricSnapshot {
  counters: Record<string, number>;
  latencyMs: Record<string, { count: number; total: number; max: number }>;
}

/**
 * Small dependency-free metrics registry. A deployment may scrape the snapshot
 * endpoint or adapt this boundary to its metrics backend without coupling
 * repositories to a concrete observability SDK.
 */
export class StorageMetrics {
  private readonly counters = new Map<string, number>();
  private readonly latencyMs = new Map<string, { count: number; total: number; max: number }>();

  increment(name: string, amount = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  observeLatency(name: string, durationMs: number): void {
    const current = this.latencyMs.get(name) ?? { count: 0, total: 0, max: 0 };
    current.count += 1;
    current.total += durationMs;
    current.max = Math.max(current.max, durationMs);
    this.latencyMs.set(name, current);
  }

  snapshot(): StorageMetricSnapshot {
    return {
      counters: Object.fromEntries(this.counters),
      latencyMs: Object.fromEntries([...this.latencyMs].map(([name, value]) => [name, { ...value }])),
    };
  }

  reset(): void { this.counters.clear(); this.latencyMs.clear(); }
}

const storageMetrics = new StorageMetrics();

export function getStorageMetrics(): StorageMetrics { return storageMetrics; }

export async function observeStorageOperation<T>(component: string, operation: string, work: () => Promise<T>): Promise<T> {
  const metric = `storage_${component}_${operation}`;
  const startedAt = Date.now();
  try {
    const result = await work();
    storageMetrics.increment(`${metric}_total`);
    return result;
  } catch (error) {
    storageMetrics.increment(`${metric}_errors_total`);
    if (error instanceof ConcurrentModificationError) storageMetrics.increment('storage_version_conflicts_total');
    throw error;
  } finally {
    storageMetrics.observeLatency(`${metric}_latency_ms`, Date.now() - startedAt);
  }
}
