export async function postJson(baseUrl, path, body = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const reason = payload?.error || response.statusText;
    throw new Error(`${path} failed with ${response.status}: ${reason}`);
  }
  return payload;
}

export async function getJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  const payload = await readJson(response);
  if (!response.ok) {
    const reason = payload?.error || response.statusText;
    throw new Error(`${path} failed with ${response.status}: ${reason}`);
  }
  return payload;
}

export async function isHealthy(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
