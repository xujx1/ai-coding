import { initAllAppKnowledge } from './initAllAppKnowledge.js';
import { listKnowledgeBaseWorkflowTemplates } from '../workflows/definitions/knowledgeBaseWorkflow.js';

export interface KnowledgeManagementServiceInfo {
  module: 'knowledge';
  responsibility: string;
}

export function describeKnowledgeManagementService(): KnowledgeManagementServiceInfo {
  return {
    module: 'knowledge',
    responsibility: 'Knowledge-base generation, listing, browsing, and content access.',
  };
}

export async function initAllKnowledgeBases() {
  return initAllAppKnowledge();
}

export function listKnowledgeWorkflows() {
  return listKnowledgeBaseWorkflowTemplates();
}

export function getKnowledgeBaseFiles(): never {
  throw new Error('Knowledge-base file browsing is still served by src/server/app.ts during the staged migration.');
}

export function getKnowledgeBaseFileContent(): never {
  throw new Error('Knowledge-base file content is still served by src/server/app.ts during the staged migration.');
}
