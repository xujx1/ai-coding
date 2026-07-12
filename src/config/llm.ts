import type { LlmConfig } from './types.js';

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  defaultProvider: 'openai-compat',
  defaultModel: 'claude-sonnet-4-6',
};

export function loadLlmEnv(env: NodeJS.ProcessEnv = process.env): Partial<LlmConfig> {
  const config: Partial<LlmConfig> = {};
  if (env.LLM_PROVIDER) config.defaultProvider = env.LLM_PROVIDER;
  if (env.LLM_MODEL) config.defaultModel = env.LLM_MODEL;
  if (env.LLM_API_KEY) config.apiKey = env.LLM_API_KEY;
  if (env.LLM_BASE_URL) config.baseUrl = env.LLM_BASE_URL;
  return config;
}
