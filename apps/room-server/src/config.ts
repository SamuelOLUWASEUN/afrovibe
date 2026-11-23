function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export interface ServerConfig {
  port: number;
  /** Empty = allow any origin (local dev only). */
  allowedOrigins: readonly string[];
  maxRooms: number;
  /** Rooms with nobody connected are deleted after this long. */
  idleRoomTtlMs: number;
  /** Hard cap on a room's lifetime regardless of activity. */
  maxRoomAgeMs: number;
  maxPayloadBytes: number;
  rateLimit: { messages: number; windowMs: number };
  heartbeatMs: number;
  /** Postgres connection string (Supabase/Railway/Neon). Unset in dev = embedded PGlite. */
  databaseUrl: string | null;
  databaseSsl: boolean;
  /** Dev-only embedded database folder. */
  pgliteDir: string;
  /** Stripe is optional: without both keys the shop works with earned coins only. */
  stripe: { secretKey: string; webhookSecret: string } | null;
  /** Public URL of the web app, used for Stripe redirects. */
  webUrl: string;
  production: boolean;
  /**
   * Trust X-Forwarded-For for the client IP. Only enable behind a proxy that sets it
   * (Railway, Render, Fly): otherwise anyone can spoof their IP and dodge rate limits.
   */
  trustProxy: boolean;
  /**
   * How long bots "think", as a percentage of normal (100). Lower values only make
   * automated tests and local play-testing faster; always 100 in production.
   */
  botDelayPercent: number;
  limits: {
    /**
     * Open WebSockets per IP. Generous on purpose: mobile carriers (CGNAT) and venue
     * Wi-Fi put many real players behind one public IP.
     */
    socketsPerIp: number;
    /** New rooms per IP per window. */
    roomCreates: { limit: number; windowMs: number };
    /** Join attempts per IP per window; stops brute-forcing 4-letter room codes. */
    joins: { limit: number; windowMs: number };
    /** All /api requests per IP per window. */
    api: { limit: number; windowMs: number };
    /**
     * New guest profiles per IP per window. This stops database spam; it is not the
     * anti-farming control: coins can't move between profiles, and game coins are
     * capped per profile per day, so throwaway profiles earn a farmer nothing usable.
     */
    profileCreates: { limit: number; windowMs: number };
    /** Stripe checkout sessions per IP per window. */
    checkouts: { limit: number; windowMs: number };
  };
}

export function loadConfig(): ServerConfig {
  const origins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  if (process.env.NODE_ENV === "production" && origins.length === 0) {
    throw new Error("ALLOWED_ORIGINS must be set in production (e.g. https://your-app.vercel.app)");
  }
  return {
    port: intFromEnv("PORT", 8787),
    allowedOrigins: origins,
    maxRooms: intFromEnv("MAX_ROOMS", 2_000),
    idleRoomTtlMs: intFromEnv("IDLE_ROOM_TTL_MS", 15 * 60_000),
    maxRoomAgeMs: intFromEnv("MAX_ROOM_AGE_MS", 12 * 60 * 60_000),
    maxPayloadBytes: 4 * 1024,
    rateLimit: { messages: 30, windowMs: 5_000 },
    heartbeatMs: 25_000,
    databaseUrl: process.env.DATABASE_URL?.trim() || null,
    databaseSsl: process.env.DATABASE_SSL !== "false",
    pgliteDir: process.env.PGLITE_DIR ?? ".data/pglite",
    stripe:
      process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
        ? { secretKey: process.env.STRIPE_SECRET_KEY, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET }
        : null,
    webUrl: (process.env.PUBLIC_WEB_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    production: process.env.NODE_ENV === "production",
    trustProxy: process.env.TRUST_PROXY === "true",
    botDelayPercent:
      process.env.NODE_ENV === "production" ? 100 : Math.min(100, intFromEnv("BOT_DELAY_PERCENT", 100)),
    limits: {
      socketsPerIp: intFromEnv("LIMIT_SOCKETS_PER_IP", 120),
      roomCreates: { limit: intFromEnv("LIMIT_ROOM_CREATES", 15), windowMs: 10 * 60_000 },
      joins: { limit: intFromEnv("LIMIT_JOINS", 60), windowMs: 60_000 },
      api: { limit: intFromEnv("LIMIT_API", 300), windowMs: 60_000 },
      profileCreates: { limit: intFromEnv("LIMIT_PROFILE_CREATES", 100), windowMs: 60 * 60_000 },
      checkouts: { limit: intFromEnv("LIMIT_CHECKOUTS", 10), windowMs: 10 * 60_000 },
    },
  };
}
