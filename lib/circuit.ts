/**
 * Minimal circuit breaker: after `threshold` consecutive failures the circuit opens for
 * `cooldownMs`; calls fail fast until then. One half-open trial call is allowed after cooldown.
 */
interface State {
  failures: number;
  openedAt: number | null;
}
const states = new Map<string, State>();

export function circuitOpen(key: string, cooldownMs = 60_000): boolean {
  const s = states.get(key);
  if (!s?.openedAt) return false;
  if (Date.now() - s.openedAt > cooldownMs) {
    s.openedAt = null; // half-open: allow a trial
    return false;
  }
  return true;
}

export function recordSuccess(key: string) {
  states.set(key, { failures: 0, openedAt: null });
}

export function recordFailure(key: string, threshold = 3) {
  const s = states.get(key) ?? { failures: 0, openedAt: null };
  s.failures += 1;
  if (s.failures >= threshold) s.openedAt = Date.now();
  states.set(key, s);
}

export function resetCircuits() {
  states.clear();
}

/** Exponential backoff with jitter: 500ms, 1s, 2s … capped. */
export function backoffMs(attempt: number, base = 500, cap = 15_000): number {
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withTimeout<T>(p: Promise<T>, ms: number, what = "operation"): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`${what} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t);
  }
}
