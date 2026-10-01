import { NextResponse } from "next/server";
import { z } from "zod";
import { body, route } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth/token";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { login } from "@/services/users";

export const POST = route({ auth: false, rateLimit: 10 }, async ({ req }) => {
  const { email, password } = await body(req, z.object({ email: z.string().min(3).max(200), password: z.string().min(1).max(200) }));
  const u = await login(email, password);
  const res = NextResponse.json({ user: { id: u.id, email: u.email, name: u.name, role: u.role } });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(u), sessionCookieOptions());
  return res;
});
