// Digital Asset Links for the Android app (a Trusted Web Activity). When the site lists the
// app's signing-certificate fingerprint, Android opens the site full-screen inside the app
// with no browser address bar. See android/README.md.

export const DEFAULT_ANDROID_PACKAGE = "app.studyos.android";

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/** Normalises a SHA-256 fingerprint ("aa:bb…" or "AABB…") to "AA:BB:…"; null when invalid. */
export function normaliseFingerprint(input: string): string | null {
  const hex = input.trim().toUpperCase().replace(/[^0-9A-F]/g, "");
  if (hex.length !== 64) return null;
  const value = hex.match(/.{2}/g)!.join(":");
  return FINGERPRINT.test(value) ? value : null;
}

export function assetLinks(packageName: string | undefined, fingerprints: string | undefined) {
  const certs = [...new Set((fingerprints ?? "").split(/[,\s]+/).map(normaliseFingerprint).filter((f): f is string => !!f))];
  if (certs.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: packageName?.trim() || DEFAULT_ANDROID_PACKAGE, sha256_cert_fingerprints: certs },
    },
  ];
}
