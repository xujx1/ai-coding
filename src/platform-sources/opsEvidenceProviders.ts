export interface OpsEvidenceQuery {
  appId: string;
  alert: string;
  hints?: string[];
}

export interface OpsEvidenceAvailability {
  available: boolean;
  reason?: string;
}

export interface LogEvidenceProvider<T = unknown> {
  search(query: OpsEvidenceQuery): Promise<T[]>;
  availability(): OpsEvidenceAvailability;
}

export interface KnowledgeEvidenceProvider<T = unknown> {
  search(query: OpsEvidenceQuery): Promise<T[]>;
  availability(): OpsEvidenceAvailability;
}

export interface AlertHistoryRepository<T = unknown> {
  findSimilar(alert: string): Promise<T[]>;
  availability(): OpsEvidenceAvailability;
}

export class InMemoryEvidenceProvider<T> implements LogEvidenceProvider<T>, KnowledgeEvidenceProvider<T> {
  constructor(private readonly results: readonly T[] = []) {}
  async search(_query: OpsEvidenceQuery): Promise<T[]> { return [...this.results]; }
  availability(): OpsEvidenceAvailability { return { available: true }; }
}

export class InMemoryAlertHistoryRepository<T> implements AlertHistoryRepository<T> {
  constructor(private readonly results: readonly T[] = []) {}
  async findSimilar(_alert: string): Promise<T[]> { return [...this.results]; }
  availability(): OpsEvidenceAvailability { return { available: true }; }
}

/** Explicit directory adapter for local demonstrations and fixture tests. */
export class DirectoryLogEvidenceProvider implements LogEvidenceProvider<OpsLogEvidence> {
  constructor(private readonly root: string) {}
  async search(query: OpsEvidenceQuery): Promise<OpsLogEvidence[]> {
    return collectLogEvidence(this.root, query.appId, { codeHints: query.hints ?? [] }, query.alert);
  }
  availability(): OpsEvidenceAvailability {
    const logs = path.join(this.root, 'logs');
    return fs.existsSync(logs) && fs.statSync(logs).isDirectory()
      ? { available: true } : { available: false, reason: `Log directory is unavailable: ${logs}` };
  }
}

/** Explicit directory adapter for generated knowledge and GitNexus artifacts. */
export class DirectoryKnowledgeEvidenceProvider implements KnowledgeEvidenceProvider<OpsKnowledgeEvidence> {
  constructor(private readonly root: string) {}
  async search(query: OpsEvidenceQuery): Promise<OpsKnowledgeEvidence[]> {
    return collectKnowledgeEvidence(this.root, query.appId, { codeHints: query.hints ?? [] }, query.alert);
  }
  availability(): OpsEvidenceAvailability {
    const knowledge = path.join(this.root, 'spaces', 'knowledge', 'knowledge-base');
    return fs.existsSync(knowledge) && fs.statSync(knowledge).isDirectory()
      ? { available: true } : { available: false, reason: `Knowledge directory is unavailable: ${knowledge}` };
  }
}

/** Explicit file-backed history adapter; production uses a managed implementation. */
export class DirectoryAlertHistoryRepository implements AlertHistoryRepository<OpsSimilarAlertEvidence> {
  constructor(private readonly root: string) {}
  async findSimilar(alert: string): Promise<OpsSimilarAlertEvidence[]> { return collectSimilarAlertEvidence(this.root, alert); }
  availability(): OpsEvidenceAvailability {
    const history = path.join(this.root, 'spaces', 'ops', 'alert-history.json');
    return fs.existsSync(history) && fs.statSync(history).isFile()
      ? { available: true } : { available: false, reason: `Alert history is unavailable: ${history}` };
  }
}

export class UnavailableEvidenceProvider<T> implements LogEvidenceProvider<T>, KnowledgeEvidenceProvider<T>, AlertHistoryRepository<T> {
  constructor(private readonly reason: string) {}
  async search(_query: OpsEvidenceQuery): Promise<T[]> { return []; }
  async findSimilar(_alert: string): Promise<T[]> { return []; }
  availability(): OpsEvidenceAvailability { return { available: false, reason: this.reason }; }
}
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  collectKnowledgeEvidence,
  collectLogEvidence,
  collectSimilarAlertEvidence,
  type OpsKnowledgeEvidence,
  type OpsLogEvidence,
  type OpsSimilarAlertEvidence,
} from '../tools/ops/evidence.js';
