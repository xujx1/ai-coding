import { getRuntimeSettings, saveRuntimeSettings } from '../../settings/index.js';

export async function getSettings(c: any) {
  return c.json(await Promise.resolve(getRuntimeSettings()));
}

export async function patchSettings(c: any) {
  const body = await c.req.json().catch(() => ({}));
  return c.json(await saveRuntimeSettings(body));
}
