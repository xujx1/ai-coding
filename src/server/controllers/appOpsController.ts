import {
  analyzeOpsAlert,
  listOpsApplications,
  listOpsCapabilities,
  listOpsWorkflowTemplates,
  streamOpsAlertAnalysis,
} from '../../app-ops/appOpsService.js';
import type { OpsAnalysisHistoryRepository } from '../../app-ops/history.js';
import type { ApplicationCatalog } from '../../platform-sources/applicationCatalog.js';
import type { OpsEvidenceSources } from '../../workflows/runtime/ops/opsFaultAnalysisTypes.js';

export function listOpsApps(c: any, catalog: ApplicationCatalog) {
  return c.json({ apps: listOpsApplications(catalog) });
}

type OpsControllerSources = OpsEvidenceSources & {
  analysisHistory: OpsAnalysisHistoryRepository;
};

export async function getOpsWorkbench(c: any, catalog: ApplicationCatalog, analysisHistory: OpsAnalysisHistoryRepository) {
  return c.json({
    apps: listOpsApplications(catalog),
    workflows: listOpsWorkflowTemplates(),
    capabilities: listOpsCapabilities(),
    alertHistory: await analysisHistory.list(),
  });
}

export async function analyzeOps(c: any, catalog: ApplicationCatalog, sources: OpsControllerSources) {
  try {
    const body = await c.req.json();
    const { appId, alert, workflowConfig, error } = parseOpsAnalyzeBody(body);
    if (error) return c.json({ error }, error.includes('appId') ? 400 : 400);
    return c.json({ analysis: await analyzeOpsAlert({ appId, alert, catalog, evidenceSources: sources, analysisHistory: sources.analysisHistory, workflowConfig }) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

export async function analyzeOpsStream(c: any, catalog: ApplicationCatalog, sources: OpsControllerSources) {
  try {
    const body = await c.req.json();
    const { appId, alert, workflowConfig, error } = parseOpsAnalyzeBody(body);
    if (error) return c.json({ error }, 400);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        try {
          for await (const event of streamOpsAlertAnalysis({ appId, alert, catalog, evidenceSources: sources, analysisHistory: sources.analysisHistory, workflowConfig })) {
            send(event);
          }
          send({ type: 'done' });
        } catch (err) {
          send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

function parseOpsAnalyzeBody(body: any): {
  appId: string;
  alert: string;
  workflowConfig?: { enabledNodeIds?: string[]; nodeTools?: Record<string, string[]>; reactNodeIds?: string[] };
  error?: string;
} {
  const appId = typeof body.appId === 'string' ? body.appId : '';
  const alert = typeof body.alert === 'string' ? body.alert : '';
  if (!appId) return { appId, alert, error: 'appId is required' };
  if (!alert.trim()) return { appId, alert, error: 'alert is required' };
  const workflowConfig = isRecord(body.workflowConfig)
    ? {
      enabledNodeIds: Array.isArray(body.workflowConfig.enabledNodeIds)
        ? (body.workflowConfig.enabledNodeIds as unknown[]).filter((item): item is string => typeof item === 'string')
        : undefined,
      reactNodeIds: Array.isArray(body.workflowConfig.reactNodeIds)
        ? (body.workflowConfig.reactNodeIds as unknown[]).filter((item): item is string => typeof item === 'string')
        : undefined,
      nodeTools: isRecord(body.workflowConfig.nodeTools)
        ? Object.fromEntries(Object.entries(body.workflowConfig.nodeTools)
          .filter(([, value]) => Array.isArray(value))
          .map(([key, value]) => [key, (value as unknown[]).filter((item): item is string => typeof item === 'string')]))
        : undefined,
    }
    : undefined;
  return { appId, alert, workflowConfig };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
