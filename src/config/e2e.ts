import type { E2eConfig } from './types.js';

export const DEFAULT_E2E_CONFIG: E2eConfig = {
  enabled: true,
  browserConcurrency: 1,
  startupTimeoutMs: 30000,
  readinessTimeoutMs: 15000,
  artifactRetention: 'failures',
};

export function loadE2eEnv(env: NodeJS.ProcessEnv = process.env): Partial<E2eConfig> {
  const config: Partial<E2eConfig> = {};

  if (env.AI_CODING_E2E_VERIFY) {
    config.enabled = env.AI_CODING_E2E_VERIFY !== '0';
  }
  if (env.AI_CODING_E2E_BROWSER_CONCURRENCY) {
    config.browserConcurrency = parseInt(env.AI_CODING_E2E_BROWSER_CONCURRENCY, 10);
  }
  if (env.AI_CODING_E2E_STARTUP_TIMEOUT_MS) {
    config.startupTimeoutMs = parseInt(env.AI_CODING_E2E_STARTUP_TIMEOUT_MS, 10);
  }
  if (env.AI_CODING_E2E_READINESS_TIMEOUT_MS) {
    config.readinessTimeoutMs = parseInt(env.AI_CODING_E2E_READINESS_TIMEOUT_MS, 10);
  }

  const retention = env.AI_CODING_E2E_ARTIFACT_RETENTION;
  if (retention === 'all' || retention === 'failures' || retention === 'summary-only') {
    config.artifactRetention = retention;
  }

  return config;
}
