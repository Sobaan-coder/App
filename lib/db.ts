import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

// Return timestamps as ISO-8601 strings (JSON-safe everywhere: API responses, run context, templates).
types.setTypeParser(1184, (v) => new Date(v).toISOString()); // timestamptz
types.setTypeParser(1114, (v) => new Date(`${v}Z`).toISOString()); // timestamp (stored as UTC)
types.setTypeParser(1082, (v) => v); // date → "YYYY-MM-DD"

/**
 * Database access.
 *
 * - `sql()` runs as the connection owner. Use ONLY for system work (job queue, scheduler,
 *   auth lookups, migrations) — it bypasses Row Level Security.
 * - `withUser(userId, fn)` opens a transaction, switches to the restricted `cc_user` role and sets
 *   `app.user_id`. Every user-facing query goes through this, so RLS enforces isolation even if a
 *   query forgets a `WHERE user_id = …`.
 */

const g = globalThis as unknown as { __ccPool?: Pool };

export function pool(): Pool {
  if (!g.__ccPool) {
    const e = env();
    const ssl = e.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined;
    g.__ccPool = new Pool({
      connectionString: e.DATABASE_URL,
      ssl,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    g.__ccPool.on("error", (err) => console.error("[db] idle client error", err.message));
  }
  return g.__ccPool;
}

export async function closePool() {
  if (g.__ccPool) {
    await g.__ccPool.end();
    g.__ccPool = undefined;
  }
}

export interface Db {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>;
  one<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T | null>;
}

function wrap(client: Pick<PoolClient, "query">): Db {
  return {
    async query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
      const r = await client.query<T>(text, params);
      return r.rows;
    },
    async one<T extends QueryResultRow>(text: string, params: unknown[] = []) {
      const r = await client.query<T>(text, params);
      return (r.rows[0] ?? null) as T | null;
    },
  };
}

/** System-level (RLS-bypassing) database handle. */
export const sql: Db = {
  query: (text, params) => wrap(pool()).query(text, params),
  one: (text, params) => wrap(pool()).one(text, params),
};

/** Run `fn` in a transaction as the connection owner. */
export async function withTx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(wrap(client));
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Run `fn` in a transaction under Row Level Security for `userId`. */
export async function withUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(userId)) throw new Error("withUser: invalid user id");
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE cc_user");
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const out = await fn(wrap(client));
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/**
 * A user-scoped handle where each query runs in its own short RLS transaction.
 * Use for long-running work (tools, workers) so no transaction is held open during network calls.
 */
export function userDb(userId: string): Db {
  return {
    query: (text, params) => withUser(userId, (db) => db.query(text, params)),
    one: (text, params) => withUser(userId, (db) => db.one(text, params)),
  };
}
