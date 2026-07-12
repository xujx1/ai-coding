export type OpsAgentId =
  | 'similar-alert'
  | 'local-log-trace'
  | 'code-context'
  | 'app-knowledge'
  | 'global-impact'
  | 'repair-plan';

export type OpsAgentStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed';

export interface OpsAgentDefinition {
  id: OpsAgentId;
  label: string;
  description: string;
  usesReActLoop?: boolean;
}

export interface OpsAgentRunResult<T = unknown> {
  nodeId: OpsAgentId;
  status: OpsAgentStatus;
  output: string;
  data?: T;
}

export interface OpsApplication {
  appId: string;
  name: string;
  root: string;
  description?: string;
  dependencies: string[];
  apiCount: number;
  codeSignals: string[];
}

export interface OpsWorkflowTemplate {
  id: string;
  name: string;
  mode: 'workflow' | 'intent-routing' | 'coordinator';
  description: string;
  nodes: Array<{
    id: string;
    label: string;
    description: string;
    tools: string[];
    scope: string;
  }>;
}

export interface OpsAlertClassification {
  faultType: string;
  label: string;
  confidence: number;
  matchedKeywords: string[];
  codeHints: string[];
}

export interface OpsAlertAnalysis {
  app: OpsApplication;
  alert: string;
  category: string;
  categoryLabel: string;
  confidence: number;
  matchedKeywords: string[];
  likelyCauses: string[];
  impact: {
    upstream: string[];
    downstream: string[];
    blastRadius: string;
  };
  logEvidence: Array<{
    path: string;
    reason: string;
    snippet?: string;
  }>;
  similarAlertEvidence: Array<{
    path: string;
    reason: string;
    snippet?: string;
    score?: number;
  }>;
  codeEvidence: Array<{
    path: string;
    reason: string;
    snippet?: string;
  }>;
  knowledgeEvidence: Array<{
    path: string;
    source: 'knowledge-base' | 'gitnexus';
    reason: string;
    snippet?: string;
  }>;
  recommendedActions: string[];
  runbook: string[];
  modelDiagnosis?: {
    modelId: string;
    providerId: string;
    summary: string;
    rootCause: string;
    evidence: string[];
    repairPlan: string[];
    rawText: string;
    durationMs: number;
    usage?: { inputTokens: number; outputTokens: number };
  };
  llmError?: string;
  toolResults: Array<{
    nodeId: string;
    label: string;
    tools: string[];
    status: OpsAgentStatus;
    output: string;
  }>;
}
