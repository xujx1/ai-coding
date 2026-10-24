import * as crypto from 'node:crypto';

/** Stable representation shared by file imports, PostgreSQL verification, and exports. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function checksum(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalize(value)).digest('hex');
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, normalize(record[key])]));
  }
  return String(value);
}
