export * from './types.js';
export * from './repositoryScanAgent.js';
export * from './gitNexusIndexAgent.js';
export * from './appKnowledgeGenerateAgent.js';
export * from './globalKnowledgeMergeAgent.js';
export * from './freshnessRecordAgent.js';
export * from './appKnowledgeAgentResources.js';
export * from './knowledgeAgentTools.js';

import { APP_KNOWLEDGE_GENERATE_AGENT } from './appKnowledgeGenerateAgent.js';
import { KNOWLEDGE_FRESHNESS_RECORD_AGENT } from './freshnessRecordAgent.js';
import { KNOWLEDGE_GITNEXUS_INDEX_AGENT } from './gitNexusIndexAgent.js';
import { GLOBAL_KNOWLEDGE_MERGE_AGENT } from './globalKnowledgeMergeAgent.js';
import { KNOWLEDGE_REPOSITORY_SCAN_AGENT } from './repositoryScanAgent.js';
import type { KnowledgeAgentDefinition } from './types.js';

export const KNOWLEDGE_AGENT_DEFINITIONS: KnowledgeAgentDefinition[] = [
  KNOWLEDGE_REPOSITORY_SCAN_AGENT,
  KNOWLEDGE_GITNEXUS_INDEX_AGENT,
  APP_KNOWLEDGE_GENERATE_AGENT,
  GLOBAL_KNOWLEDGE_MERGE_AGENT,
  KNOWLEDGE_FRESHNESS_RECORD_AGENT,
];

export function getKnowledgeAgentDefinition(id: string): KnowledgeAgentDefinition | undefined {
  return KNOWLEDGE_AGENT_DEFINITIONS.find(agent => agent.id === id);
}
