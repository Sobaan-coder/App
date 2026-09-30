/**
 * Step input templating: "{{steps.s1.tasks}}", "{{trigger.file.id}}", "{{item.url}}".
 * A string that is exactly one placeholder is replaced by the raw value (arrays/objects kept);
 * otherwise placeholders are interpolated as text.
 */
const FULL = /^\{\{\s*([\w.[\]-]+)\s*\}\}$/;
const ANY = /\{\{\s*([\w.[\]-]+)\s*\}\}/g;

export function getPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function resolveTemplates<T>(value: T, scope: Record<string, unknown>): T {
  if (typeof value === "string") {
    const full = FULL.exec(value);
    if (full) return getPath(scope, full[1]) as T;
    return value.replace(ANY, (_, p: string) => {
      const v = getPath(scope, p);
      if (v === undefined || v === null) return "";
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    }) as T;
  }
  if (Array.isArray(value)) return value.map((v) => resolveTemplates(v, scope)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveTemplates(v, scope);
    return out as T;
  }
  return value;
}

/** Evaluate a simple condition used by workflow "condition" steps. */
export function evaluateCondition(
  cond: { left: string; op: string; right?: unknown },
  scope: Record<string, unknown>,
): boolean {
  const l = resolveTemplates(cond.left, scope);
  const r = resolveTemplates(cond.right, scope);
  const num = (v: unknown) => (Array.isArray(v) ? v.length : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : v);
  switch (cond.op) {
    case "exists":
      return l !== undefined && l !== null && l !== "" && !(Array.isArray(l) && l.length === 0);
    case "not_exists":
      return l === undefined || l === null || l === "" || (Array.isArray(l) && l.length === 0);
    case "truthy":
      return Boolean(num(l));
    case "falsy":
      return !num(l);
    case "eq":
      return String(l) === String(r);
    case "neq":
      return String(l) !== String(r);
    case "gt":
      return Number(num(l)) > Number(num(r));
    case "gte":
      return Number(num(l)) >= Number(num(r));
    case "lt":
      return Number(num(l)) < Number(num(r));
    case "lte":
      return Number(num(l)) <= Number(num(r));
    case "contains":
      return Array.isArray(l) ? l.map(String).includes(String(r)) : String(l ?? "").toLowerCase().includes(String(r ?? "").toLowerCase());
    default:
      throw new Error(`Unknown condition operator "${cond.op}"`);
  }
}
