import { NextResponse, type NextRequest } from "next/server";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { getSessionUser } from "@/lib/auth/session";
import { handleCallback, verifyState, type OAuthProvider } from "@/integrations/oauth";

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const back = (q: string) => NextResponse.redirect(`${env().APP_URL.replace(/\/+$/, "")}/content/accounts?${q}`);
  try {
    if (!["meta", "youtube", "tiktok"].includes(provider)) return back("error=unknown_provider");
    const err = req.nextUrl.searchParams.get("error");
    if (err) return back(`error=${encodeURIComponent(err)}`);
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    if (!code || !state) return back("error=missing_code");
    const uid = await verifyState(state, provider as OAuthProvider);
    const user = await getSessionUser();
    if (!user || user.id !== uid) return back("error=session_mismatch");
    const r = await withUser(user.id, async (db) => {
      const out = await handleCallback(provider as OAuthProvider, user.id, code, db);
      await logActivity(db, { userId: user.id, category: "integrations", action: "integration.connected", status: "success", message: `${provider}: ${out.detail}` });
      return out;
    });
    return back(r.next === "choose_page" ? "choosePage=1" : `connected=${provider}`);
  } catch (e) {
    return back(`error=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
  }
}
