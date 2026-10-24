import * as path from 'path';
import type { StorageConfig } from './types.js';

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  // Production is intentionally the default. Local file mode must be selected
  // explicitly through AI_CODING_PROFILE=local and its storage settings.
  driver: 'postgres',
  databasePoolMin: 2,
  databasePoolMax: 20,
  databaseSsl: true,
  shadowWriteEnabled: false,
  eventBus: 'postgres',
  artifactStore: 's3',
  artifactLocalDir: path.resolve(process.cwd(), 'runtime-projects', 'artifact-store'),
  workspaceRoot: path.resolve(process.cwd(), 'runtime-projects', 'workspaces'),
  workspaceRetentionHours: 24,
  temporaryArtifactRetentionHours: 72,
  workerId: `worker-${process.pid}`,
  profile: 'production',
};

export function loadStorageEnv(env: NodeJS.ProcessEnv = process.env): Partial<StorageConfig> {
  const config: Partial<StorageConfig> = {};
  if (env.AI_CODING_STORAGE_DRIVER === 'file' || env.AI_CODING_STORAGE_DRIVER === 'postgres') {
    config.driver = env.AI_CODING_STORAGE_DRIVER;
  }
  if (env.DATABASE_URL) config.databaseUrl = env.DATABASE_URL;
  if (env.DATABASE_POOL_MIN) config.databasePoolMin = parsePositiveInt(env.DATABASE_POOL_MIN);
  if (env.DATABASE_POOL_MAX) config.databasePoolMax = parsePositiveInt(env.DATABASE_POOL_MAX);
  if (env.DATABASE_SSL) config.databaseSsl = parseBoolean(env.DATABASE_SSL);
  if (env.AI_CODING_SHADOW_DATABASE_URL) config.shadowDatabaseUrl = env.AI_CODING_SHADOW_DATABASE_URL;
  if (env.AI_CODING_POSTGRES_SHADOW_WRITE) config.shadowWriteEnabled = parseBoolean(env.AI_CODING_POSTGRES_SHADOW_WRITE);
  if (env.AI_CODING_EVENT_BUS === 'memory' || env.AI_CODING_EVENT_BUS === 'postgres') {
    config.eventBus = env.AI_CODING_EVENT_BUS;
  }
  if (env.AI_CODING_ARTIFACT_STORE === 'local' || env.AI_CODING_ARTIFACT_STORE === 's3') {
    config.artifactStore = env.AI_CODING_ARTIFACT_STORE;
  }
  if (env.ARTIFACT_LOCAL_DIR) config.artifactLocalDir = path.resolve(env.ARTIFACT_LOCAL_DIR);
  if (env.S3_ENDPOINT) config.s3Endpoint = env.S3_ENDPOINT;
  if (env.S3_BUCKET) config.s3Bucket = env.S3_BUCKET;
  if (env.S3_REGION) config.s3Region = env.S3_REGION;
  if (env.S3_ACCESS_KEY_ID) config.s3AccessKeyId = env.S3_ACCESS_KEY_ID;
  if (env.S3_SECRET_ACCESS_KEY) config.s3SecretAccessKey = env.S3_SECRET_ACCESS_KEY;
  if (env.AI_CODING_WORKSPACE_ROOT) config.workspaceRoot = path.resolve(env.AI_CODING_WORKSPACE_ROOT);
  if (env.AI_CODING_WORKSPACE_RETENTION_HOURS) {
    config.workspaceRetentionHours = parsePositiveInt(env.AI_CODING_WORKSPACE_RETENTION_HOURS);
  }
  if (env.AI_CODING_TEMPORARY_ARTIFACT_RETENTION_HOURS) {
    config.temporaryArtifactRetentionHours = parsePositiveInt(env.AI_CODING_TEMPORARY_ARTIFACT_RETENTION_HOURS);
  }
  if (env.AI_CODING_WORKER_ID) config.workerId = env.AI_CODING_WORKER_ID;
  if (env.AI_CODING_PROFILE === 'local' || env.AI_CODING_PROFILE === 'production' || env.AI_CODING_PROFILE === 'ecom-demo') {
    config.profile = env.AI_CODING_PROFILE;
  }
  return config;
}

function parsePositiveInt(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseBoolean(value: string): boolean {
  return value === '1' || value.toLowerCase() === 'true';
}
