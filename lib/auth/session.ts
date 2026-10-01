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

/**
 * Cookie flags. `Secure` is decided per request: on whenever the browser reached us over HTTPS
 * (directly or through a tunnel / reverse proxy), off for plain-HTTP access on your home network.
 */
export function sessionCookieOptions(req?: { headers: Headers; nextUrl?: URL }) {
  const proto = req?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? req?.nextUrl?.protocol.replace(":", "");
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: proto ? proto === "https" : process.env.NODE_ENV === "production" && Boolean(process.env.APP_URL?.startsWith("https://")),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function createSessionToken(user: { id: string; role: "admin" | "member"; token_version: number }) {
  return signSession({ sub: user.id, role: user.role, tv: user.token_version });
}
