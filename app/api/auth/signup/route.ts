import { NextResponse } from "next/server";
import { z } from "zod";
import { body, route } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth/token";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { signup } from "@/services/users";

export const POST = route({ auth: false, rateLimit: 5 }, async ({ req }) => {
  const input = await body(req, z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200), name: z.string().max(80).optional(), timezone: z.string().max(60).optional() }));
  const u = await signup(input);
  const res = NextResponse.json({ user: { id: u.id, email: u.email, name: u.name, role: u.role } });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(u), sessionCookieOptions(req));
  return res;
});
