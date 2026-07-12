import { loadE2eEnv } from './e2e.js';
import { loadJavaEnv } from './java.js';
import { loadLlmEnv } from './llm.js';
import { loadPermissionsEnv } from './permissions.js';
import { loadServerEnv } from './server.js';
import type { PipelineConfig } from './types.js';
import { loadWorkflowEnv } from './workflow.js';

export function loadFromEnv(env: NodeJS.ProcessEnv = process.env): Partial<PipelineConfig> {
  return {
    ...loadServerEnv(env),
    java: loadJavaEnv(env) as PipelineConfig['java'],
    llm: loadLlmEnv(env) as PipelineConfig['llm'],
    permissions: loadPermissionsEnv(env) as PipelineConfig['permissions'],
    workflow: loadWorkflowEnv(env) as PipelineConfig['workflow'],
    e2e: loadE2eEnv(env) as PipelineConfig['e2e'],
  };
}
