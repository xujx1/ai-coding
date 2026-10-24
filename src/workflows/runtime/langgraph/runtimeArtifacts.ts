import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRunPaths } from '../../../runtime/paths.js';
import type { ArtifactObject } from '../../../storage/contracts/artifactStore.js';
import type { PipelineArtifactWriter } from '../../../storage/pipelineArtifactWriter.js';
import type { PipelineGraphState } from './state.js';

/** Upload only artifact paths first exposed by the current graph transition. */
export async function prepareGraphTransitionArtifacts(
  before: PipelineGraphState,
  after: PipelineGraphState,
  nodeId: string,
  writer?: PipelineArtifactWriter,
): Promise<ArtifactObject[]> {
  if (!writer) return [];
  const prior = graphArtifactPaths(before);
  const paths = [...graphArtifactPaths(after)].filter(artifactPath => !prior.has(artifactPath));
  const runRoot = path.resolve(getRunPaths(after.runId).runDir);
  const prepared: ArtifactObject[] = [];
  for (const artifactPath of paths) {
    const absolutePath = resolveRunArtifact(runRoot, artifactPath);
    if (!absolutePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) continue;
    prepared.push(await writer.write({
      runId: after.runId,
      nodeId,
      relativePath: normalizeRelativeArtifactPath(artifactPath),
      body: fs.readFileSync(absolutePath),
    }));
  }
  return prepared;
}

function graphArtifactPaths(state: PipelineGraphState): Set<string> {
  const result = new Set<string>();
  const add = (values?: string[]) => values?.forEach(value => result.add(value));
  Object.values(state.artifactIndex).forEach(add);
  Object.values(state.nodes).forEach(node => add(node.outputArtifacts));
  Object.values(state.branches).forEach(branch => {
    Object.values(branch.artifactIndex).forEach(add);
    Object.values(branch.nodes).forEach(node => add(node.outputArtifacts));
    Object.values(branch.tracks ?? {}).forEach(track => Object.values(track.artifactIndex).forEach(add));
  });
  return result;
}

function resolveRunArtifact(runRoot: string, artifactPath: string): string | undefined {
  const relative = normalizeRelativeArtifactPath(artifactPath);
  const resolved = path.resolve(runRoot, relative);
  if (resolved !== runRoot && !resolved.startsWith(`${runRoot}${path.sep}`)) return undefined;
  return resolved;
}

function normalizeRelativeArtifactPath(artifactPath: string): string {
  return artifactPath.replace(/\\/g, '/').replace(/^\/+/, '');
}
