import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SlidingWindowLimiter } from "./rate-limit.js";

/**
 * A tiny Koa-style middleware pipeline over node:http. We don't pull in Express or
 * Fastify for six routes: this keeps the dependency surface (and CVE exposure) small
 * while giving the same structure: each concern is one testable function.
 */

export interface HttpContext {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly url: URL;
  readonly method: string;
  readonly ip: string;
  readonly startedAt: number;
  requestId: string;
  /** Set by the auth middleware for protected routes. */
  profileId: string | null;
}

export type Next = () => Promise<void>;
export type Middleware = (ctx: HttpContext, next: Next) => Promise<void>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(code);
  }
}

export function compose(middlewares: readonly Middleware[]): (ctx: HttpContext) => Promise<void> {
  return (ctx) => {
    let index = -1;
    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      const fn = middlewares[i];
      if (fn) await fn(ctx, () => dispatch(i + 1));
    };
    return dispatch(0);
  };
}

export function sendJson(ctx: HttpContext, status: number, body: unknown, headers: Record<string, string> = {}): void {
  if (ctx.res.headersSent) return;
  ctx.res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  ctx.res.end(JSON.stringify(body));
}

// ── Middlewares ──────────────────────────────────────────────────────────────

/** Outermost: turns thrown errors into JSON. Never leaks stack traces to clients. */
export const errorBoundary: Middleware = async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(ctx, err.status, { error: err.code, requestId: ctx.requestId }, err.headers);
      return;
    }
    console.error(JSON.stringify({ level: "error", requestId: ctx.requestId, path: ctx.url.pathname, error: String(err) }));
    sendJson(ctx, 500, { error: "server_error", requestId: ctx.requestId });
  }
};

const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Correlates logs with client reports: reuses a sane incoming X-Request-Id or makes one. */
export const requestId: Middleware = async (ctx, next) => {
  const incoming = ctx.req.headers["x-request-id"];
  ctx.requestId = typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  ctx.res.setHeader("X-Request-Id", ctx.requestId);
  await next();
};

/** One JSON log line per request: method, path, status, latency. Easy to grep on Railway. */
export function accessLog(enabled: boolean): Middleware {
  return async (ctx, next) => {
    if (!enabled) return next();
    ctx.res.once("finish", () => {
      console.log(
        JSON.stringify({
          level: "info",
          requestId: ctx.requestId,
          method: ctx.method,
          path: ctx.url.pathname,
          status: ctx.res.statusCode,
          ms: Date.now() - ctx.startedAt,
        }),
      );
    });
    await next();
  };
}

/** API responses are data, never pages: lock them down. */
export const securityHeaders: Middleware = async (ctx, next) => {
  ctx.res.setHeader("X-Content-Type-Options", "nosniff");
  ctx.res.setHeader("X-Frame-Options", "DENY");
  ctx.res.setHeader("Referrer-Policy", "no-referrer");
  ctx.res.setHeader("Cache-Control", "no-store");
  ctx.res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  await next();
};

/** Allow-list CORS. Preflights end here. An empty list means "any origin" (local dev only). */
export function cors(allowedOrigins: readonly string[]): Middleware {
  return async (ctx, next) => {
    const origin = ctx.req.headers.origin;
    const allowed = origin !== undefined && (allowedOrigins.length === 0 || allowedOrigins.includes(origin));
    if (allowed) {
      ctx.res.setHeader("Access-Control-Allow-Origin", origin);
      ctx.res.setHeader("Vary", "Origin");
      ctx.res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, idempotency-key, x-request-id");
      ctx.res.setHeader("Access-Control-Expose-Headers", "x-request-id, retry-after, idempotency-replayed");
      ctx.res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
      ctx.res.setHeader("Access-Control-Max-Age", "600");
    }
    if (ctx.method === "OPTIONS") {
      ctx.res.writeHead(allowed ? 204 : 403).end();
      return;
    }
    await next();
  };
}

/** Per-key sliding-window limit with a proper 429 + Retry-After. */
export function rateLimit(limiter: SlidingWindowLimiter, key: (ctx: HttpContext) => string): Middleware {
  return async (ctx, next) => {
    const k = key(ctx);
    if (!limiter.take(k)) {
      throw new HttpError(429, "rate_limited", { "Retry-After": String(limiter.retryAfterSeconds(k)) });
    }
    await next();
  };
}

// ── Body parsing ─────────────────────────────────────────────────────────────

export async function readRaw(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > limit) throw new HttpError(413, "too_large");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > limit) throw new HttpError(413, "too_large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const type = req.headers["content-type"] ?? "";
  const raw = await readRaw(req, limit);
  if (raw.length === 0) return {};
  if (!type.includes("application/json")) throw new HttpError(415, "unsupported_media_type");
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new HttpError(400, "bad_json");
  }
}
