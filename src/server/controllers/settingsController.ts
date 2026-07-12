import { getRuntimeSettings, saveRuntimeSettings } from '../../settings/index.js';

export function getSettings(c: any) {
  return c.json(getRuntimeSettings());
}

export async function patchSettings(c: any) {
  const body = await c.req.json().catch(() => ({}));
  return c.json(saveRuntimeSettings(body));
}
