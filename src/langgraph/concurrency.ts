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
  llm: AsyncSemaphore;
  tests: AsyncSemaphore;
}

export function createRuntimeSemaphores(config: {
  branchConcurrency: number;
  llmConcurrency: number;
  testConcurrency: number;
}): RuntimeSemaphores {
  return {
    branches: new AsyncSemaphore(config.branchConcurrency),
    llm: new AsyncSemaphore(config.llmConcurrency),
    tests: new AsyncSemaphore(config.testConcurrency),
  };
}
