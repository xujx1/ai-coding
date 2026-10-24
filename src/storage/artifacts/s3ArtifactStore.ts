import * as crypto from 'node:crypto';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from '../../config/types.js';
import type { ArtifactObject, ArtifactPutInput, ArtifactStore, TemporaryArtifactObject } from '../contracts/artifactStore.js';
import type { StorageContext } from '../contracts/common.js';
import { artifactKeySegment, assertSafeArtifactStorageKey, sanitizeDownloadFilename } from './keys.js';

/** S3-compatible store: works with AWS S3 and MinIO endpoints. */
export class S3ArtifactStore implements ArtifactStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: StorageConfig) {
    if (!config.s3Bucket || !config.s3Region) throw new Error('S3 artifact storage requires a bucket and region.');
    this.bucket = config.s3Bucket;
    this.client = new S3Client({
      region: config.s3Region,
      endpoint: config.s3Endpoint,
      forcePathStyle: Boolean(config.s3Endpoint),
      credentials: config.s3AccessKeyId && config.s3SecretAccessKey
        ? { accessKeyId: config.s3AccessKeyId, secretAccessKey: config.s3SecretAccessKey }
        : undefined,
    });
  }

  async putTemporary(ctx: StorageContext, input: ArtifactPutInput): Promise<ArtifactObject> {
    const body = await toBuffer(input.body);
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');
    if (input.expectedSha256 && input.expectedSha256 !== sha256) throw new Error(`Artifact '${input.artifactId}' checksum did not match the expected SHA-256.`);
    const storageKey = key('temporary', ctx.tenantId, input.runId, input.artifactId);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, Body: body, ContentType: input.contentType, Metadata: { sha256 } }));
    return {
      artifactId: input.artifactId, runId: input.runId, tenantId: ctx.tenantId, kind: input.kind, storageKey,
      contentType: input.contentType, sizeBytes: body.byteLength, sha256, producerNodeId: input.producerNodeId,
      retentionClass: input.retentionClass ?? 'standard', committed: false, createdAt: Date.now(),
    };
  }

  async read(_ctx: StorageContext, storageKey: string): Promise<Readable> {
    assertSafeArtifactStorageKey(storageKey);
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    if (!response.Body) throw new Error(`Artifact '${storageKey}' was not found.`);
    return Readable.fromWeb(response.Body.transformToWebStream() as never);
  }

  async stat(_ctx: StorageContext, storageKey: string): Promise<Pick<ArtifactObject, 'storageKey' | 'sizeBytes' | 'sha256' | 'contentType'> | null> {
    assertSafeArtifactStorageKey(storageKey);
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }));
      const sha256 = result.Metadata?.sha256;
      if (!sha256 || result.ContentLength === undefined) return null;
      return { storageKey, sizeBytes: result.ContentLength, sha256, contentType: result.ContentType ?? 'application/octet-stream' };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async commit(ctx: StorageContext, artifact: ArtifactObject): Promise<ArtifactObject> {
    const actual = await this.stat(ctx, artifact.storageKey);
    if (!actual || actual.sizeBytes !== artifact.sizeBytes || actual.sha256 !== artifact.sha256) throw new Error(`Artifact '${artifact.artifactId}' failed integrity verification.`);
    // S3 has no rename. Metadata is committed transactionally; its temporary key remains intentionally addressable.
    return { ...artifact, committed: true };
  }

  async delete(_ctx: StorageContext, storageKey: string): Promise<void> {
    assertSafeArtifactStorageKey(storageKey);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }

  async listTemporary(ctx: StorageContext, olderThan: number): Promise<TemporaryArtifactObject[]> {
    const prefix = `temporary/${segment(ctx.tenantId)}/`;
    const result: TemporaryArtifactObject[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket, Prefix: prefix, ContinuationToken: continuationToken,
      }));
      for (const object of page.Contents ?? []) {
        if (!object.Key || !object.LastModified || object.LastModified.getTime() >= olderThan) continue;
        result.push({ storageKey: object.Key, createdAt: object.LastModified.getTime(), sizeBytes: object.Size ?? 0 });
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return result.sort((a, b) => a.createdAt - b.createdAt || a.storageKey.localeCompare(b.storageKey));
  }

  async createDownloadUrl(_ctx: StorageContext, storageKey: string, expiresInSeconds: number, filename?: string): Promise<string> {
    assertSafeArtifactStorageKey(storageKey);
    const safeFilename = sanitizeDownloadFilename(filename ?? storageKey);
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ResponseContentDisposition: `attachment; filename="${safeFilename}"`,
    }), { expiresIn: Math.max(1, Math.min(expiresInSeconds, 3600)) });
  }
}

function key(namespace: string, tenantId: string, runId: string, artifactId: string): string {
  return [namespace, tenantId, runId, artifactId].map(segment).join('/');
}

function segment(value: string): string {
  return artifactKeySegment(value);
}

async function toBuffer(body: Uint8Array | Readable): Promise<Buffer> {
  if (body instanceof Uint8Array) return Buffer.from(body);
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && ('name' in error) && ((error as { name: string }).name === 'NotFound' || (error as { name: string }).name === 'NoSuchKey');
}
