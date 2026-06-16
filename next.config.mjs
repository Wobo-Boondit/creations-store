/** @type {import('next').NextConfig} */

const SUPABASE_ORIGIN = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : "";
  } catch {
    return "";
  }
})();

const SUPABASE_WSS_ORIGIN = SUPABASE_ORIGIN
  ? SUPABASE_ORIGIN.replace(/^https:/, "wss:")
  : "";

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://cdn.boondit.site https://*.linodeobjects.com https://cdn.discordapp.com",
  "media-src 'self' blob: https://cdn.boondit.site https://*.linodeobjects.com",
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WSS_ORIGIN} https://cdn.boondit.site https://*.linodeobjects.com https://cloudflareinsights.com`,
].join("; ");

const nextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.boondit.site" },
      { protocol: "https", hostname: "**.linodeobjects.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Content-Security-Policy", value: CSP },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
