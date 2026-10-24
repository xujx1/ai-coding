import { ConcurrentModificationError } from './contracts/common.js';

/** Retries only an optimistic-concurrency conflict after the caller reloads state. */
export async function retryOnConflict<T>(
  work: (attempt: number) => Promise<T>,
  options: { maxAttempts?: number; onConflict?: (attempt: number) => Promise<void> | void } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('maxAttempts must be a positive integer.');
  let last: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try { return await work(attempt); }
    catch (error) {
      last = error;
      if (!(error instanceof ConcurrentModificationError) || attempt === maxAttempts) throw error;
      await options.onConflict?.(attempt);
    }
  }
  throw last;
}
