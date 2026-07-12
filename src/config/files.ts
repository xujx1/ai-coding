import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PipelineConfig } from './types.js';
import { deepMerge } from './merge.js';

export function getConfigDir(): string {
  return path.resolve(process.cwd(), '.ai-coding');
}

export function getConfigPaths(): string[] {
  const configDir = getConfigDir();
  return [
    path.join(configDir, 'config.json'),
    path.join(configDir, 'config.local.json'),
    path.join(os.homedir(), '.ai-coding', 'config.json'),
  ];
}

export function getLocalConfigPath(): string {
  return path.join(getConfigDir(), 'config.local.json');
}

export function loadConfigFile(configPath: string): Partial<PipelineConfig> {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // ignore config file errors
  }
  return {};
}

export function persistLocalConfig(partial: Partial<PipelineConfig>): void {
  const configDir = getConfigDir();
  const configPath = getLocalConfigPath();
  fs.mkdirSync(configDir, { recursive: true });
  const existing = loadConfigFile(configPath);
  const next = deepMerge(existing as Record<string, any>, partial as Record<string, any>);
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf-8');
}
