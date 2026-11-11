import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Media storage origins (Cloudflare R2): public files + direct signed uploads from the browser.
const publicBase = process.env.R2_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL;
const mediaPublic = publicBase ? new URL(publicBase).origin : "";
const mediaUpload = process.env.R2_ACCOUNT_ID
  ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : process.env.S3_ENDPOINT
    ? new URL(process.env.S3_ENDPOINT).origin
    : "";
// Imported courseware runs in a sandboxed iframe on a separate origin (R2 public domain, or PACKAGE_ORIGIN locally).
const packageOrigin = process.env.PACKAGE_ORIGIN ? new URL(process.env.PACKAGE_ORIGIN).origin : mediaPublic;

// TODO(security): move script-src to per-request nonces to drop 'unsafe-inline'.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com https://player.vimeo.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${mediaPublic}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${mediaUpload}`.trim(),
  `media-src 'self' blob: ${mediaPublic}`.trim(),
  `frame-src https://www.youtube-nocookie.com https://player.vimeo.com ${packageOrigin ?? ""}`.trim(),
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
    const recoveryHeaders=[{key:"Referrer-Policy",value:"no-referrer"},{key:"Cache-Control",value:"no-store"}];
    return [{ source: "/:path((?!pkg/).*)", headers: securityHeaders },{source:"/reset-password",headers:recoveryHeaders},{source:"/api/auth/reset-password/:path*",headers:recoveryHeaders}];
  },
};

export default config;
