import { NextResponse } from "next/server";
import { route, query } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth/token";
import { revokeSessions } from "@/services/users";

/** Log out (?everywhere=1 revokes every session of this account). */
export const POST = route({}, async ({ req, user }) => {
  if (query(req, "everywhere")) await revokeSessions(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
