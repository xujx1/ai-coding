export class AsyncSemaphore {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`Semaphore limit must be a positive integer, got ${limit}`);
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get limitCount(): number {
    return this.limit;
  }

  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

export interface RuntimeSemaphores {
  branches: AsyncSemaphore;
  model: AsyncSemaphore;
  command: AsyncSemaphore;
  browser: AsyncSemaphore;
  tools: Record<string, AsyncSemaphore>;
  /** @deprecated use model */
  llm: AsyncSemaphore;
  /** @deprecated use command */
  tests: AsyncSemaphore;
}

export function createRuntimeSemaphores(config: {
  branchConcurrency: number;
  modelConcurrency?: number;
  commandConcurrency?: number;
  browserConcurrency?: number;
  toolConcurrency?: Record<string, number>;
  llmConcurrency?: number;
  testConcurrency?: number;
}): RuntimeSemaphores {
  const model = new AsyncSemaphore(config.modelConcurrency ?? config.llmConcurrency ?? 2);
  const command = new AsyncSemaphore(config.commandConcurrency ?? config.testConcurrency ?? 2);
  const tools = Object.fromEntries(
    Object.entries(config.toolConcurrency ?? {}).map(([name, limit]) => [name, new AsyncSemaphore(limit)])
  );
  return {
    branches: new AsyncSemaphore(config.branchConcurrency),
    model,
    command,
    browser: new AsyncSemaphore(config.browserConcurrency ?? 1),
    tools,
    llm: model,
    tests: command,
  };
}

export type PlanResourceSemaphores = RuntimeSemaphores;

export interface PlanResourceLimits {
  branchConcurrency: number;
  modelConcurrency: number;
  commandConcurrency: number;
  browserConcurrency: number;
  toolConcurrency?: Record<string, number>;
}

export function createPlanResourceSemaphores(config: Partial<PlanResourceLimits> = {}): PlanResourceSemaphores {
  return createRuntimeSemaphores({
    branchConcurrency: config.branchConcurrency ?? 2,
    modelConcurrency: config.modelConcurrency ?? 2,
    commandConcurrency: config.commandConcurrency ?? 2,
    browserConcurrency: config.browserConcurrency ?? 1,
    toolConcurrency: config.toolConcurrency,
  });
}
