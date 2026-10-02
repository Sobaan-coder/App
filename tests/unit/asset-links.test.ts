import { describe, expect, it } from "vitest";
import { assetLinks, DEFAULT_ANDROID_PACKAGE, normaliseFingerprint } from "@/lib/android/asset-links";

const FP = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";

describe("assetLinks", () => {
  it("is empty until a fingerprint is configured", () => {
    expect(assetLinks(undefined, undefined)).toEqual([]);
    expect(assetLinks("x.y", "not-a-fingerprint")).toEqual([]);
  });
  it("accepts several fingerprints in any case/format and de-duplicates them", () => {
    const [entry] = assetLinks(" com.example.app ", `${FP.toLowerCase()}, ${FP.replace(/:/g, "")} ${FP}`);
    expect(entry.target).toEqual({ namespace: "android_app", package_name: "com.example.app", sha256_cert_fingerprints: [FP] });
    expect(entry.relation).toEqual(["delegate_permission/common.handle_all_urls"]);
  });
  it("defaults the package name", () => {
    expect(assetLinks("", FP)[0].target.package_name).toBe(DEFAULT_ANDROID_PACKAGE);
  });
  it("rejects wrong-length fingerprints", () => {
    expect(normaliseFingerprint(FP.slice(0, -3))).toBeNull();
  });
});
