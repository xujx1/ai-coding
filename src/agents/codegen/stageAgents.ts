import { PIPELINE_NODES } from '../../workflows/definitions/pipelineDefinition.js';
import type { PipelineAgentDefinition, PipelineAgentId } from './types.js';

const TOOL_HINTS: Record<PipelineAgentId, string[]> = {
  'upload-init': ['glob', 'read_file', 'write_file'],
  'mrd-render': ['read_file', 'write_file'],
  'implementation-plan': ['read_file', 'write_file', 'knowledge_base_search'],
  'spec-generate': ['read_file', 'write_file'],
  'java-impl': ['glob', 'grep', 'read_file', 'edit_file', 'write_file', 'maven_compile'],
  'testcode-generate': ['glob', 'grep', 'read_file', 'edit_file', 'write_file', 'maven_test'],
  'cross-app-test': ['read_file', 'write_file', 'maven_test'],
  'archive': ['read_file', 'write_file'],
};

export const PIPELINE_AGENT_DEFINITIONS: PipelineAgentDefinition[] = PIPELINE_NODES.map(node => ({
  id: node.id as PipelineAgentId,
  label: node.name,
  description: node.description,
  defaultTools: TOOL_HINTS[node.id as PipelineAgentId] ?? ['read_file', 'write_file'],
  outputArtifacts: node.artifactOutputs ?? (node.artifactOutput ? [node.artifactOutput] : []),
  usesReActLoop: node.usesReActLoop,
}));

export function getPipelineAgentDefinition(id: string): PipelineAgentDefinition | undefined {
  return PIPELINE_AGENT_DEFINITIONS.find(agent => agent.id === id);
}
