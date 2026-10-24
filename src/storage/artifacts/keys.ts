/** Values used in object keys and response headers must never retain path or control characters. */
export function artifactKeySegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9._-]/g, '-');
  if (!normalized || normalized === '.' || normalized === '..') throw new Error('Invalid artifact storage key segment.');
  return normalized;
}

export function assertSafeArtifactStorageKey(storageKey: string): string {
  if (!storageKey || storageKey.includes('\\') || storageKey.startsWith('/') || storageKey.includes('\0')) {
    throw new Error(`Invalid artifact storage key '${storageKey}'.`);
  }
  const segments = storageKey.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || artifactKeySegment(segment) !== segment)) {
    throw new Error(`Invalid artifact storage key '${storageKey}'.`);
  }
  return storageKey;
}

/** RFC 6266-safe ASCII fallback; callers may additionally use filename*. */
export function sanitizeDownloadFilename(value: string): string {
  const basename = value.replace(/\\/g, '/').split('/').at(-1) ?? '';
  const safe = basename.replace(/[\x00-\x1f\x7f"\\/;]/g, '-').trim().replace(/\s+/g, ' ');
  return safe && safe !== '.' && safe !== '..' ? safe.slice(0, 180) : 'artifact-download';
}
