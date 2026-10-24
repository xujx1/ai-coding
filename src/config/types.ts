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

export type StorageDriver = 'file' | 'postgres';
export type EventBusDriver = 'memory' | 'postgres';
export type ArtifactStoreDriver = 'local' | 's3';
export type RuntimeProfile = 'local' | 'production' | 'ecom-demo';

export interface StorageConfig {
  driver: StorageDriver;
  databaseUrl?: string;
  databasePoolMin: number;
  databasePoolMax: number;
  databaseSsl: boolean;
  shadowDatabaseUrl?: string;
  shadowWriteEnabled: boolean;
  eventBus: EventBusDriver;
  artifactStore: ArtifactStoreDriver;
  artifactLocalDir: string;
  s3Endpoint?: string;
  s3Bucket?: string;
  s3Region?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  workspaceRoot: string;
  workspaceRetentionHours: number;
  temporaryArtifactRetentionHours: number;
  workerId: string;
  profile: RuntimeProfile;
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
  storage: StorageConfig;
}
