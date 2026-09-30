import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Server-only packages with native bindings or heavy node APIs stay out of the bundle.
  serverExternalPackages: [
    "pg",
    "sharp",
    "playwright",
    "tesseract.js",
    "exceljs",
    "unpdf",
    "mammoth",
    "bcryptjs",
    "nodemailer",
    "croner",
    "docx",
    "pdf-lib",
    "jszip",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
