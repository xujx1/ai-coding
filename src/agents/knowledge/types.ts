export type KnowledgeAgentId =
  | 'knowledge-repository-scan'
  | 'knowledge-gitnexus-index'
  | 'app-knowledge-generate'
  | 'global-knowledge-merge'
  | 'knowledge-freshness-record';

export interface KnowledgeAgentDefinition {
  id: KnowledgeAgentId;
  label: string;
  description: string;
  defaultTools: string[];
  outputArtifacts: string[];
  usesReActLoop?: boolean;
}

export type KnowledgeAgentStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed';

export interface KnowledgeAgentRunResult<T = unknown> {
  nodeId: KnowledgeAgentId;
  status: KnowledgeAgentStatus;
  output: string;
  data?: T;
}

export interface KnowledgeDomainContext {
  repository?: string;
  domain?: string;
  domainName?: string;
  serviceName?: string;
  port?: number;
  summary?: string;
  capabilities?: string[];
  owns?: string[];
  upstreamDependencies?: string[];
  downstreamConsumers?: string[];
  requirementKeywords?: string[];
  sampleRoutes?: string[];
}

export interface KnowledgeRepositoryScan {
  appId: string;
  name: string;
  root: string;
  relativeRoot: string;
  domain: KnowledgeDomainContext;
  routes: string[];
  components: string[];
  dbTables: string[];
  sourceFiles: string[];
  sourceCommitSha?: string;
}

export interface KnowledgeGeneratedFile {
  path: string;
  bytes: number;
  summary: string;
}
