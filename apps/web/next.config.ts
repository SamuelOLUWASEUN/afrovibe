import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/** Origins the browser may talk to: the room server's WebSocket and its HTTP API. */
function backendOrigins(): string[] {
  const ws = new URL(process.env.NEXT_PUBLIC_ROOM_SERVER_URL ?? "ws://localhost:8787/ws");
  const httpFromWs = `${ws.protocol === "wss:" ? "https:" : "http:"}//${ws.host}`;
  const api = process.env.NEXT_PUBLIC_API_URL ? new URL(process.env.NEXT_PUBLIC_API_URL).origin : httpFromWs;
  return [...new Set([`${ws.protocol}//${ws.host}`, httpFromWs, api])];
}

/**
 * Content-Security-Policy. The main protection for the profile token kept in
 * localStorage: injected script can't load from elsewhere or send data anywhere
 * except our own backend.
 *
 * Trade-off: Next.js inlines its bootstrap scripts, so script-src needs
 * 'unsafe-inline' unless we switch to per-request nonces, which would make every
 * page dynamic and lose static generation. We keep pages static and still get
 * strict connect-src, frame-ancestors, object-src, base-uri and form-action.
 */
function contentSecurityPolicy(): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...backendOrigins(), ...(isDev ? ["ws:"] : [])],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
