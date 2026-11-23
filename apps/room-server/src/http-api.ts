import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { BADGES, CATALOG, COIN_PACKS, HOME_REGION_CODES } from "@afro-party/game-core";
import { clientIp } from "./client-ip.js";
import type { ServerConfig } from "./config.js";
import {
  accessLog,
  compose,
  cors,
  errorBoundary,
  HttpError,
  rateLimit,
  readJson,
  readRaw,
  requestId,
  securityHeaders,
  sendJson,
  type HttpContext,
  type Middleware,
} from "./http-middleware.js";
import { IdempotencyStore, type StoredResponse } from "./idempotency.js";
import type { Payments } from "./payments.js";
import type { ProfileService, ShopError } from "./profile-service.js";
import { SlidingWindowLimiter } from "./rate-limit.js";

export interface ApiDeps {
  profiles: ProfileService | null;
  payments: Payments | null;
  config: Pick<ServerConfig, "allowedOrigins" | "trustProxy" | "limits">;
  /** Access logs on stdout (off in tests). */
  log?: boolean;
}

const JSON_LIMIT = 16 * 1024;
const WEBHOOK_LIMIT = 1024 * 1024;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;

const createProfileSchema = z.object({
  name: z.string().max(64).optional(),
  homeRegion: z.enum(HOME_REGION_CODES).optional(),
});
const itemSchema = z.object({ itemId: z.string().min(1).max(64) });
const packSchema = z.object({ packId: z.string().min(1).max(64) });

const SHOP_ERROR_STATUS: Record<ShopError, number> = {
  unknown_item: 404,
  level_too_low: 403,
  already_owned: 409,
  not_enough_coins: 402,
  not_owned: 403,
  not_equippable: 400,
};

interface Route {
  method: "GET" | "POST" | "PATCH";
  path: string;
  /** Require a profile bearer token. */
  auth?: boolean;
  /** Honour Idempotency-Key (POSTs that change state). */
  idempotent?: boolean;
  /** Extra, stricter limiter for this route. */
  limiter?: SlidingWindowLimiter;
  handle: (ctx: HttpContext, body: unknown) => Promise<StoredResponse>;
}

const ok = (body: unknown, status = 200): StoredResponse => ({ status, body });

