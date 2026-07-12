import { E2ERuntimeConfig, StartupConfidence } from './types.js';

const CONFIDENCE_ORDER: Record<StartupConfidence, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export function loadE2ERuntimeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): E2ERuntimeConfig {
  return {
    enabled: env.AI_CODING_E2E_VERIFY !== '0',
    browserConcurrency: positiveInt(env.AI_CODING_E2E_BROWSER_CONCURRENCY, 1),
    startupTimeoutMs: positiveInt(env.AI_CODING_E2E_STARTUP_TIMEOUT_MS, 30_000),
    readinessTimeoutMs: positiveInt(env.AI_CODING_E2E_READINESS_TIMEOUT_MS, 15_000),
    artifactRetention: parseRetention(env.AI_CODING_E2E_ARTIFACT_RETENTION),
    startupConfidenceThreshold: parseConfidence(env.AI_CODING_E2E_STARTUP_CONFIDENCE, 'medium'),
  };
}

export function confidenceMeetsThreshold(
  actual: StartupConfidence,
  threshold: StartupConfidence
): boolean {
  return CONFIDENCE_ORDER[actual] >= CONFIDENCE_ORDER[threshold];
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseRetention(value: string | undefined): E2ERuntimeConfig['artifactRetention'] {
  if (value === 'all' || value === 'failures' || value === 'summary-only') return value;
  return 'failures';
}

function parseConfidence(value: string | undefined, fallback: StartupConfidence): StartupConfidence {
  if (value === 'high' || value === 'medium' || value === 'low' || value === 'none') return value;
  return fallback;
}
