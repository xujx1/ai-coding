import type { AgentRepository } from './agentRepository.js';
import type { ArtifactRepository } from './artifactStore.js';
import type { StorageContext } from './common.js';
import type { EventRepository } from './eventRepository.js';
import type { LeaseRepository } from './leaseRepository.js';
import type { LifecycleRepository } from './lifecycleRepository.js';
import type { StorageMigrationRepository } from './migrationRepository.js';
import type { RunRepository } from './runRepository.js';
import type { WorkflowRepository } from './workflowRepository.js';
import type { RuntimeCheckpointRepository } from './checkpointRepository.js';

export interface StorageRepositories {
  runs: RunRepository;
  agents: AgentRepository;
  lifecycle: LifecycleRepository;
  migrations: StorageMigrationRepository;
  events: EventRepository;
  workflows: WorkflowRepository;
  artifacts: ArtifactRepository;
  leases: LeaseRepository;
  checkpoints: RuntimeCheckpointRepository;
}

export interface UnitOfWork {
  transaction<T>(ctx: StorageContext, work: (repositories: StorageRepositories) => Promise<T>): Promise<T>;
}
