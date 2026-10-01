import { z } from "zod";
import { body, route } from "@/lib/api";
import { sql } from "@/lib/db";
import { signup } from "@/services/users";
import { resetEnvCache } from "@/lib/env";

export const GET = route({ admin: true }, async () => ({
  users: await sql.query(
    `select u.id, u.email, u.name, u.role, u.created_at, u.last_login_at,
       (select count(*)::int from tasks t where t.user_id = u.id) as tasks,
       (select count(*)::int from automations a where a.user_id = u.id) as automations
     from users u order by u.created_at`,
  ),
}));

/** Admins can create accounts even when public sign-up is closed. */
export const POST = route({ admin: true, rateLimit: 10 }, async ({ req }) => {
  const i = await body(req, z.object({ email: z.string().email(), password: z.string().min(10).max(200), name: z.string().max(80).optional() }));
  const prev = process.env.ALLOW_SIGNUP;
  process.env.ALLOW_SIGNUP = "true";
  resetEnvCache();
  try {
    const u = await signup(i);
    return { user: { id: u.id, email: u.email, role: u.role } };
  } finally {
    process.env.ALLOW_SIGNUP = prev;
    resetEnvCache();
  }
});
