// Helpers for tests that run against a real Supabase Postgres (local: `supabase start`).
// Each helper runs inside a transaction that is rolled back, so tests leave no trace.
import { Client } from "pg";
import { randomUUID } from "node:crypto";

export const DB_URL = process.env.SUPABASE_DB_URL ?? "";
export const hasDb = DB_URL.length > 0;

export async function withTx<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    await c.query("begin");
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    await c.end();
  }
}

/** Create an auth user (as postgres) and return its id. Profile row is created by trigger. */
export async function createUser(c: Client, name = "Student"): Promise<string> {
  const id = randomUUID();
  await c.query(
    `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3, now(), now())`,
    [id, `${id}@test.local`, JSON.stringify({ full_name: name })],
  );
  return id;
}

/** Switch the current transaction to act as a signed-in user (like PostgREST does). */
export async function actAs(c: Client, userId: string | null) {
  await c.query("reset role");
  if (userId === null) {
    await c.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await c.query("set local role anon");
  } else {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await c.query("set local role authenticated");
  }
}

export async function asPostgres(c: Client) {
  await c.query("reset role");
}

/** Run a statement expecting it to fail; uses a savepoint so the tx stays usable. */
export async function expectDenied(c: Client, sql: string, params: unknown[] = []): Promise<string> {
  await c.query("savepoint s");
  try {
    await c.query(sql, params);
  } catch (e) {
    await c.query("rollback to savepoint s");
    return (e as Error).message;
  }
  await c.query("release savepoint s");
  throw new Error(`Expected statement to be denied: ${sql}`);
}
