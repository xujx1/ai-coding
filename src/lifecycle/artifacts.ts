import { nanoid } from 'nanoid';
import type { ArtifactRef, ArtifactSourceType, LifecycleState } from './types.js';

export interface RegisterArtifactInput {
  type: string;
  path?: string;
  uri?: string;
  appId?: string;
  producerNodeRunId?: string;
  producerWorkflowRunId?: string;
  sourceType: ArtifactSourceType;
  sourceId?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  now?: number;
}

export function createArtifactRef(
  state: Pick<LifecycleState, 'requirementId' | 'runId'>,
  input: RegisterArtifactInput,
): ArtifactRef {
  return {
    artifactId: input.metadata?.artifactId ? String(input.metadata.artifactId) : `artifact_${nanoid()}`,
    requirementId: state.requirementId,
    runId: state.runId,
    type: input.type,
    path: input.path,
    uri: input.uri,
    appId: input.appId,
    producerNodeRunId: input.producerNodeRunId,
    producerWorkflowRunId: input.producerWorkflowRunId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    summary: input.summary,
    metadata: input.metadata,
    createdAt: input.now ?? Date.now(),
  };
}

export function registerArtifact(
  state: LifecycleState,
  input: RegisterArtifactInput,
): ArtifactRef {
  const artifact = createArtifactRef(state, input);
  state.artifacts = [
    ...state.artifacts.filter(existing => existing.artifactId !== artifact.artifactId),
    artifact,
  ];
  if (artifact.appId) {
    state.apps = state.apps.map(app => app.appId === artifact.appId
      ? { ...app, artifactIds: unique([...app.artifactIds, artifact.artifactId]) }
      : app
    );
  }
  return artifact;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

