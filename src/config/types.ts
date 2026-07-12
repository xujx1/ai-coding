export interface JavaConfig {
  javaHome: string;
  mavenHome: string;
}

export interface LlmConfig {
  defaultProvider: string;
  defaultModel: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface PermissionsConfig {
  defaultMode: 'plan' | 'default' | 'acceptEdits' | 'dontAsk' | 'locked';
  maxOutputChars: number;
  dangerousCommands: string[];
}

export interface AgentConfig {
  maxTurns: number;
  compactThresholdRatio: number;
  compactReserveRatio: number;
  autoFixRounds: number;
}

export interface WorkflowConfig {
  runtime: 'legacy' | 'langgraph';
  editorEnabled: boolean;
  checkpointer: 'memory' | 'file' | 'postgres';
  branchConcurrency: number;
  llmConcurrency: number;
  testConcurrency: number;
  branchFailurePolicy: 'fail_fast' | 'continue_and_collect' | 'threshold';
}

export interface E2eConfig {
  enabled: boolean;
  browserConcurrency: number;
  startupTimeoutMs: number;
  readinessTimeoutMs: number;
  artifactRetention: 'all' | 'failures' | 'summary-only';
}

export interface PipelineConfig {
  port: number;
  host: string;
  runtimeDir: string;
  java: JavaConfig;
  llm: LlmConfig;
  permissions: PermissionsConfig;
  agent: AgentConfig;
  workflow: WorkflowConfig;
  e2e: E2eConfig;
}
