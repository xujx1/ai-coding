import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import type {
  ArtifactObject,
  ArtifactPutInput,
  ArtifactStore,
  TemporaryArtifactObject,
} from '../contracts/artifactStore.js';
import type { StorageContext } from '../contracts/common.js';
import { artifactKeySegment, assertSafeArtifactStorageKey } from './keys.js';

export class LocalArtifactStore implements ArtifactStore {
  constructor(private readonly rootDir: string) {}

  async putTemporary(ctx: StorageContext, input: ArtifactPutInput): Promise<ArtifactObject> {
    const body = await toBuffer(input.body);
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');
    if (input.expectedSha256 && input.expectedSha256 !== sha256) {
      throw new Error(`Artifact '${input.artifactId}' checksum did not match the expected SHA-256.`);
    }
    const storageKey = this.key('temporary', ctx.tenantId, input.runId, input.artifactId);
    const file = this.resolve(storageKey);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
    return {
      artifactId: input.artifactId,
      runId: input.runId,
      tenantId: ctx.tenantId,
      kind: input.kind,
      storageKey,
      contentType: input.contentType,
      sizeBytes: body.byteLength,
      sha256,
      producerNodeId: input.producerNodeId,
      retentionClass: input.retentionClass ?? 'standard',
      committed: false,
      createdAt: Date.now(),
    };
  }

  async read(_ctx: StorageContext, storageKey: string): Promise<Readable> {
    return fs.createReadStream(this.resolve(storageKey));
  }

  async stat(_ctx: StorageContext, storageKey: string): Promise<Pick<ArtifactObject, 'storageKey' | 'sizeBytes' | 'sha256' | 'contentType'> | null> {
    const file = this.resolve(storageKey);
    if (!fs.existsSync(file)) return null;
    const body = fs.readFileSync(file);
    return {
      storageKey,
      sizeBytes: body.byteLength,
      sha256: crypto.createHash('sha256').update(body).digest('hex'),
      contentType: 'application/octet-stream',
    };
  }

  async commit(_ctx: StorageContext, artifact: ArtifactObject): Promise<ArtifactObject> {
    const source = this.resolve(artifact.storageKey);
    if (!fs.existsSync(source)) throw new Error(`Temporary artifact '${artifact.storageKey}' was not found.`);
    const targetKey = this.key('committed', artifact.tenantId, artifact.runId, artifact.artifactId);
    const target = this.resolve(targetKey);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
    return { ...artifact, storageKey: targetKey, committed: true };
  }

  async delete(_ctx: StorageContext, storageKey: string): Promise<void> {
    fs.rmSync(this.resolve(storageKey), { force: true });
  }

  async listTemporary(ctx: StorageContext, olderThan: number): Promise<TemporaryArtifactObject[]> {
    const prefix = this.resolve(['temporary', segment(ctx.tenantId)].join('/'));
    if (!fs.existsSync(prefix)) return [];
    const result: TemporaryArtifactObject[] = [];
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (entry.isFile()) {
          const stat = fs.statSync(file);
          if (stat.mtimeMs < olderThan) {
            result.push({
              storageKey: path.relative(this.rootDir, file).split(path.sep).join('/'),
              createdAt: stat.mtimeMs,
              sizeBytes: stat.size,
            });
          }
        }
      }
    };
    visit(prefix);
    return result.sort((a, b) => a.createdAt - b.createdAt || a.storageKey.localeCompare(b.storageKey));
  }

  private key(namespace: string, tenantId: string, runId: string, artifactId: string): string {
    return [namespace, segment(tenantId), segment(runId), segment(artifactId)].join('/');
  }

  private resolve(storageKey: string): string {
    const normalized = assertSafeArtifactStorageKey(storageKey).split('/').map(artifactKeySegment).join(path.sep);
    const resolved = path.resolve(this.rootDir, normalized);
    const root = path.resolve(this.rootDir);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Artifact storage key escapes the local root: ${storageKey}`);
    }
    return resolved;
  }
}

async function toBuffer(body: Uint8Array | Readable): Promise<Buffer> {
  if (body instanceof Uint8Array) return Buffer.from(body);
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function segment(value: string): string {
  return artifactKeySegment(value);
}
