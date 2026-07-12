export function deepMerge(base: Record<string, any>, override: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = { ...base };
  for (const key of Object.keys(override)) {
    const val = override[key];
    if (val !== undefined) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val) && typeof result[key] === 'object' && result[key] !== null) {
        result[key] = deepMerge(result[key], val);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}
