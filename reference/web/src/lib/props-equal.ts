/**
 * Structural props comparison for React.memo on pure instrument faces.
 * Callers often pass freshly built arrays/objects every render (bands, nav data, ...): compare those by value
 * (plain objects and arrays only, limited depth) instead of by identity so unchanged faces can skip rendering.
 * React elements compare by type, key and props; functions and class instances compare by identity.
 */
function plain(v: unknown): v is Record<string, unknown> | unknown[] {
  if (typeof v !== "object" || v === null) return false;
  if (Array.isArray(v)) return true;
  const proto = Object.getPrototypeOf(v);
  return (proto === Object.prototype || proto === null) && !("$$typeof" in (v as object));
}

const isElement = (v: unknown): v is { type: unknown; key: unknown; props: unknown } =>
  typeof v === "object" && v !== null && "$$typeof" in (v as object) && "props" in (v as object) && "type" in (v as object);

function eq(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (depth <= 0) return false;
  // React elements built inline each render (captions, windows): equal when type, key and props are equal.
  if (isElement(a) && isElement(b)) return a.type === b.type && a.key === b.key && eq(a.props, b.props, depth - 1);
  if (!plain(a) || !plain(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!eq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], depth - 1)) return false;
  }
  return true;
}

export function propsEqual<P extends object>(prev: Readonly<P>, next: Readonly<P>): boolean {
  return eq(prev, next, 4);
}

/** Structural equality for selector results (plain objects / arrays, deep). Anything it cannot compare counts as "changed". */
export function deepEqual<T>(a: T, b: T): boolean {
  return eq(a, b, 10);
}
