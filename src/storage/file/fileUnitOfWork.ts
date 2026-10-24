import type { StorageContext } from '../contracts/common.js';
import type { StorageRepositories, UnitOfWork } from '../contracts/unitOfWork.js';

/**
 * File mode has no cross-file transaction. It remains a compatibility adapter
 * for local development; production code uses the PostgreSQL UnitOfWork.
 */
export class FileUnitOfWork implements UnitOfWork {
  constructor(private readonly repositories: StorageRepositories) {}

  async transaction<T>(_ctx: StorageContext, work: (repositories: StorageRepositories) => Promise<T>): Promise<T> {
    return work(this.repositories);
  }
}
