export type StartupKind = 'frontend' | 'backend';

export type StartupConfidence = 'high' | 'medium' | 'low' | 'none';

export type E2EFailureClassification =
  | 'frontend'
  | 'backend'
  | 'contract'
  | 'environment';

export type E2EVerificationStatus =
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'unsupported';

export interface StartupCommandEvidence {
  kind: StartupKind;
  command: string;
  workingDirectory: string;
  evidence: string[];
  confidence: StartupConfidence;
  fallbackReason?: string;
  frameworkSignals: string[];
  scriptSignals: string[];
}

export interface ApiBaseUrlConvention {
  name: string;
  source: 'common' | 'env-file' | 'source' | 'capability';
  confidence: StartupConfidence;
}

export interface ProjectStartupCapabilitySnapshot {
  projectRoot: string;
  frontend?: StartupCommandEvidence;
  backend?: StartupCommandEvidence;
  readinessEndpoints: string[];
  apiBaseUrlConventions: ApiBaseUrlConvention[];
  playwrightConfig?: string;
  trustedStartup: boolean;
  confidence: StartupConfidence;
  fallbackReasons: string[];
  generatedAt: string;
}

export interface E2ERuntimeConfig {
  enabled: boolean;
  browserConcurrency: number;
  startupTimeoutMs: number;
  readinessTimeoutMs: number;
  artifactRetention: 'all' | 'failures' | 'summary-only';
  startupConfidenceThreshold: StartupConfidence;
}

export interface StartupManifestService {
  kind: StartupKind;
  command?: string;
  originalCommand?: string;
  port?: number;
  url?: string;
  readinessEndpoint?: string;
  logArtifactPath?: string;
  status: 'pending' | 'running' | 'ready' | 'failed' | 'skipped' | 'stopped';
  pid?: number;
  startedAt?: string;
  readyAt?: string;
  stoppedAt?: string;
  error?: string;
}

export interface StartupManifest {
  schemaVersion: 1;
  runId: string;
  appName: string;
  projectRoot: string;
  frontend?: StartupManifestService;
  backend?: StartupManifestService;
  apiBaseUrlInjection?: {
    variableName: string;
    value: string;
    source: string;
  };
  fallbackReasons: string[];
  cleanup: {
    attempted: boolean;
    status: 'pending' | 'completed' | 'failed';
    errors: string[];
  };
  generatedAt: string;
  updatedAt: string;
}

export interface ApiContractInput {
  kind: 'openapi' | 'controller' | 'router' | 'dto' | 'generated-client' | 'mrd-interface';
  path: string;
  endpoints: ApiEndpointEvidence[];
}

export interface ApiEndpointEvidence {
  method: string;
  path: string;
  source: string;
}

export interface ApiContractResult {
  status: 'passed' | 'failed' | 'skipped';
  inputs: ApiContractInput[];
  comparedEndpoints: ApiEndpointEvidence[];
  failures: string[];
  generatedAt: string;
}

export interface ApiSmokeResult {
  status: 'passed' | 'failed' | 'skipped';
  baseUrl?: string;
  checks: Array<{
    name: string;
    method: string;
    url: string;
    status?: number;
    ok: boolean;
    error?: string;
  }>;
  generatedAt: string;
}

export interface ConsoleNetworkDiagnostic {
  consoleErrors: string[];
  networkErrors: Array<{
    url: string;
    method?: string;
    status?: number;
    error?: string;
  }>;
  generatedAt: string;
}

export interface E2ESummary {
  status: E2EVerificationStatus;
  appName: string;
  liveFrontendUrl?: string;
  liveBackendUrl?: string;
  usedProjectPlaywrightConfig: boolean;
  fallbackReason?: string;
  artifactPaths: string[];
  failureClassification?: E2EFailureClassification;
  generatedAt: string;
}

export interface FailureClassificationResult {
  classification: E2EFailureClassification;
  reason: string;
  source: 'startup' | 'contract' | 'smoke' | 'playwright' | 'fallback';
  generatedAt: string;
}
