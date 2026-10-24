import type { AgentState } from '../persistence/agentTypes.js';
import type { AgentRepository } from './contracts/agentRepository.js';
import type { StorageContext } from './contracts/common.js';

/**
 * Serializes one Agent's optimistic writes. AgentEngine changes state many
 * times in a streaming turn, so issuing repository writes concurrently would
 * turn ordinary progress into avoidable version conflicts.
 */
export interface AgentStatePersistence {
  save(state: AgentState): Promise<void>;
  listByRun?(runId: string): Promise<AgentState[]>;
}

export class RepositoryAgentStatePersistence implements AgentStatePersistence {
  private readonly versions = new Map<string, number>();

  constructor(
    private readonly agents: AgentRepository,
    private readonly context: StorageContext,
  ) {}

  async save(state: AgentState): Promise<void> {
    const snapshot = structuredClone(state);
    let version = this.versions.get(snapshot.agentRunId);
    if (version === undefined) {
      const existing = await this.agents.findById(this.context, snapshot.agentRunId);
      if (existing) {
        version = existing.version;
      } else {
        const created = await this.agents.create(this.context, snapshot);
        this.versions.set(snapshot.agentRunId, created.version);
        return;
      }
    }
    const saved = await this.agents.save(this.context, snapshot, version);
    this.versions.set(snapshot.agentRunId, saved.version);
  }

  async listByRun(runId: string): Promise<AgentState[]> {
    const states: AgentState[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.agents.listByRun(this.context, runId, { cursor, limit: 250 });
      for (const record of page.items) {
        this.versions.set(record.value.agentRunId, record.version);
        states.push(structuredClone(record.value));
      }
      cursor = page.nextCursor;
    } while (cursor);
    return states;
  }
}
