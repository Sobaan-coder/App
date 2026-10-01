import { SignJWT, jwtVerify } from "jose";

/** Edge-safe session token helpers (used by proxy.ts and the server). */
export const SESSION_COOKIE = "cc_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * Math.min(365, Math.max(1, Number(process.env.SESSION_DAYS ?? 30) || 30));

export interface SessionClaims {
  sub: string;
  tv: number;
  role: "admin" | "member";
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ tv: claims.tv, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer("ai-command-center")
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "ai-command-center", algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    return { sub: payload.sub, tv: Number(payload.tv ?? 0), role: payload.role === "admin" ? "admin" : "member" };
  } catch {
    return null;
  }
}
