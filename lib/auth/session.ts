import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "./token";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
}

/** Resolve the signed-in user from a raw token (validates token_version for revocation). */
export async function userFromToken(token: string | undefined | null): Promise<SessionUser | null> {
  const claims = await verifySession(token);
  if (!claims) return null;
  const u = await sql.one<SessionUser & { token_version: number }>(
    "select id, email, name, role, token_version from users where id = $1",
    [claims.sub],
  );
  if (!u || u.token_version !== claims.tv) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

/** Current user in server components / route handlers, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://"),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function createSessionToken(user: { id: string; role: "admin" | "member"; token_version: number }) {
  return signSession({ sub: user.id, role: user.role, tv: user.token_version });
}
