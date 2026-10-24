import * as path from 'path';
import { ToolContext, ToolRegistry } from '../../tools/base.js';
import { GlobTool } from '../../tools/builtin/GlobTool.js';
import { GrepTool } from '../../tools/builtin/GrepTool.js';
import { ReadTool } from '../../tools/builtin/ReadTool.js';
import { WriteTool } from '../../tools/builtin/WriteTool.js';
import { ReviewArtifactTool } from '../../tools/builtin/ReviewArtifactTool.js';
import { DiscoverSkillsTool } from '../../tools/builtin/DiscoverSkillsTool.js';
import { SkillTool } from '../../tools/builtin/SkillTool.js';

export function createKnowledgeToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(ReadTool);
  registry.register(GlobTool);
  registry.register(GrepTool);
  registry.register(WriteTool);
  registry.register(ReviewArtifactTool);
  registry.register(DiscoverSkillsTool);
  registry.register(SkillTool);
  return registry;
}

export function createKnowledgeToolContext(args: {
  workspaceRoot: string;
  repositoryRoot: string;
  knowledgeArtifactsDir?: string;
  runId?: string;
  agentRunId?: string;
  nodeId?: string;
}): ToolContext {
  return {
    runId: args.runId ?? `knowledge-${Date.now()}`,
    agentRunId: args.agentRunId ?? `knowledge-agent-${Date.now()}`,
    nodeId: args.nodeId,
    cwd: args.repositoryRoot,
    projectDir: args.repositoryRoot,
    runDir: args.workspaceRoot,
    artifactsDir: args.knowledgeArtifactsDir ?? path.join(args.workspaceRoot, 'artifacts', 'knowledge'),
    canUseTool: async () => 'allow',
  };
}

export async function executeKnowledgeJsonTool<T>(
  registry: ToolRegistry,
  ctx: ToolContext,
  toolName: string,
  input: unknown,
): Promise<T> {
  const tool = registry.get(toolName);
  if (!tool) throw new Error(`Knowledge tool not registered: ${toolName}`);
  const result = await tool.execute(input, ctx);
  if (result.isError) throw new Error(result.content);
  return JSON.parse(result.content) as T;
}