/** Builds the /api request handler. Resolves true if it handled the request. */
export function createApiHandler(deps: ApiDeps) {
  const { config } = deps;
  const limits = {
    api: new SlidingWindowLimiter(config.limits.api.limit, config.limits.api.windowMs),
    profileCreates: new SlidingWindowLimiter(config.limits.profileCreates.limit, config.limits.profileCreates.windowMs),
    checkouts: new SlidingWindowLimiter(config.limits.checkouts.limit, config.limits.checkouts.windowMs),
  };
  const idempotency = new IdempotencyStore();

  const profiles = (): ProfileService => {
    if (!deps.profiles) throw new HttpError(503, "progression_disabled");
    return deps.profiles;
  };

  const shopResult = (result: Awaited<ReturnType<ProfileService["buy"]>>): StoredResponse => {
    if (!result.ok) return { status: SHOP_ERROR_STATUS[result.error], body: { error: result.error } };
    return ok({ profile: result.profile });
  };

  const routes: Route[] = [
    {
      method: "GET",
      path: "/api/catalog",
      handle: async () =>
        ok({
          items: CATALOG,
          coinPacks: COIN_PACKS,
          badges: BADGES.map(({ id, name, description, icon, coins }) => ({ id, name, description, icon, coins })),
          paymentsEnabled: deps.payments !== null,
          progressionEnabled: deps.profiles !== null,
        }),
    },
    {
      method: "POST",
      path: "/api/profiles",
      idempotent: true,
      limiter: limits.profileCreates,
      handle: async (_ctx, body) => ok(await profiles().createGuest(parse(createProfileSchema, body)), 201),
    },
    {
      method: "GET",
      path: "/api/me",
      auth: true,
      handle: async (ctx) => {
        const profile = await profiles().getView(ctx.profileId ?? "");
        if (!profile) throw new HttpError(404, "not_found");
        return ok({ profile });
      },
    },
    {
      method: "PATCH",
      path: "/api/me",
      auth: true,
      handle: async (ctx, body) => ok({ profile: await profiles().update(ctx.profileId ?? "", parse(createProfileSchema, body)) }),
    },
    {
      method: "POST",
      path: "/api/shop/buy",
      auth: true,
      idempotent: true,
      handle: async (ctx, body) => shopResult(await profiles().buy(ctx.profileId ?? "", parse(itemSchema, body).itemId)),
    },
    {
      method: "POST",
      path: "/api/me/equip",
      auth: true,
      idempotent: true,
      handle: async (ctx, body) => shopResult(await profiles().equip(ctx.profileId ?? "", parse(itemSchema, body).itemId)),
    },
    {
      method: "POST",
      path: "/api/checkout",
      auth: true,
      idempotent: true,
      limiter: limits.checkouts,
      handle: async (ctx, body) => {
        if (!deps.payments) throw new HttpError(503, "payments_disabled");
        const { packId } = parse(packSchema, body);
        // Forward the client's key to Stripe so a retried click can't open two sessions.
        const key = ctx.req.headers["idempotency-key"];
        const url = await deps.payments.createCheckout(
          ctx.profileId ?? "",
          packId,
          typeof key === "string" ? `checkout:${ctx.profileId}:${key}` : undefined,
        );
        if (!url) throw new HttpError(404, "unknown_pack");
        return ok({ url });
      },
    },
  ];

  /** Matches the route, enforces auth/limits/idempotency, then runs it. */
  const router: Middleware = async (ctx) => {
    const path = ctx.url.pathname;

    // Stripe calls this one; it is authenticated by signature, not CORS or bearer token,
    // and needs the raw body for signature verification.
    if (path === "/api/stripe/webhook") {
      if (ctx.method !== "POST") throw new HttpError(405, "method_not_allowed");
      if (!deps.payments) throw new HttpError(503, "payments_disabled");
      const raw = await readRaw(ctx.req, WEBHOOK_LIMIT);
      const signature = ctx.req.headers["stripe-signature"];
      const outcome = await deps.payments.handleWebhook(raw, typeof signature === "string" ? signature : undefined);
      if (outcome === "invalid_signature") throw new HttpError(400, outcome);
      sendJson(ctx, 200, { received: true, outcome });
      return;
    }

    const sameMethod = routes.filter((r) => r.path === path);
    if (sameMethod.length === 0) throw new HttpError(404, "not_found");
    const route = sameMethod.find((r) => r.method === ctx.method);
    if (!route) throw new HttpError(405, "method_not_allowed", { Allow: sameMethod.map((r) => r.method).join(", ") });

    if (route.limiter && !route.limiter.take(ctx.ip)) {
      throw new HttpError(429, "rate_limited", { "Retry-After": String(route.limiter.retryAfterSeconds(ctx.ip)) });
    }
    if (route.auth) ctx.profileId = await authenticate(ctx, profiles());

    const body = ctx.method === "GET" ? undefined : await readJson(ctx.req, JSON_LIMIT);
    const key = ctx.req.headers["idempotency-key"];
    if (route.idempotent && typeof key === "string") {
      if (!IDEMPOTENCY_KEY.test(key)) throw new HttpError(400, "bad_idempotency_key");
      // Scope keys per profile (or per IP for unauthenticated calls) so users can't collide.
      const scope = ctx.profileId ?? `ip:${ctx.ip}`;
      const outcome = await idempotency.run(
        `${scope}:${route.path}:${key}`,
        IdempotencyStore.fingerprint(ctx.method, route.path, body),
        () => route.handle(ctx, body),
      );
      if (outcome.kind === "conflict") throw new HttpError(422, "idempotency_key_reused");
      sendJson(ctx, outcome.response.status, outcome.response.body, outcome.kind === "replayed" ? { "Idempotency-Replayed": "true" } : {});
      return;
    }

    const response = await route.handle(ctx, body);
    sendJson(ctx, response.status, response.body);
  };

  const pipeline = compose([
    errorBoundary,
    requestId,
    accessLog(deps.log ?? true),
    securityHeaders,
    cors(config.allowedOrigins),
    rateLimit(limits.api, (ctx) => ctx.ip),
    router,
  ]);

  // Keep limiter/idempotency memory bounded.
  const janitor = setInterval(() => {
    limits.api.prune();
    limits.profileCreates.prune();
    limits.checkouts.prune();
    idempotency.prune();
  }, 60_000);
  janitor.unref();

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;
    const ctx: HttpContext = {
      req,
      res,
      url,
      method: req.method ?? "GET",
      ip: clientIp(req, config.trustProxy),
      startedAt: Date.now(),
      requestId: "",
      profileId: null,
    };
    await pipeline(ctx);
    return true;
  };
}

async function authenticate(ctx: HttpContext, profiles: ProfileService): Promise<string> {
  const header = ctx.req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token.length < 16 || token.length > 128) throw new HttpError(401, "unauthorized");
  const id = await profiles.authenticate(token);
  if (!id) throw new HttpError(401, "unauthorized");
  return id;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, "bad_request");
  return result.data;
}
