import type {
  OpsAlertAnalysis,
  OpsWorkflowTemplate,
} from '../agents/ops/types.js';
import { listOpsWorkflowTemplates as listOpsFaultAnalysisWorkflowTemplates } from '../workflows/definitions/ops/opsFaultAnalysisWorkflow.js';
import {
  runOpsFaultAnalysisWorkflow,
  streamOpsFaultAnalysisWorkflow,
} from '../workflows/runtime/ops/opsFaultAnalysisRunner.js';
import type { OpsAlertStreamEvent, OpsEvidenceSources } from '../workflows/runtime/ops/opsFaultAnalysisTypes.js';
import { listOpsApplications } from './applications.js';
import type { ApplicationCatalog } from '../platform-sources/applicationCatalog.js';
import { createOpsAnalysisHistoryEntry, type OpsAnalysisHistoryRepository } from './history.js';

export function listOpsWorkflowTemplates(): OpsWorkflowTemplate[] {
  return listOpsFaultAnalysisWorkflowTemplates();
}

export async function analyzeOpsAlert(args: {
  appId: string;
  alert: string;
  workspaceRoot?: string;
  catalog: ApplicationCatalog;
  evidenceSources: OpsEvidenceSources;
  analysisHistory?: OpsAnalysisHistoryRepository;
  workflowConfig?: {
    enabledNodeIds?: string[];
    nodeTools?: Record<string, string[]>;
    reactNodeIds?: string[];
  };
}): Promise<OpsAlertAnalysis> {
  const applications = listOpsApplications(args.catalog);
  const app = applications.find(item => item.appId === args.appId) ?? applications[0];
  if (!app) throw new Error('No application repositories found');
  const workspaceRoot = args.workspaceRoot ?? process.cwd();
  const { workflow, analysis } = await runOpsFaultAnalysisWorkflow({
    app,
    applications,
    alert: args.alert,
    workspaceRoot,
    evidenceSources: args.evidenceSources,
    workflowConfig: args.workflowConfig,
  });
  if (args.analysisHistory) await args.analysisHistory.append(createOpsAnalysisHistoryEntry(workflow.id, analysis));
  return analysis;
}

export async function* streamOpsAlertAnalysis(args: {
  appId: string;
  alert: string;
  workspaceRoot?: string;
  catalog: ApplicationCatalog;
  evidenceSources: OpsEvidenceSources;
  analysisHistory?: OpsAnalysisHistoryRepository;
  workflowConfig?: {
    enabledNodeIds?: string[];
    nodeTools?: Record<string, string[]>;
    reactNodeIds?: string[];
  };
}): AsyncGenerator<OpsAlertStreamEvent> {
  const applications = listOpsApplications(args.catalog);
  const app = applications.find(item => item.appId === args.appId) ?? applications[0];
  if (!app) throw new Error('No application repositories found');
  const workspaceRoot = args.workspaceRoot ?? process.cwd();
  for await (const event of streamOpsFaultAnalysisWorkflow({
    app,
    applications,
    alert: args.alert,
    workspaceRoot,
    evidenceSources: args.evidenceSources,
    workflowConfig: args.workflowConfig,
  })) {
    if (event.type === 'analysis_complete' && args.analysisHistory) {
      await args.analysisHistory.append(createOpsAnalysisHistoryEntry('stream', event.analysis));
    }
    yield event;
  }
}
