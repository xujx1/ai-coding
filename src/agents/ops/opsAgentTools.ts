import * as path from 'path';
import { ToolContext, ToolRegistry } from '../../tools/base.js';
import { GlobTool } from '../../tools/builtin/GlobTool.js';
import { GrepTool } from '../../tools/builtin/GrepTool.js';
import { ReadTool } from '../../tools/builtin/ReadTool.js';
import { ReviewArtifactTool } from '../../tools/builtin/ReviewArtifactTool.js';
import { DiscoverSkillsTool } from '../../tools/builtin/DiscoverSkillsTool.js';
import { SkillTool } from '../../tools/builtin/SkillTool.js';
import {
  createAlertVectorSearchTool,
  CodeContextSearchTool,
  DependencyGraphSearchTool,
  createLocalLogSearchTool,
  createOpsKnowledgeSearchTool,
} from '../../tools/ops/index.js';
import type { OpsEvidenceSources } from '../../workflows/runtime/ops/opsFaultAnalysisTypes.js';

export function createOpsToolRegistry(evidenceSources: OpsEvidenceSources): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(ReadTool);
  registry.register(GlobTool);
  registry.register(GrepTool);
  registry.register(createAlertVectorSearchTool(evidenceSources.alertHistory));
  registry.register(createLocalLogSearchTool(evidenceSources.logEvidence));
  registry.register(CodeContextSearchTool);
  registry.register(createOpsKnowledgeSearchTool(evidenceSources.knowledgeEvidence));
  registry.register(DependencyGraphSearchTool);
  registry.register(ReviewArtifactTool);
  registry.register(DiscoverSkillsTool);
  registry.register(SkillTool);
  return registry;
}

export function createOpsToolContext(args: {
  workspaceRoot: string;
  appRoot: string;
  runId?: string;
  agentRunId?: string;
  nodeId?: string;
  artifactsDir?: string;
}): ToolContext {
  const runDir = args.workspaceRoot;
  return {
    runId: args.runId ?? `ops-${Date.now()}`,
    agentRunId: args.agentRunId ?? `ops-agent-${Date.now()}`,
    nodeId: args.nodeId,
    cwd: args.appRoot,
    projectDir: args.appRoot,
    runDir,
    artifactsDir: args.artifactsDir ?? path.join(args.workspaceRoot, 'ops-artifacts'),
    canUseTool: async () => 'allow',
  };
}

export async function executeOpsJsonTool<T>(
  registry: ToolRegistry,
  ctx: ToolContext,
  toolName: string,
  input: unknown,
): Promise<T> {
  const tool = registry.get(toolName);
  if (!tool) throw new Error(`Ops tool not registered: ${toolName}`);
  const result = await tool.execute(input, ctx);
  if (result.isError) throw new Error(result.content);
  return JSON.parse(result.content) as T;
}
