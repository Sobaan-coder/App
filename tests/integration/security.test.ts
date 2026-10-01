import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, sql, withUser } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { login, signup } from "@/services/users";
import { userFromToken, createSessionToken } from "@/lib/auth/session";
import { freshDb, newUser } from "./helpers";

beforeAll(freshDb);
afterAll(closePool);

describe("authentication", () => {
  it("first user becomes admin; later users are members", async () => {
    const a = await newUser("first");
    const b = await newUser("second");
    expect(a.role).toBe("admin");
    expect(b.role).toBe("member");
  });
  it("closes sign-up when ALLOW_SIGNUP=false (after the first user)", async () => {
    process.env.ALLOW_SIGNUP = "false";
    resetEnvCache();
    await expect(signup({ email: "late@test.local", password: "Test-password-123" })).rejects.toThrow(/closed/);
    process.env.ALLOW_SIGNUP = "true";
    resetEnvCache();
  });
  it("rejects weak passwords and wrong credentials", async () => {
    await expect(signup({ email: "weak@test.local", password: "short" })).rejects.toThrow(/10 characters/);
    const u = await newUser("login");
    await expect(login(u.email, "wrong-password-1")).rejects.toThrow(/Wrong email or password/);
    expect((await login(u.email, "Test-password-123")).id).toBe(u.id);
  });
  it("session tokens verify and are revoked by token_version", async () => {
    const u = await newUser("sess");
    const token = await createSessionToken(u);
    expect((await userFromToken(token))?.id).toBe(u.id);
    await sql.query("update users set token_version = token_version + 1 where id = $1", [u.id]);
    expect(await userFromToken(token)).toBeNull();
    expect(await userFromToken("garbage")).toBeNull();
  });
  it("stores only bcrypt hashes", async () => {
    const u = await newUser("hash");
    const row = await sql.one<{ password_hash: string }>("select password_hash from users where id = $1", [u.id]);
    expect(row!.password_hash).toMatch(/^\$2[aby]\$12\$/);
  });
});

describe("row level security", () => {
  it("users can never read or modify each other's data — even with an unfiltered query", async () => {
    const alice = await newUser("alice");
    const bob = await newUser("bob");
    await withUser(alice.id, (db) => db.query("insert into tasks(user_id, title) values ($1, 'alice secret')", [alice.id]));
    const bobSees = await withUser(bob.id, (db) => db.query<{ title: string }>("select title from tasks"));
    expect(bobSees.map((t) => t.title)).not.toContain("alice secret");
    const updated = await withUser(bob.id, (db) => db.query("update tasks set title = 'hacked' where title = 'alice secret' returning id"));
    expect(updated).toHaveLength(0);
    // cannot insert rows owned by someone else
    await expect(withUser(bob.id, (db) => db.query("insert into tasks(user_id, title) values ($1, 'forged')", [alice.id]))).rejects.toThrow(/row-level security/);
    // other users' accounts are invisible
    const users = await withUser(bob.id, (db) => db.query<{ id: string }>("select id from users"));
    expect(users.map((u) => u.id)).toEqual([bob.id]);
  });
  it("the job queue is not accessible to users at all", async () => {
    const u = await newUser("jobs");
    await expect(withUser(u.id, (db) => db.query("select * from jobs"))).rejects.toThrow(/permission denied/);
  });
  it("every user table has RLS enabled", async () => {
    const rows = await sql.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind = 'r' and relname <> 'schema_migrations'",
    );
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });
});
