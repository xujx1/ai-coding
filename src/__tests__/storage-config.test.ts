import * as assert from 'assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { validateConfig, ConfigurationError } from '../config/validation.js';
import { createStorageDependencies } from '../storage/factory.js';
import type { PipelineConfig } from '../config/types.js';

function configWith(overrides: Partial<PipelineConfig['storage']>): PipelineConfig {
  return {
    ...DEFAULT_CONFIG,
    storage: {
      ...DEFAULT_CONFIG.storage,
      ...overrides,
    },
  };
}

function localConfig(overrides: Partial<PipelineConfig['storage']> = {}): PipelineConfig {
  return configWith({ profile: 'local', driver: 'file', eventBus: 'memory', artifactStore: 'local', databaseSsl: false, ...overrides });
}

test('local file storage is explicit and validates without production infrastructure', () => {
  assert.doesNotThrow(() => validateConfig(localConfig()));
});

test('default configuration is production and rejects missing production infrastructure', () => {
  assert.equal(DEFAULT_CONFIG.storage.profile, 'production');
  assert.throws(() => validateConfig(DEFAULT_CONFIG), /DATABASE_URL/);
});

test('postgres storage requires a database URL', () => {
  assert.throws(
    () => validateConfig(localConfig({ driver: 'postgres', databaseUrl: undefined })),
    ConfigurationError,
  );
});

test('PostgreSQL event bus requires PostgreSQL storage', () => {
  assert.throws(
    () => validateConfig(localConfig({ eventBus: 'postgres' })),
    /AI_CODING_EVENT_BUS=postgres requires AI_CODING_STORAGE_DRIVER=postgres/,
  );
});

test('s3 storage requires bucket and region', () => {
  assert.throws(
    () => validateConfig(localConfig({ artifactStore: 's3', s3Bucket: undefined, s3Region: undefined })),
    ConfigurationError,
  );
});

test('production profile rejects local persistence fallback', () => {
  assert.throws(
    () => validateConfig(localConfig({ profile: 'production' })),
    /requires AI_CODING_STORAGE_DRIVER=postgres/,
  );
});

test('complete production storage configuration validates', () => {
  assert.doesNotThrow(() => validateConfig(configWith({
    profile: 'production',
    driver: 'postgres',
    databaseUrl: 'postgres://example.invalid/ai_coding',
    databaseSsl: true,
    eventBus: 'postgres',
    artifactStore: 's3',
    s3Bucket: 'ai-coding-artifacts',
    s3Region: 'us-east-1',
  })));
});

test('production rejects plaintext infrastructure endpoints', () => {
  assert.throws(() => validateConfig(configWith({
    profile: 'production', driver: 'postgres', databaseUrl: 'postgres://example.invalid/db',
    databaseSsl: false, eventBus: 'postgres', artifactStore: 's3', s3Bucket: 'bucket', s3Region: 'region',
  }), { NODE_ENV: 'production' }), /DATABASE_SSL=true/);
});

test('plaintext production infrastructure is allowed only by an explicit test-only gate', () => {
  const plaintext = configWith({
    profile: 'production', driver: 'postgres', databaseUrl: 'postgres://127.0.0.1/test',
    databaseSsl: false, eventBus: 'postgres', artifactStore: 's3', s3Bucket: 'bucket', s3Region: 'region',
    s3Endpoint: 'http://127.0.0.1:9000',
  });
  assert.doesNotThrow(() => validateConfig(plaintext, {
    NODE_ENV: 'test', AI_CODING_ALLOW_INSECURE_TEST_INFRA: '1',
  }));
  assert.throws(() => validateConfig(plaintext, {
    NODE_ENV: 'production', AI_CODING_ALLOW_INSECURE_TEST_INFRA: '1',
  }), /DATABASE_SSL=true/);
  assert.throws(() => validateConfig(plaintext, {
    NODE_ENV: 'test',
  }), /DATABASE_SSL=true/);
});

test('storage dependencies are explicitly composed for local file mode', async () => {
  const config = localConfig();
  const storage = createStorageDependencies(config);
  assert.equal(storage.repositories.runs.constructor.name, 'FileRunRepository');
  assert.equal(storage.artifactStore.constructor.name, 'LocalArtifactStore');
  await storage.close();
});

test('temporary artifact retention is independently validated from workspace retention', () => {
  assert.doesNotThrow(() => validateConfig(localConfig({ workspaceRetentionHours: 1, temporaryArtifactRetentionHours: 72 })));
  assert.throws(() => validateConfig(localConfig({ temporaryArtifactRetentionHours: 0 })), /TEMPORARY_ARTIFACT_RETENTION_HOURS/);
});

test('shadow writing is explicit, file-authoritative, and requires its own database URL', () => {
  assert.throws(() => validateConfig(localConfig({ shadowWriteEnabled: true })), /AI_CODING_SHADOW_DATABASE_URL/);
  assert.doesNotThrow(() => validateConfig(localConfig({
    shadowWriteEnabled: true, shadowDatabaseUrl: 'postgresql:///shadow',
  })));
  assert.throws(() => validateConfig(configWith({
    databaseUrl: 'postgresql:///primary', shadowWriteEnabled: true, shadowDatabaseUrl: 'postgresql:///shadow',
  })), /only valid while file storage remains authoritative/);
});
