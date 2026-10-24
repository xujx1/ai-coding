import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { ArtifactManager } from './artifactManager.js';
import type { ArtifactObject } from './contracts/artifactStore.js';
import type { StorageContext } from './contracts/common.js';

export interface PipelineArtifactWriter {
  write(input: {
    runId: string;
    nodeId: string;
    relativePath: string;
    body: Buffer;
    contentType?: string;
    artifactId?: string;
    kind?: string;
  }): Promise<ArtifactObject>;
}

/** Explicit workflow-facing boundary for formal generated artifacts. */
export function createPipelineArtifactWriter(
  manager: ArtifactManager,
  context: StorageContext,
  options: { deferMetadata?: boolean } = {},
): PipelineArtifactWriter {
  return {
    write: ({ runId, nodeId, relativePath, body, contentType, artifactId, kind }) => manager[
      options.deferMetadata ? 'uploadPrepared' : 'uploadAndCommit'
    ](context, {
      artifactId: artifactId ?? `pipeline-${crypto.createHash('sha256').update(runId).update('\0').update(nodeId).update('\0').update(relativePath).update('\0').update(body).digest('hex')}`,
      runId,
      kind: kind ?? artifactKind(relativePath), contentType: contentType ?? contentTypeFor(relativePath), body,
      producerNodeId: nodeId, retentionClass: 'archive',
    }),
  };
}

function artifactKind(relativePath: string): string {
  if (relativePath.startsWith('downloads/') || relativePath.endsWith('.zip')) return 'download-bundle';
  if (/screenshot|playwright/i.test(relativePath)) return 'screenshot';
  if (/report|review|result/i.test(relativePath)) return 'report';
  if (/\.log$/i.test(relativePath)) return 'log';
  return 'pipeline-artifact';
}

function contentTypeFor(relativePath: string): string {
  const extension = path.extname(relativePath).toLowerCase();
  if (extension === '.md' || extension === '.txt' || extension === '.log') return 'text/plain; charset=utf-8';
  if (extension === '.json') return 'application/json';
  if (extension === '.zip') return 'application/zip';
  if (extension === '.png') return 'image/png';
  return 'application/octet-stream';
}
