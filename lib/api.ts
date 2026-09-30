import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, forbidden, unauthorized } from "./errors";
import { getSessionUser, type SessionUser } from "./auth/session";
import { rateLimit } from "./rate-limit";

type Params = Record<string, string>;

export interface RouteContext<P extends Params = Params> {
  req: NextRequest;
  user: SessionUser;
  params: P;
}

interface Options {
  /** default true */
  auth?: boolean;
  admin?: boolean;
  /** requests per minute per user/IP */
  rateLimit?: number;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Uniform route handler: auth, rate limiting, JSON responses and error mapping. */
export function route<P extends Params = Params>(
  opts: Options,
  fn: (ctx: RouteContext<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      const params = ((await context?.params) ?? {}) as P;
      let user: SessionUser | null = null;
      if (opts.auth !== false) {
        user = await getSessionUser();
        if (!user) throw unauthorized();
        if (opts.admin && user.role !== "admin") throw forbidden("Admins only");
      }
      if (opts.rateLimit) {
        const key = `${req.nextUrl.pathname}:${user?.id ?? clientIp(req)}`;
        const rl = rateLimit(key, opts.rateLimit, 60_000);
        if (!rl.ok) {
          return NextResponse.json(
            { error: "Too many requests. Please slow down.", code: "rate_limited" },
            { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
          );
        }
      }
      const out = await fn({ req, user: user as SessionUser, params });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid input: " + err.issues.map((i) => `${i.path.join(".") || "body"} ${i.message}`).join("; "),
        code: "validation_error",
        details: err.issues,
      },
      { status: 400 },
    );
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: "Something went wrong on our side.", code: "internal" }, { status: 500 });
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new AppError("Request body must be valid JSON");
  }
  return schema.parse(json);
}

export function query(req: NextRequest, name: string): string | undefined {
  return req.nextUrl.searchParams.get(name) ?? undefined;
}

export function pageParams(req: NextRequest, defLimit = 50) {
  const limit = Math.min(200, Math.max(1, Number(query(req, "limit") ?? defLimit) || defLimit));
  const offset = Math.max(0, Number(query(req, "offset") ?? 0) || 0);
  return { limit, offset };
}
