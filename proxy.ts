import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

const PUBLIC_PAGES = ["/login", "/signup"];
const PUBLIC_API = ["/api/auth/login", "/api/auth/signup", "/api/health/live", "/api/hooks/", "/api/public/", "/api/integrations/oauth/callback"];
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Runs before every route:
 * 1. CSRF: state-changing API calls must come from our own origin (plus SameSite=Lax cookies).
 * 2. Auth gate: unauthenticated page visits are redirected to /login.
 * Full authorization happens again in each route handler (defence in depth).
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && MUTATING.has(req.method) && !pathname.startsWith("/api/hooks/")) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        /* invalid origin */
      }
      if (originHost !== host) {
        return NextResponse.json({ error: "Cross-site request blocked", code: "csrf" }, { status: 403 });
      }
    } else if (req.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json({ error: "Cross-site request blocked", code: "csrf" }, { status: 403 });
    }
  }

  if (isApi) return NextResponse.next();
  if (PUBLIC_PAGES.some((p) => pathname === p)) return NextResponse.next();

  const claims = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!claims) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|robots.txt).*)"],
};

// referenced for documentation/tests
export const _publicApi = PUBLIC_API;
