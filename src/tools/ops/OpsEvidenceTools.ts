import { z } from 'zod';
import type { Tool, ToolContext, ToolResult } from '../base.js';
import { collectCodeEvidence } from './evidence.js';
import type { AlertHistoryRepository, KnowledgeEvidenceProvider, LogEvidenceProvider } from '../../platform-sources/opsEvidenceProviders.js';
import type { OpsKnowledgeEvidence, OpsLogEvidence, OpsSimilarAlertEvidence } from './evidence.js';

const HintsSchema = z.object({
  codeHints: z.array(z.string()).default([]),
});

function jsonResult(content: unknown): ToolResult {
  return { toolUseId: '', content: JSON.stringify(content) };
}

function jsonError(error: unknown): ToolResult {
  return {
    toolUseId: '',
    content: error instanceof Error ? error.message : String(error),
    isError: true,
  };
}

export function createLocalLogSearchTool(provider: LogEvidenceProvider<OpsLogEvidence>): Tool {
  return {
  definition: {
    name: 'local_log_search',
    description: 'Search the configured local log source by appId, traceId, alert tokens, and classification hints.',
    inputSchema: z.object({
      appId: z.string(),
      alert: z.string(),
      classification: HintsSchema,
    }),
    isReadOnly: true,
  },
  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    try {
      const parsed = this.definition.inputSchema.parse(input);
      return jsonResult(await provider.search({ appId: parsed.appId, alert: parsed.alert, hints: parsed.classification.codeHints }));
    } catch (error) {
      return jsonError(error);
    }
  },
  };
}

export const CodeContextSearchTool: Tool = {
  definition: {
    name: 'code_context_search',
    description: 'Search application source/config files for alert tokens and classification hints.',
    inputSchema: z.object({
      root: z.string(),
      alert: z.string(),
      classification: HintsSchema,
    }),
    isReadOnly: true,
  },
  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    try {
      const parsed = this.definition.inputSchema.parse(input);
      return jsonResult(collectCodeEvidence(parsed.root, parsed.classification, parsed.alert));
    } catch (error) {
      return jsonError(error);
    }
  },
};

export function createOpsKnowledgeSearchTool(provider: KnowledgeEvidenceProvider<OpsKnowledgeEvidence>): Tool {
  return {
  definition: {
    name: 'ops_knowledge_search',
    description: 'Search application knowledge base, global knowledge base, and GitNexus artifacts for ops evidence.',
    inputSchema: z.object({
      appId: z.string(),
      alert: z.string(),
      classification: HintsSchema,
    }),
    isReadOnly: true,
  },
  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    try {
      const parsed = this.definition.inputSchema.parse(input);
      return jsonResult(await provider.search({ appId: parsed.appId, alert: parsed.alert, hints: parsed.classification.codeHints }));
    } catch (error) {
      return jsonError(error);
    }
  },
  };
}

export function createAlertVectorSearchTool(provider: AlertHistoryRepository<OpsSimilarAlertEvidence>): Tool {
  return {
  definition: {
    name: 'alert_vector_search',
    description: 'Search local operations alert history vectors for alerts similar to the current alert.',
    inputSchema: z.object({
      alert: z.string(),
    }),
    isReadOnly: true,
  },
  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    try {
      const parsed = this.definition.inputSchema.parse(input);
      return jsonResult(await provider.findSimilar(parsed.alert));
    } catch (error) {
      return jsonError(error);
    }
  },
  };
}

export const DependencyGraphSearchTool: Tool = {
  definition: {
    name: 'dependency_graph_search',
    description: 'Analyze upstream and downstream dependency impact for an operations alert.',
    inputSchema: z.object({
      upstream: z.array(z.string()).default([]),
      downstream: z.array(z.string()).default([]),
      blastRadius: z.string().optional(),
    }),
    isReadOnly: true,
  },
  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    try {
      const parsed = this.definition.inputSchema.parse(input);
      return jsonResult({
        upstream: parsed.upstream,
        downstream: parsed.downstream,
        blastRadius: parsed.blastRadius ?? describeBlastRadius(parsed.upstream, parsed.downstream),
      });
    } catch (error) {
      return jsonError(error);
    }
  },
};

function describeBlastRadius(upstream: string[], downstream: string[]): string {
  if (!upstream.length && !downstream.length) return '当前应用暂无显式上下游依赖，影响面先按单应用处理。';
  return [
    upstream.length ? `可能影响上游调用方：${upstream.join('、')}` : '',
    downstream.length ? `可能受下游依赖影响：${downstream.join('、')}` : '',
  ].filter(Boolean).join('；');
}
