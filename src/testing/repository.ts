import * as fs from 'fs';
import * as path from 'path';
import type { ArtifactRef, LifecycleState } from '../lifecycle/types.js';
import {
  isTestingArtifactType,
  registerTestingArtifact,
  type TestingArtifactType,
} from '../lifecycle/testingArtifacts.js';
import type { RunPaths } from '../runtime/paths.js';
import {
  testingArtifactFileName,
  validateTestingArtifact,
  type TestingArtifact,
} from './artifacts.js';

export interface SaveTestingArtifactInput {
  paths: RunPaths;
  state: LifecycleState;
  artifact: TestingArtifact;
  summary?: string;
  artifactId?: string;
}

export interface SavedTestingArtifact<T extends TestingArtifact = TestingArtifact> {
  artifact: T;
  ref: ArtifactRef;
}

export class TestingArtifactRepository {
  save<T extends TestingArtifact>(input: SaveTestingArtifactInput & { artifact: T }): SavedTestingArtifact<T> {
    const artifact = validateTestingArtifact(input.artifact) as T;
    const relativePath = testingArtifactRelativePath(artifact);
    const absolutePath = path.join(input.paths.runDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, JSON.stringify(artifact, null, 2), 'utf-8');

    const ref = registerTestingArtifact(input.state, {
      type: artifact.artifactKind,
      path: relativePath,
      producerWorkflowRunId: artifact.workflowInstanceId,
      sourceId: artifact.sourceNodeId,
      summary: input.summary ?? artifactSummary(artifact),
      metadata: {
        artifactId: input.artifactId,
        artifactKind: artifact.artifactKind,
        status: artifact.status,
        testRunId: artifact.testRunId,
        deploymentSetId: artifact.deploymentSetId,
        environmentId: artifact.environmentId,
      },
    });

    return { artifact, ref };
  }

  read<T extends TestingArtifact = TestingArtifact>(paths: RunPaths, ref: ArtifactRef): SavedTestingArtifact<T> {
    if (!isTestingArtifactType(ref.type)) {
      throw new Error(`Artifact ${ref.artifactId} is not a testing artifact: ${ref.type}`);
    }
    if (!ref.path) {
      throw new Error(`Testing artifact ${ref.artifactId} does not have a path`);
    }
    const absolutePath = path.join(paths.runDir, ref.path);
    const artifact = validateTestingArtifact(JSON.parse(fs.readFileSync(absolutePath, 'utf-8'))) as T;
    return { artifact, ref };
  }

  list(state: LifecycleState, filters: {
    type?: TestingArtifactType;
    workflowInstanceId?: string;
    testRunId?: string;
  } = {}): ArtifactRef[] {
    return state.artifacts.filter(ref => {
      if (!isTestingArtifactType(ref.type)) return false;
      if (filters.type && ref.type !== filters.type) return false;
      if (filters.workflowInstanceId && ref.producerWorkflowRunId !== filters.workflowInstanceId) return false;
      if (filters.testRunId && ref.metadata?.testRunId !== filters.testRunId) return false;
      return true;
    });
  }

  findById(state: LifecycleState, artifactId: string): ArtifactRef | undefined {
    return state.artifacts.find(ref => ref.artifactId === artifactId && isTestingArtifactType(ref.type));
  }
}

export function testingArtifactRelativePath(artifact: TestingArtifact): string {
  return path.posix.join(
    'artifacts',
    'testing',
    safeSegment(artifact.workflowInstanceId),
    safeSegment(artifact.sourceNodeId),
    testingArtifactFileName(artifact),
  );
}

function artifactSummary(artifact: TestingArtifact): string {
  switch (artifact.artifactKind) {
    case 'testing-strategy':
      return artifact.title;
    case 'testing-test-cases':
      return `${artifact.cases.length} testing cases`;
    case 'testing-data-plan':
      return `${artifact.steps.length} data setup steps`;
    case 'testing-generated-script':
      return artifact.command;
    case 'testing-execution-report':
      return `${artifact.summary.passed}/${artifact.summary.total} tests passed`;
    case 'testing-coverage-report':
      return `Requirement coverage ${Math.round(artifact.requirementCoverage * 100)}%`;
    case 'testing-failure-triage':
      return `${artifact.category} failure triage`;
    case 'testing-regression-plan':
      return `${artifact.rerunCaseIds.length} cases selected for regression`;
    case 'testing-quality-gate':
      return `Quality gate ${artifact.decision}`;
  }
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}
