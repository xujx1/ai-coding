/**
 * Configuration loader for AI Coding Pipeline.
 * Merges defaults, environment variables, and local config files.
 */
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_CONFIG } from './defaults.js';
import { loadFromEnv } from './env.js';
import { getConfigDir, getConfigPaths, getLocalConfigPath, loadConfigFile, persistLocalConfig } from './files.js';
import { deepMerge } from './merge.js';
import type { PipelineConfig } from './types.js';

export type {
  AgentConfig,
  E2eConfig,
  JavaConfig,
  LlmConfig,
  PermissionsConfig,
  PipelineConfig,
  WorkflowConfig,
} from './types.js';

let _config: PipelineConfig | null = null as any;

export function loadConfig(): PipelineConfig {
  if (_config) return _config;

  let config: Record<string, any> = { ...DEFAULT_CONFIG };
  for (const configPath of getConfigPaths()) {
    const fileConfig = loadConfigFile(configPath);
    config = deepMerge(config, fileConfig);
  }
  config = deepMerge(config, loadFromEnv() as Record<string, any>);
  config = deepMerge(config, loadConfigFile(getLocalConfigPath()) as Record<string, any>);

  fs.mkdirSync(path.join(config.runtimeDir as string, 'runs'), { recursive: true });

  _config = config as PipelineConfig;
  return config as PipelineConfig;
}

export function getConfig(): PipelineConfig {
  return _config ?? loadConfig();
}

export function updateJavaConfig(javaConfig: Partial<PipelineConfig['java']>): PipelineConfig {
  const current = getConfig();
  current.java = {
    ...current.java,
    ...javaConfig,
  };
  persistLocalConfig({ java: current.java });
  return current;
}

export { getConfigDir, getConfigPaths, getLocalConfigPath, loadConfigFile };
