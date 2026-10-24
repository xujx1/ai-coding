import type { StorageRepositories } from './contracts/unitOfWork.js';
import type { StorageContext } from './contracts/common.js';
import { checksum } from './migration/canonical.js';
import { getStorageMetrics } from './metrics.js';

const MUTATIONS: Record<keyof StorageRepositories, ReadonlySet<string>> = {
  runs: new Set(['create', 'save', 'softDelete']),
  agents: new Set(['create', 'save', 'savePlan']),
  lifecycle: new Set(['create', 'save']),
  migrations: new Set(['record']),
  events: new Set(['append']),
  workflows: new Set(['save']),
  artifacts: new Set(['save', 'markCommitted']),
  leases: new Set(),
  checkpoints: new Set(['import']),
};

/** Mirrors successful file writes without changing the authoritative read path. */
export class ShadowWriteCoordinator {
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly primary: StorageRepositories,
    private readonly shadow: StorageRepositories,
  ) {}

  repositories(): StorageRepositories {
    return Object.fromEntries((Object.keys(this.primary) as Array<keyof StorageRepositories>).map(component => {
      const primaryRepository = this.primary[component] as unknown as Record<string | symbol, unknown>;
      const shadowRepository = this.shadow[component] as unknown as Record<string | symbol, unknown>;
      return [component, new Proxy(primaryRepository, {
        get: (target, property, receiver) => {
          const value = Reflect.get(target, property, receiver);
          if (typeof property !== 'string' || typeof value !== 'function') return value;
          return async (...args: unknown[]) => {
            const result = await value.apply(target, args);
            if (MUTATIONS[component].has(property)) {
              this.enqueue(component, property, shadowRepository, args);
            }
            return result;
          };
        },
      })];
    })) as unknown as StorageRepositories;
  }

  async drain(): Promise<void> { await this.pending; }

  private enqueue(
    component: keyof StorageRepositories,
    operation: string,
    repository: Record<string | symbol, unknown>,
    args: unknown[],
  ): void {
    const shadowArgs = [...args];
    if (shadowArgs[0] && typeof shadowArgs[0] === 'object') {
      shadowArgs[0] = { ...(shadowArgs[0] as StorageContext), preserveTimestamps: true };
    }
    this.pending = this.pending.then(async () => {
      try {
        const method = repository[operation];
        if (typeof method !== 'function') throw new Error(`Shadow repository does not implement ${String(component)}.${operation}.`);
        await method.apply(repository, shadowArgs);
        getStorageMetrics().increment('storage_shadow_write_total');
      } catch (error) {
        getStorageMetrics().increment('storage_shadow_write_errors_total');
        console.error(JSON.stringify({
          event: 'storage_shadow_write_failed', component, operation,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    });
  }
}

export interface ShadowComparison {
  runId: string;
  ready: boolean;
  sourceChecksum: string;
  shadowChecksum: string;
  mismatches: string[];
}

export async function compareShadowRun(
  context: StorageContext,
  runId: string,
  source: StorageRepositories,
  shadow: StorageRepositories,
): Promise<ShadowComparison> {
  const [left, right] = await Promise.all([
    snapshot(source, context, runId), snapshot(shadow, context, runId),
  ]);
  const mismatches = (Object.keys(left) as Array<keyof typeof left>)
    .filter(component => checksum(left[component]) !== checksum(right[component]));
  if (mismatches.length) getStorageMetrics().increment('storage_shadow_mismatch_total', mismatches.length);
  else getStorageMetrics().increment('storage_shadow_match_total');
  return {
    runId, ready: mismatches.length === 0,
    sourceChecksum: checksum(left), shadowChecksum: checksum(right), mismatches,
  };
}

async function snapshot(repositories: StorageRepositories, context: StorageContext, runId: string) {
  const [run, agents, lifecycle, events, artifacts, checkpoint] = await Promise.all([
    repositories.runs.findById(context, runId),
    allPages(cursor => repositories.agents.listByRun(context, runId, { cursor, limit: 500 })),
    repositories.lifecycle.findByRunId(context, runId),
    allPages(cursor => repositories.events.listByRun(context, runId, { cursor, limit: 500 })),
    allPages(cursor => repositories.artifacts.listByRun(context, runId, { cursor, limit: 500 })),
    repositories.checkpoints.findLatest(context, runId),
  ]);
  return {
    run: run?.value ?? null,
    agents: agents.map(item => item.value).sort((a, b) => a.agentRunId.localeCompare(b.agentRunId)),
    lifecycle: lifecycle?.value ?? null,
    events: events.map(({ tenantId: _tenantId, sequence: _sequence, ...event }) => event),
    artifacts: artifacts.sort((a, b) => a.artifactId.localeCompare(b.artifactId)),
    checkpoint: checkpoint?.state ?? null,
  };
}

async function allPages<T>(read: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await read(cursor);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}
