import { Readable } from 'node:stream';
import type { ArtifactStore } from '../../storage/contracts/artifactStore.js';
import type { ArtifactRepository } from '../../storage/contracts/artifactStore.js';
import type { StorageContext } from '../../storage/contracts/common.js';

export function listRunArtifacts(c: any, dependencies: { artifacts: ArtifactRepository; context: StorageContext }) {
  return dependencies.artifacts.listByRun(dependencies.context, c.req.param('runId'), {
    cursor: c.req.query('cursor'), limit: positiveInt(c.req.query('limit')),
  }).then(page => c.json({ artifacts: page.items, nextCursor: page.nextCursor }));
}

export async function getArtifactContent(c: any, dependencies: { artifacts: ArtifactRepository; store: ArtifactStore; context: StorageContext }) {
  const artifact = await dependencies.artifacts.findById(dependencies.context, c.req.param('artifactId'));
  if (!isReadableArtifact(artifact, c.req.param('runId'), dependencies.context)) return c.json({ error: 'Artifact not found' }, 404);
  return streamResponse(await dependencies.store.read(dependencies.context, artifact.storageKey), {
    'Content-Type': artifact.contentType,
    'Content-Length': String(artifact.sizeBytes),
  });
}

export async function downloadArtifact(c: any, dependencies: { artifacts: ArtifactRepository; store: ArtifactStore; context: StorageContext }) {
  const artifact = await dependencies.artifacts.findById(dependencies.context, c.req.param('artifactId'));
  if (!isReadableArtifact(artifact, c.req.param('runId'), dependencies.context)) return c.json({ error: 'Artifact not found' }, 404);
  const filename = safeFilename(c.req.query('filename') || artifact.artifactId);
  if (dependencies.store.createDownloadUrl) {
    const url = await dependencies.store.createDownloadUrl(dependencies.context, artifact.storageKey, 300, filename);
    return c.json({ artifactId: artifact.artifactId, url, expiresInSeconds: 300 });
  }
  const encoded = encodeURIComponent(filename);
  return streamResponse(await dependencies.store.read(dependencies.context, artifact.storageKey), {
    'Content-Type': artifact.contentType,
    'Content-Length': String(artifact.sizeBytes),
    'Content-Disposition': `attachment; filename="artifact"; filename*=UTF-8''${encoded}`,
  });
}

function positiveInt(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 500) : undefined;
}

function safeFilename(value: string): string {
  const sanitized = value.replace(/[\\/\r\n\0]/g, '-').replace(/^\.+/, '').trim();
  return sanitized || 'artifact';
}

function isReadableArtifact(
  artifact: Awaited<ReturnType<ArtifactRepository['findById']>>,
  runId: string,
  context: StorageContext,
): artifact is NonNullable<typeof artifact> {
  return Boolean(artifact && artifact.runId === runId && artifact.tenantId === context.tenantId && artifact.committed);
}

function streamResponse(stream: Readable, headers: Record<string, string>): Response {
  return new Response(Readable.toWeb(stream) as ReadableStream, { headers });
}
