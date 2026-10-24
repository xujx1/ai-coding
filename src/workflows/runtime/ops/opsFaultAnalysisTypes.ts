import type { OpsAgentStatus, OpsAlertAnalysis, OpsApplication, OpsWorkflowTemplate } from '../../../agents/ops/types.js';
import type { AlertHistoryRepository, KnowledgeEvidenceProvider, LogEvidenceProvider } from '../../../platform-sources/opsEvidenceProviders.js';
import type { OpsKnowledgeEvidence, OpsLogEvidence, OpsSimilarAlertEvidence } from '../../../tools/ops/evidence.js';

export interface OpsEvidenceSources {
  logEvidence: LogEvidenceProvider<OpsLogEvidence>;
  knowledgeEvidence: KnowledgeEvidenceProvider<OpsKnowledgeEvidence>;
  alertHistory: AlertHistoryRepository<OpsSimilarAlertEvidence>;
}

export type OpsAlertStreamEvent =
  | { type: 'analysis_base'; analysis: OpsAlertAnalysis }
  | { type: 'node_update'; nodeId: string; status: OpsAgentStatus; output: string; analysis: OpsAlertAnalysis }
  | { type: 'model_start'; nodeId: string; label: string; modelId: string; providerId: string }
  | { type: 'model_delta'; nodeId: string; text: string }
  | { type: 'model_end'; nodeId: string; diagnosis: NonNullable<OpsAlertAnalysis['modelDiagnosis']> }
  | { type: 'analysis_complete'; analysis: OpsAlertAnalysis }
  | { type: 'error'; message: string; analysis?: OpsAlertAnalysis };

export interface OpsFaultAnalysisWorkflowInput {
  app: OpsApplication;
  applications: OpsApplication[];
  alert: string;
  workspaceRoot: string;
  evidenceSources: OpsEvidenceSources;
  workflowConfig?: {
    enabledNodeIds?: string[];
    nodeTools?: Record<string, string[]>;
    reactNodeIds?: string[];
  };
}

export interface OpsFaultAnalysisWorkflowResult {
  workflow: OpsWorkflowTemplate;
  analysis: OpsAlertAnalysis;
}
