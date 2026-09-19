export function jsonEqual(a: string, b: string): boolean {
  try {
    const parsedA = JSON.parse(a) as unknown;
    const parsedB = JSON.parse(b) as unknown;
    return deepEqual(parsedA, parsedB);
  } catch {
    return false;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => deepEqual(objA[key], objB[key]));
}

export function defaultInputSchema(parameters?: Record<string, unknown>): Record<string, unknown> {
  return parameters ?? { type: "object", properties: {} };
}
