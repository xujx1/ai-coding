import * as crypto from 'node:crypto';
import * as path from 'node:path';
import type { ArtifactObject } from '../storage/contracts/artifactStore.js';
import type { StorageContext } from '../storage/contracts/common.js';
import type { ArtifactManager } from '../storage/artifactManager.js';

export interface DurableUploadFile {
  name: string;
  data: Buffer;
  mimetype?: string;
  target?: 'input' | 'project';
}

/** Registers uploaded source material as durable objects before it is used by a workspace. */
export async function persistDurableUploads(args: {
  runId: string;
  files: DurableUploadFile[];
  manager: ArtifactManager;
  context: StorageContext;
}): Promise<ArtifactObject[]> {
  return Promise.all(args.files.map(file => args.manager.uploadAndCommit(args.context, {
    artifactId: uploadArtifactId(args.runId, file),
    runId: args.runId,
    kind: uploadKind(file),
    contentType: file.mimetype || contentType(file.name),
    body: file.data,
    producerNodeId: 'upload',
    retentionClass: 'archive',
  })));
}

function uploadArtifactId(runId: string, file: DurableUploadFile): string {
  return `upload-${crypto.createHash('sha256').update(runId).update('\0').update(file.name).update('\0').update(file.data).digest('hex')}`;
}

function uploadKind(file: DurableUploadFile): string {
  const extension = path.extname(file.name).toLowerCase();
  if (extension === '.zip' || file.target === 'project') return 'project-archive';
  if (['.md', '.txt', '.doc', '.docx', '.pdf'].includes(extension)) return 'mrd';
  return 'upload';
}

function contentType(name: string): string {
  const extension = path.extname(name).toLowerCase();
  if (extension === '.md' || extension === '.txt') return 'text/plain; charset=utf-8';
  if (extension === '.zip') return 'application/zip';
  if (extension === '.json') return 'application/json';
  if (extension === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}
