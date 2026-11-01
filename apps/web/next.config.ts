import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Media storage origins (Cloudflare R2): public files + direct signed uploads from the browser.
const mediaPublic = process.env.R2_PUBLIC_BASE_URL ? new URL(process.env.R2_PUBLIC_BASE_URL).origin : "";
const mediaUpload = process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "";

// TODO(security): move script-src to per-request nonces to drop 'unsafe-inline'.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${mediaPublic}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${mediaUpload}`.trim(),
  `media-src 'self' blob: ${mediaPublic}`.trim(),
  "frame-src 'none'", // imported-content origins are added in the Import Center phase
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@mozes/authz", "@mozes/content-schema", "@mozes/player-core", "@mozes/player-react", "@mozes/validator"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
