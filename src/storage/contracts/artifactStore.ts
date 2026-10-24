import type { Readable } from 'node:stream';
import type { Page, PageRequest, StorageContext } from './common.js';

export type ArtifactRetentionClass = 'temporary' | 'workspace' | 'standard' | 'archive';

export interface ArtifactObject {
  artifactId: string;
  runId: string;
  tenantId: string;
  kind: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  producerNodeId?: string;
  retentionClass: ArtifactRetentionClass;
  committed: boolean;
  createdAt: number;
}

export interface ArtifactPutInput {
  artifactId: string;
  runId: string;
  kind: string;
  contentType: string;
  body: Uint8Array | Readable;
  expectedSha256?: string;
  producerNodeId?: string;
  retentionClass?: ArtifactRetentionClass;
}

/** Minimal object listing shape used only by retention maintenance. */
export interface TemporaryArtifactObject {
  storageKey: string;
  createdAt: number;
  sizeBytes: number;
}

export interface ArtifactRepository {
  save(ctx: StorageContext, artifact: ArtifactObject): Promise<ArtifactObject>;
  findById(ctx: StorageContext, artifactId: string): Promise<ArtifactObject | null>;
  listByRun(ctx: StorageContext, runId: string, page?: PageRequest): Promise<Page<ArtifactObject>>;
  markCommitted(ctx: StorageContext, artifactId: string): Promise<ArtifactObject>;
}

export interface ArtifactStore {
  putTemporary(ctx: StorageContext, input: ArtifactPutInput): Promise<ArtifactObject>;
  read(ctx: StorageContext, storageKey: string): Promise<Readable>;
  stat(ctx: StorageContext, storageKey: string): Promise<Pick<ArtifactObject, 'storageKey' | 'sizeBytes' | 'sha256' | 'contentType'> | null>;
  commit(ctx: StorageContext, artifact: ArtifactObject): Promise<ArtifactObject>;
  delete(ctx: StorageContext, storageKey: string): Promise<void>;
  listTemporary(ctx: StorageContext, olderThan: number): Promise<TemporaryArtifactObject[]>;
  createDownloadUrl?(ctx: StorageContext, storageKey: string, expiresInSeconds: number, filename?: string): Promise<string>;
}
