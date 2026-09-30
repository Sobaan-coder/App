import { NextResponse } from "next/server";
import { assetLinks } from "@/lib/android/asset-links";

export const dynamic = "force-dynamic";

/** Served at /.well-known/assetlinks.json. Configure with ANDROID_PACKAGE_NAME and ANDROID_CERT_SHA256. */
export function GET() {
  return NextResponse.json(assetLinks(process.env.ANDROID_PACKAGE_NAME, process.env.ANDROID_CERT_SHA256), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
