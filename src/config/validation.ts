import type { PipelineConfig } from './types.js';

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function validateConfig(config: PipelineConfig, env: NodeJS.ProcessEnv = process.env): void {
  const { storage, workflow } = config;
  if (storage.databasePoolMin < 1 || storage.databasePoolMax < storage.databasePoolMin) {
    throw new ConfigurationError('DATABASE_POOL_MAX must be greater than or equal to DATABASE_POOL_MIN and both must be positive.');
  }
  if (storage.workspaceRetentionHours < 1) {
    throw new ConfigurationError('AI_CODING_WORKSPACE_RETENTION_HOURS must be positive.');
  }
  if (storage.temporaryArtifactRetentionHours < 1) {
    throw new ConfigurationError('AI_CODING_TEMPORARY_ARTIFACT_RETENTION_HOURS must be positive.');
  }
  if (!storage.workerId.trim()) {
    throw new ConfigurationError('AI_CODING_WORKER_ID must not be empty.');
  }
  if (storage.driver === 'postgres' && !storage.databaseUrl) {
    throw new ConfigurationError('DATABASE_URL is required when AI_CODING_STORAGE_DRIVER=postgres.');
  }
  if (storage.shadowWriteEnabled && storage.driver !== 'file') {
    throw new ConfigurationError('AI_CODING_POSTGRES_SHADOW_WRITE is only valid while file storage remains authoritative.');
  }
  if (storage.shadowWriteEnabled && !storage.shadowDatabaseUrl) {
    throw new ConfigurationError('AI_CODING_SHADOW_DATABASE_URL is required when PostgreSQL shadow writing is enabled.');
  }
  if (workflow.checkpointer === 'postgres' && storage.driver !== 'postgres') {
    throw new ConfigurationError('AI_CODING_LANGGRAPH_CHECKPOINTER=postgres requires AI_CODING_STORAGE_DRIVER=postgres.');
  }
  if (storage.eventBus === 'postgres' && storage.driver !== 'postgres') {
    throw new ConfigurationError('AI_CODING_EVENT_BUS=postgres requires AI_CODING_STORAGE_DRIVER=postgres.');
  }
  if (storage.artifactStore === 's3') {
    if (!storage.s3Bucket || !storage.s3Region) {
      throw new ConfigurationError('S3_BUCKET and S3_REGION are required when AI_CODING_ARTIFACT_STORE=s3.');
    }
    if (Boolean(storage.s3AccessKeyId) !== Boolean(storage.s3SecretAccessKey)) {
      throw new ConfigurationError('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together.');
    }
  }
  if (storage.profile === 'production') {
    const insecureTestInfrastructure = env.NODE_ENV === 'test'
      && env.AI_CODING_ALLOW_INSECURE_TEST_INFRA === '1';
    if (storage.driver !== 'postgres') {
      throw new ConfigurationError('The production profile requires AI_CODING_STORAGE_DRIVER=postgres.');
    }
    if (storage.eventBus !== 'postgres') {
      throw new ConfigurationError('The production profile requires AI_CODING_EVENT_BUS=postgres.');
    }
    if (storage.artifactStore !== 's3') {
      throw new ConfigurationError('The production profile requires AI_CODING_ARTIFACT_STORE=s3.');
    }
    if (!storage.databaseSsl && !insecureTestInfrastructure) {
      throw new ConfigurationError('The production profile requires DATABASE_SSL=true.');
    }
    if (storage.s3Endpoint && !storage.s3Endpoint.startsWith('https://') && !insecureTestInfrastructure) {
      throw new ConfigurationError('The production profile requires an HTTPS S3 endpoint.');
    }
  }
}
