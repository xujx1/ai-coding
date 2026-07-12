import { BUILTIN_APP_BRANCH_WORKFLOW_ID } from '../../../builtinDefinitions.js';
import { FanoutConfig } from '../../../types.js';
import {
  BranchState,
  GraphProjectState,
  PipelineGraphState,
  PipelineGraphStatePatch,
  createEmptyRetryState,
} from '../state.js';

export interface FanoutProjectInput {
  name: string;
  root: string;
}

export function createFanoutBranches(
  state: PipelineGraphState,
  projects: FanoutProjectInput[],
  config: FanoutConfig,
  joinNodeId = 'app-join'
): PipelineGraphStatePatch {
  if (projects.length === 0) {
    return {
      status: 'failed',
      error: 'Fanout could not resolve any project branches.',
    };
  }

  const branches = Object.fromEntries(
    projects.map((project) => {
      const branchId = createStableBranchId(state.runId, project.name);
      return [branchId, createBranchState(branchId, project, config.branchWorkflowId)];
    })
  );
  const branchOrder = Object.keys(branches);

  return {
    branches,
    branchOrder,
    joins: {
      [joinNodeId]: {
        joinNodeId,
        waitingForBranchIds: branchOrder,
        completedBranchIds: [],
        failedBranchIds: [],
        status: 'waiting',
      },
    },
    projects: projects.map((project) => toGraphProjectState(state.runId, project)),
  };
}

export function createDefaultFanoutConfig(
  overrides: Partial<FanoutConfig> = {}
): FanoutConfig {
  return {
    source: 'projects',
    branchWorkflowId: BUILTIN_APP_BRANCH_WORKFLOW_ID,
    concurrencyLimit: 4,
    failurePolicy: 'continue_and_collect',
    ...overrides,
  };
}

export function createStableBranchId(runId: string, projectName: string): string {
  const safeProjectName = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
  return `${runId}-${safeProjectName}`;
}

function createBranchState(
  branchId: string,
  project: FanoutProjectInput,
  workflowId: string
): BranchState {
  return {
    branchId,
    workflowId,
    projectName: project.name,
    projectRoot: project.root,
    status: 'pending',
    nodes: {},
    artifactIndex: {},
    contextManifests: {},
    childAgentIds: [],
    retry: createEmptyRetryState(),
  };
}

function toGraphProjectState(
  runId: string,
  project: FanoutProjectInput
): GraphProjectState {
  return {
    name: project.name,
    root: project.root,
    branchId: createStableBranchId(runId, project.name),
    status: 'pending',
    retry: createEmptyRetryState(),
  };
}
