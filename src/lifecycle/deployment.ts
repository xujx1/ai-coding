import * as fs from 'fs';
import * as path from 'path';
import type { RunPaths } from '../runtime/paths.js';
import type {
  ArtifactRef,
  EnvironmentRef,
  LifecycleState,
  RequirementDeploymentSetRef,
} from './types.js';
import { registerArtifact } from './artifacts.js';

export interface AppBuildRef {
  appId: string;
  branchName: string;
  repoRef?: string;
  pipelineRunId?: string;
  buildId?: string;
  imageTag?: string;
  imageDigest?: string;
  changedFiles?: string[];
}

export interface AppDeployPlan {
  appId: string;
  role: 'primary' | 'secondary';
  branchName?: string;
  repoRef?: string;
  pipelineRunId?: string;
  deployStrategy: 'feature-version' | 'stable-version';
  reason: string;
}

export interface AppTestOnlyPlan {
  appId: string;
  stableVersionRef?: string;
  reason: string;
}

export interface DataIsolationPlan {
  strategy: 'tenant' | 'namespace' | 'dedicated-db' | 'none';
  key?: string;
  cleanupRequired: boolean;
  rollbackRef?: string;
}

export interface EnvironmentPlan {
  schemaVersion: 1;
  requirementId: string;
  runId: string;
  mode: EnvironmentRef['mode'];
  primaryApps: AppDeployPlan[];
  secondaryApps: AppDeployPlan[];
  testOnlyApps: AppTestOnlyPlan[];
  dataIsolation: DataIsolationPlan;
  environmentRefs: string[];
  risks: string[];
  generatedAt: number;
}

export interface CreateEnvironmentPlanInput {
  state: LifecycleState;
  primaryApps: string[];
  secondaryApps: string[];
  testOnlyApps: string[];
  buildRefs: AppBuildRef[];
  sharedEnvironmentHealthy?: boolean;
  requiresDedicated?: boolean;
  localOnly?: boolean;
  dataIsolation?: Partial<DataIsolationPlan>;
  now?: number;
}

export function createEnvironmentPlan(input: CreateEnvironmentPlanInput): EnvironmentPlan {
  const buildByApp = new Map(input.buildRefs.map(ref => [ref.appId, ref]));
  const mode = selectEnvironmentMode(input);
  const risks = collectEnvironmentRisks(input, mode);
  return {
    schemaVersion: 1,
    requirementId: input.state.requirementId,
    runId: input.state.runId,
    mode,
    primaryApps: input.primaryApps.map(appId => toDeployPlan(appId, 'primary', buildByApp.get(appId))),
    secondaryApps: input.secondaryApps.map(appId => toDeployPlan(appId, 'secondary', buildByApp.get(appId))),
    testOnlyApps: input.testOnlyApps.map(appId => ({
      appId,
      reason: 'App is impacted but does not deploy a feature version by default.',
    })),
    dataIsolation: {
      strategy: input.dataIsolation?.strategy ?? 'tenant',
      key: input.dataIsolation?.key ?? `${input.state.requirementId}-${input.state.runId}`,
      cleanupRequired: input.dataIsolation?.cleanupRequired ?? true,
      rollbackRef: input.dataIsolation?.rollbackRef,
    },
    environmentRefs: [],
    risks,
    generatedAt: input.now ?? Date.now(),
  };
}

export function createRequirementDeploymentSet(args: {
  state: LifecycleState;
  environmentId: string;
  apps: AppBuildRef[];
  artifactIds?: string[];
  now?: number;
}): RequirementDeploymentSetRef {
  const previousVersions = args.state.deploymentSets.map(set => set.version);
  const version = previousVersions.length ? Math.max(...previousVersions) + 1 : 1;
  const deploymentSet: RequirementDeploymentSetRef = {
    deploymentSetId: `deployment-set-${args.state.runId}-v${version}`,
    requirementId: args.state.requirementId,
    runId: args.state.runId,
    version,
    environmentId: args.environmentId,
    appIds: args.apps.map(app => app.appId),
    pipelineRunIds: args.apps.flatMap(app => app.pipelineRunId ? [app.pipelineRunId] : []),
    artifactIds: args.artifactIds ?? [],
    createdAt: args.now ?? Date.now(),
  };
  args.state.deploymentSets = [...args.state.deploymentSets, deploymentSet];
  return deploymentSet;
}

export function registerDeploymentArtifacts(args: {
  paths: RunPaths;
  state: LifecycleState;
  environmentPlan: EnvironmentPlan;
  deploymentSet: RequirementDeploymentSetRef;
  ciLogRefs?: ArtifactRef[];
  environmentRefs?: EnvironmentRef[];
}): { environmentPlanRef: ArtifactRef; deploymentSetRef: ArtifactRef } {
  const deploymentDir = path.join(args.paths.artifactsDir, 'deployment');
  fs.mkdirSync(deploymentDir, { recursive: true });
  const environmentPlanPath = path.join(deploymentDir, 'environment-plan.json');
  const deploymentSetPath = path.join(deploymentDir, `deployment-set-v${args.deploymentSet.version}.json`);
  fs.writeFileSync(environmentPlanPath, JSON.stringify(args.environmentPlan, null, 2), 'utf-8');
  fs.writeFileSync(deploymentSetPath, JSON.stringify({
    ...args.deploymentSet,
    ciLogArtifactIds: args.ciLogRefs?.map(ref => ref.artifactId) ?? [],
    environmentIds: args.environmentRefs?.map(ref => ref.environmentId) ?? [],
  }, null, 2), 'utf-8');
  for (const environment of args.environmentRefs ?? []) {
    args.state.environments = [
      ...args.state.environments.filter(existing => existing.environmentId !== environment.environmentId),
      environment,
    ];
  }
  return {
    environmentPlanRef: registerArtifact(args.state, {
      type: 'environment-plan',
      path: 'artifacts/deployment/environment-plan.json',
      sourceType: 'workflow',
      summary: 'Test environment deployment scope plan',
    }),
    deploymentSetRef: registerArtifact(args.state, {
      type: 'requirement-deployment-set',
      path: `artifacts/deployment/deployment-set-v${args.deploymentSet.version}.json`,
      sourceType: 'runtime',
      summary: `Requirement deployment set v${args.deploymentSet.version}`,
    }),
  };
}

function selectEnvironmentMode(input: CreateEnvironmentPlanInput): EnvironmentRef['mode'] {
  if (input.localOnly) return 'local-simulated';
  if (input.requiresDedicated || input.sharedEnvironmentHealthy === false) return 'dedicated';
  return 'shared-overlay';
}

function collectEnvironmentRisks(input: CreateEnvironmentPlanInput, mode: EnvironmentRef['mode']): string[] {
  const risks: string[] = [];
  if (input.sharedEnvironmentHealthy === false) risks.push('Shared environment is unhealthy.');
  if (input.requiresDedicated && mode !== 'dedicated') risks.push('Dedicated environment was requested but not selected.');
  if ((input.primaryApps.length + input.secondaryApps.length) === 0) risks.push('No deployable apps are selected.');
  return risks;
}

function toDeployPlan(appId: string, role: AppDeployPlan['role'], build?: AppBuildRef): AppDeployPlan {
  return {
    appId,
    role,
    branchName: build?.branchName,
    repoRef: build?.repoRef,
    pipelineRunId: build?.pipelineRunId,
    deployStrategy: build ? 'feature-version' : 'stable-version',
    reason: build
      ? 'App has a build ref and deploys the feature version.'
      : 'App has no build ref and reuses the stable version.',
  };
}

