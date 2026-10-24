import { DEFAULT_AGENT_CONFIG } from './agent.js';
import { DEFAULT_E2E_CONFIG } from './e2e.js';
import { DEFAULT_JAVA_CONFIG } from './java.js';
import { DEFAULT_LLM_CONFIG } from './llm.js';
import { DEFAULT_PERMISSIONS_CONFIG } from './permissions.js';
import { DEFAULT_SERVER_CONFIG } from './server.js';
import { DEFAULT_STORAGE_CONFIG } from './storage.js';
import type { PipelineConfig } from './types.js';
import { DEFAULT_WORKFLOW_CONFIG } from './workflow.js';

export const DEFAULT_CONFIG: PipelineConfig = {
  ...DEFAULT_SERVER_CONFIG,
  java: DEFAULT_JAVA_CONFIG,
  llm: DEFAULT_LLM_CONFIG,
  permissions: DEFAULT_PERMISSIONS_CONFIG,
  agent: DEFAULT_AGENT_CONFIG,
  workflow: DEFAULT_WORKFLOW_CONFIG,
  e2e: DEFAULT_E2E_CONFIG,
  storage: DEFAULT_STORAGE_CONFIG,
};
