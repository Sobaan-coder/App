import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { authorizeUrl, type OAuthProvider } from "@/integrations/oauth";

export const GET = route<{ provider: string }>({ rateLimit: 20 }, async ({ user, params }) => {
  if (!["meta", "youtube", "tiktok"].includes(params.provider)) throw new AppError("Unknown provider", 404);
  return NextResponse.redirect(await authorizeUrl(params.provider as OAuthProvider, user.id));
});
