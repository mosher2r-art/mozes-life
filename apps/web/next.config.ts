import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Media storage origins (Cloudflare R2): public files + direct signed uploads from the browser.
const mediaPublic = process.env.R2_PUBLIC_BASE_URL ? new URL(process.env.R2_PUBLIC_BASE_URL).origin : "";
const mediaUpload = process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "";
// Imported courseware runs in a sandboxed iframe on a separate origin (R2 public domain, or PACKAGE_ORIGIN locally).
const packageOrigin = process.env.PACKAGE_ORIGIN ? new URL(process.env.PACKAGE_ORIGIN).origin : mediaPublic;

// TODO(security): move script-src to per-request nonces to drop 'unsafe-inline'.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${mediaPublic}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${mediaUpload}`.trim(),
  `media-src 'self' blob: ${mediaPublic}`.trim(),
  packageOrigin ? `frame-src ${packageOrigin}` : "frame-src 'none'",
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
    // /pkg/* (local package serving) sets its own framing policy; everything else is locked down.
    return [{ source: "/:path((?!pkg/).*)", headers: securityHeaders }];
  },
};

export default config;
