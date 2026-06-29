/**
 * Configuration loader for AI Coding Pipeline.
 * Merges defaults, environment variables, and local config files.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface PipelineConfig {
  port: number;
  host: string;
  runtimeDir: string;
  java: {
    javaHome: string;
    mavenHome: string;
  };
  llm: {
    defaultProvider: string;
    defaultModel: string;
    apiKey?: string;
    baseUrl?: string;
  };
  permissions: {
    defaultMode: 'plan' | 'default' | 'acceptEdits' | 'dontAsk' | 'locked';
    maxOutputChars: number;
    dangerousCommands: string[];
  };
  agent: {
    maxTurns: number;
    compactThresholdRatio: number;
    compactReserveRatio: number;
    autoFixRounds: number;
  };
  workflow: {
    runtime: 'legacy' | 'langgraph';
    editorEnabled: boolean;
    checkpointer: 'memory' | 'file' | 'postgres';
    branchConcurrency: number;
    llmConcurrency: number;
    testConcurrency: number;
    branchFailurePolicy: 'fail_fast' | 'continue_and_collect' | 'threshold';
  };
}

const DEFAULTS: PipelineConfig = {
  port: 3000,
  host: '0.0.0.0',
  runtimeDir: path.resolve(process.cwd(), 'runtime-projects'),
  java: {
    javaHome: '',
    mavenHome: '',
  },
  llm: {
    defaultProvider: 'openai-compat',
    defaultModel: 'claude-sonnet-4-6',
  },
  permissions: {
    defaultMode: 'default',
    maxOutputChars: 50000,
    dangerousCommands: [
      'rm -rf /', 'mkfs', 'dd if=', ':(){:|:&};:',
      'chmod -R 777 /', 'chown -R', '> /dev/sd',
      'curl | sh', 'wget | sh', 'eval',
      'sudo ', 'su ', 'reboot', 'shutdown',
      'kill -9 1', 'init 0', 'init 6',
    ],
  },
  agent: {
    maxTurns: 80,
    compactThresholdRatio: 0.8,
    compactReserveRatio: 0.3,
    autoFixRounds: 3,
  },
  workflow: {
    runtime: 'legacy',
    editorEnabled: false,
    checkpointer: 'file',
    branchConcurrency: 4,
    llmConcurrency: 6,
    testConcurrency: 2,
    branchFailurePolicy: 'continue_and_collect',
  },
};

function loadConfigFile(configPath: string): Partial<PipelineConfig> {
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

function deepMerge(base: Record<string, any>, override: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = { ...base };
  for (const key of Object.keys(override)) {
    const val = override[key];
    if (val !== undefined) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val) && typeof result[key] === 'object' && result[key] !== null) {
        result[key] = deepMerge(result[key], val);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

function loadFromEnv(): Record<string, any> {
  const envConfig: Record<string, any> = {};
  if (process.env.PORT) envConfig.port = parseInt(process.env.PORT, 10);
  if (process.env.HOST) envConfig.host = process.env.HOST;
  if (process.env.RUNTIME_DIR) envConfig.runtimeDir = path.resolve(process.env.RUNTIME_DIR);
  if (process.env.JAVA_HOME) {
    envConfig.java = { ...(envConfig.java || {}), javaHome: process.env.JAVA_HOME };
  }
  if (process.env.MAVEN_HOME) {
    envConfig.java = { ...(envConfig.java || {}), mavenHome: process.env.MAVEN_HOME };
  }
  if (process.env.LLM_PROVIDER) {
    envConfig.llm = { ...(envConfig.llm || {}), defaultProvider: process.env.LLM_PROVIDER };
  }
  if (process.env.LLM_MODEL) {
    envConfig.llm = { ...(envConfig.llm || {}), defaultModel: process.env.LLM_MODEL };
  }
  if (process.env.LLM_API_KEY) {
    envConfig.llm = { ...(envConfig.llm || {}), apiKey: process.env.LLM_API_KEY };
  }
  if (process.env.LLM_BASE_URL) {
    envConfig.llm = { ...(envConfig.llm || {}), baseUrl: process.env.LLM_BASE_URL };
  }
  if (process.env.PERMISSION_MODE) {
    const mode = process.env.PERMISSION_MODE;
    if (['plan', 'default', 'acceptEdits', 'dontAsk', 'locked'].includes(mode)) {
      envConfig.permissions = { ...(envConfig.permissions || {}), defaultMode: mode };
    }
  }
  if (process.env.AI_CODING_WORKFLOW_RUNTIME) {
    const runtime = process.env.AI_CODING_WORKFLOW_RUNTIME;
    if (runtime === 'legacy' || runtime === 'langgraph') {
      envConfig.workflow = { ...(envConfig.workflow || {}), runtime };
    }
  }
  if (process.env.AI_CODING_WORKFLOW_EDITOR) {
    envConfig.workflow = {
      ...(envConfig.workflow || {}),
      editorEnabled: process.env.AI_CODING_WORKFLOW_EDITOR === '1',
    };
  }
  if (process.env.AI_CODING_LANGGRAPH_CHECKPOINTER) {
    const checkpointer = process.env.AI_CODING_LANGGRAPH_CHECKPOINTER;
    if (checkpointer === 'memory' || checkpointer === 'file' || checkpointer === 'postgres') {
      envConfig.workflow = { ...(envConfig.workflow || {}), checkpointer };
    }
  }
  if (process.env.AI_CODING_BRANCH_CONCURRENCY) {
    envConfig.workflow = {
      ...(envConfig.workflow || {}),
      branchConcurrency: parseInt(process.env.AI_CODING_BRANCH_CONCURRENCY, 10),
    };
  }
  if (process.env.AI_CODING_LLM_CONCURRENCY) {
    envConfig.workflow = {
      ...(envConfig.workflow || {}),
      llmConcurrency: parseInt(process.env.AI_CODING_LLM_CONCURRENCY, 10),
    };
  }
  if (process.env.AI_CODING_TEST_CONCURRENCY) {
    envConfig.workflow = {
      ...(envConfig.workflow || {}),
      testConcurrency: parseInt(process.env.AI_CODING_TEST_CONCURRENCY, 10),
    };
  }
  if (process.env.AI_CODING_BRANCH_FAILURE_POLICY) {
    const failurePolicy = process.env.AI_CODING_BRANCH_FAILURE_POLICY;
    if (failurePolicy === 'fail_fast' || failurePolicy === 'continue_and_collect' || failurePolicy === 'threshold') {
      envConfig.workflow = { ...(envConfig.workflow || {}), branchFailurePolicy: failurePolicy };
    }
  }
  return envConfig;
}

let _config: PipelineConfig | null = null as any;

export function loadConfig(): PipelineConfig {
  if (_config) return _config;

  // Check for local config files in order of priority
  const configDir = path.resolve(process.cwd(), '.ai-coding');
  const configPaths = [
    path.join(configDir, 'config.json'),
    path.join(configDir, 'config.local.json'),
    path.join(os.homedir(), '.ai-coding', 'config.json'),
  ];

  let config: Record<string, any> = { ...DEFAULTS };
  for (const configPath of configPaths) {
    const fileConfig = loadConfigFile(configPath);
    config = deepMerge(config, fileConfig);
  }
  config = deepMerge(config, loadFromEnv());
  config = deepMerge(config, loadConfigFile(path.join(configDir, 'config.local.json')));

  // Ensure runtime dir exists
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

function persistLocalConfig(partial: Partial<PipelineConfig>): void {
  const configDir = path.resolve(process.cwd(), '.ai-coding');
  const configPath = path.join(configDir, 'config.local.json');
  fs.mkdirSync(configDir, { recursive: true });
  const existing = loadConfigFile(configPath);
  const next = deepMerge(existing as Record<string, any>, partial as Record<string, any>);
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf-8');
}
