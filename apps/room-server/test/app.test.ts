import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ServerMessage } from "@afro-party/game-core";
import { createApp, type RunningApp } from "../src/app.js";
import type { ServerConfig } from "../src/config.js";
import { createPgliteDb, migrate, type Db } from "../src/db.js";
import { ProfileService } from "../src/profile-service.js";

function testConfig(overrides: Partial<ServerConfig["limits"]> = {}): ServerConfig {
  return {
    port: 0,
    allowedOrigins: [],
    maxRooms: 100,
    idleRoomTtlMs: 60_000,
    maxRoomAgeMs: 3_600_000,
    maxPayloadBytes: 4096,
    rateLimit: { messages: 30, windowMs: 5_000 },
    heartbeatMs: 30_000,
    databaseUrl: null,
    databaseSsl: false,
    pgliteDir: "",
    stripe: null,
    webUrl: "http://localhost:3000",
    production: false,
    trustProxy: false,
    botDelayPercent: 2,
    limits: {
      socketsPerIp: 40,
      roomCreates: { limit: 50, windowMs: 60_000 },
      joins: { limit: 50, windowMs: 60_000 },
      api: { limit: 500, windowMs: 60_000 },
      profileCreates: { limit: 50, windowMs: 60_000 },
      checkouts: { limit: 10, windowMs: 60_000 },
      ...overrides,
    },
  };
}

let db: Db;
let profiles: ProfileService;
let app: RunningApp;
let base: string;
let wsUrl: string;
const open: Client[] = [];

async function start(limits: Partial<ServerConfig["limits"]> = {}) {
  app = createApp({ config: testConfig(limits), profiles, payments: null, log: false });
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const { port } = app.server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}/ws`;
}

beforeEach(async () => {
  db = await createPgliteDb();
  await migrate(db);
  profiles = new ProfileService(db);
});

afterEach(async () => {
  for (const c of open.splice(0)) c.ws.terminate();
  await app?.close();
  await db.close();
});

// ── tiny WebSocket test client ──────────────────────────────────────────────
interface Client {
  ws: WebSocket;
  messages: ServerMessage[];
  send: (m: unknown) => void;
  next: (pred: (m: ServerMessage) => boolean, what?: string) => Promise<ServerMessage>;
}

function connect(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const messages: ServerMessage[] = [];
    const waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      messages.push(msg);
      for (const w of [...waiters]) {
        if (w.pred(msg)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(msg);
        }
      }
    });
    const client: Client = {
      ws,
      messages,
      send: (m) => ws.send(JSON.stringify(m)),
      next: (pred, what = "message") =>
        new Promise((res, rej) => {
          const seen = messages.find(pred);
          if (seen) {
            messages.splice(messages.indexOf(seen), 1);
            return res(seen);
          }
          const timer = setTimeout(() => rej(new Error(`timed out waiting for ${what}`)), 3_000);
          waiters.push({
            pred,
            resolve: (m) => {
              clearTimeout(timer);
              messages.splice(messages.indexOf(m), 1);
              res(m);
            },
          });
        }),
    };
    ws.once("open", () => {
      open.push(client);
      resolve(client);
    });
    ws.once("error", reject);
    ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
}

const isWelcome = (m: ServerMessage): m is Extract<ServerMessage, { t: "welcome" }> => m.t === "welcome";
const isState = (m: ServerMessage): m is Extract<ServerMessage, { t: "state" }> => m.t === "state";
const isError = (code: string) => (m: ServerMessage) => m.t === "error" && m.code === code;

async function screenRoom(): Promise<{ host: Client; code: string }> {
  const host = await connect();
  host.send({ t: "create", mode: "screen", regions: ["ng"], familyMode: true });
  const welcome = (await host.next(isWelcome, "welcome")) as Extract<ServerMessage, { t: "welcome" }>;
  return { host, code: welcome.code };
}

async function joinAs(code: string, name: string, requestId?: string) {
  const c = await connect();
  c.send({ t: "join", code, name, homeRegion: "ng", ...(requestId ? { requestId } : {}) });
  const welcome = (await c.next((m) => m.t === "welcome" || m.t === "error", "welcome")) as ServerMessage;
  return { c, welcome };
}

async function latestState(c: Client) {
  await new Promise((r) => setTimeout(r, 80));
  const states = c.messages.filter(isState);
  return states[states.length - 1]!.view;
}

// ── WebSocket behaviour ─────────────────────────────────────────────────────

describe("leaving a room", () => {
  it("removes the player, confirms with 'left', revokes their seat, and VIP passes on", async () => {
    await start();
    const { host, code } = await screenRoom();
    const a = await joinAs(code, "Ade");
    await joinAs(code, "Bola");
    const token = (a.welcome as Extract<ServerMessage, { t: "welcome" }>).token;

    a.c.send({ t: "leave" });
    await a.c.next((m) => m.t === "left", "left");
    const view = await latestState(host);
    expect(view.players.map((p) => p.name)).toEqual(["Bola"]);
    expect(view.players[0]!.isVip).toBe(true);

    // The old token can't sneak back in.
    const again = await connect();
    again.send({ t: "resume", code, token });
    await again.next(isError("session_expired"), "session_expired");
  });

  it("is idempotent: a double-tapped leave removes the player once and closes the socket", async () => {
    await start();
    const { host, code } = await screenRoom();
    const a = await joinAs(code, "Ade");
    await joinAs(code, "Bola");
    const closed = new Promise<number>((resolve) => a.c.ws.once("close", (codeNum) => resolve(codeNum)));
    a.c.send({ t: "leave" });
    a.c.send({ t: "leave" }); // double-tap before the server's close arrives
    await a.c.next((m) => m.t === "left");
    await closed;
    expect(a.c.messages.filter((m) => m.t === "error" && m.code !== "not_in_room")).toEqual([]);
    expect((await latestState(host)).players.map((p) => p.name)).toEqual(["Bola"]);
  });

  it("lets the TV leave while the game carries on for the players", async () => {
    await start();
    const { host, code } = await screenRoom();
    const a = await joinAs(code, "Ade");
    host.send({ t: "leave" });
    await host.next((m) => m.t === "left");
    const view = await latestState(a.c);
    expect(view.players).toHaveLength(1);
    expect(view.canControl).toBe(true); // Ade is VIP and can still run the room
  });
});

describe("bots over the socket", () => {
  it("creates a practice room with bots, lets the VIP add and remove them, and plays them", async () => {
    await start();
    const me = await connect();
    me.send({
      t: "create",
      mode: "remote",
      regions: ["ng"],
      familyMode: true,
      player: { name: "Ada", homeRegion: "ng" },
      bots: 2,
      requestId: "practice-123",
    });
    const welcome = (await me.next(isWelcome, "welcome")) as Extract<ServerMessage, { t: "welcome" }>;
    let view = await latestState(me);
    expect(view.players.filter((p) => p.isBot)).toHaveLength(2);
    expect(view.botSlots).toBe(2);

    me.send({ t: "add_bot" });
    view = await latestState(me);
    expect(view.players.filter((p) => p.isBot)).toHaveLength(3);
    const bot = view.players.find((p) => p.isBot)!;
    me.send({ t: "kick", playerId: bot.id });
    view = await latestState(me);
    expect(view.players.some((p) => p.id === bot.id)).toBe(false);

    // A friend who joins can't add bots: only the VIP can.
    const friend = await joinAs(welcome.code, "Bola");
    friend.c.send({ t: "add_bot" });
    await friend.c.next(isError("not_allowed"), "not_allowed");

    me.send({ t: "start" });
    const answering = await me.next((m) => isState(m) && m.view.phase.kind === "answering", "answering");
    expect(isState(answering) && answering.view.phase.kind).toBe("answering");
    // With bot thinking time at 2%, the bots answer within a second.
    await new Promise((r) => setTimeout(r, 1_000));
    view = await latestState(me);
    const phase = view.phase;
    if (phase.kind !== "answering") throw new Error(`expected answering, got ${phase.kind}`);
    const botIds = view.players.filter((p) => p.isBot).map((p) => p.id);
    expect(botIds.every((id) => phase.doneIds.includes(id))).toBe(true);
    expect(phase.waitingIds.sort()).toEqual(view.players.filter((p) => !p.isBot).map((p) => p.id).sort());
  });
});

describe("idempotent join", () => {
  it("returns the same seat for a retried join with the same requestId", async () => {
    await start();
    const { host, code } = await screenRoom();
    const first = await joinAs(code, "Ade", "req-12345678");
    const retry = await joinAs(code, "Ade", "req-12345678"); // e.g. the welcome was lost and the phone retried
    const w1 = first.welcome as Extract<ServerMessage, { t: "welcome" }>;
    const w2 = retry.welcome as Extract<ServerMessage, { t: "welcome" }>;
    expect(w2.playerId).toBe(w1.playerId);
    expect(w2.token).toBe(w1.token);
    expect((await latestState(host)).players).toHaveLength(1);
  });

  it("gives two racing duplicates one seat, not two", async () => {
    await start();
    const { host, code } = await screenRoom();
    const [x, y] = await Promise.all([connect(), connect()]);
    for (const c of [x, y]) c.send({ t: "join", code, name: "Ade", homeRegion: "ng", requestId: "race-1234567" });
    const [wx, wy] = (await Promise.all([x.next(isWelcome), y.next(isWelcome)])) as Extract<ServerMessage, { t: "welcome" }>[];
    expect(wx!.playerId).toBe(wy!.playerId);
    expect((await latestState(host)).players).toHaveLength(1);
  });

  it("still treats different requestIds as different players", async () => {
    await start();
    const { host, code } = await screenRoom();
    await joinAs(code, "Ade", "req-aaaaaaaa");
    await joinAs(code, "Bola", "req-bbbbbbbb");
    expect((await latestState(host)).players).toHaveLength(2);
  });
});

describe("socket rate limits", () => {
  it("limits join attempts per IP (stops room-code guessing)", async () => {
    await start({ joins: { limit: 3, windowMs: 60_000 } });
    const c = await connect();
    for (let i = 0; i < 3; i += 1) c.send({ t: "join", code: "ZZZZ", name: `n${i}`, homeRegion: "ng" });
    for (let i = 0; i < 3; i += 1) await c.next(isError("room_not_found"));
    c.send({ t: "join", code: "ZZZZ", name: "n4", homeRegion: "ng" });
    await c.next(isError("rate_limited"), "rate_limited");
  });

  it("limits room creation per IP", async () => {
    await start({ roomCreates: { limit: 2, windowMs: 60_000 } });
    const c = await connect();
    for (let i = 0; i < 2; i += 1) {
      c.send({ t: "create", mode: "screen", regions: ["ng"], familyMode: true });
      await c.next(isWelcome);
    }
    c.send({ t: "create", mode: "screen", regions: ["ng"], familyMode: true });
    await c.next(isError("rate_limited"));
  });

  it("caps open sockets per IP and frees the slot when one closes", async () => {
    await start({ socketsPerIp: 2 });
    const a = await connect();
    await connect();
    await expect(connect()).rejects.toThrow("429");
    a.ws.close();
    await new Promise((r) => setTimeout(r, 100));
    await expect(connect()).resolves.toBeTruthy();
  });

  it("rejects malformed and oversized messages without dropping the socket", async () => {
    await start();
    const c = await connect();
    c.ws.send("not json");
    await c.next(isError("bad_message"));
    c.send({ t: "join", code: "AB", name: "x", homeRegion: "ng" }); // bad code shape
    await c.next(isError("bad_message"));
    c.send({ t: "ping" });
    await c.next((m) => m.t === "pong");
  });
});

// ── HTTP middleware ─────────────────────────────────────────────────────────

describe("HTTP API middleware", () => {
  it("adds a request id and security headers, and handles 404 / 405 / 415 cleanly", async () => {
    await start();
    const res = await fetch(`${base}/api/catalog`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toMatch(/^[\w-]{8,}$/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const echoed = await fetch(`${base}/api/catalog`, { headers: { "x-request-id": "trace-abc12345" } });
    expect(echoed.headers.get("x-request-id")).toBe("trace-abc12345");

    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
    const wrongMethod = await fetch(`${base}/api/catalog`, { method: "POST" });
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("GET");
    const textBody = await fetch(`${base}/api/profiles`, { method: "POST", body: "hi", headers: { "content-type": "text/plain" } });
    expect(textBody.status).toBe(415);
    expect(await textBody.json()).toMatchObject({ error: "unsupported_media_type", requestId: expect.any(String) });
  });

  it("answers CORS preflights for allowed origins", async () => {
    await start();
    const res = await fetch(`${base}/api/shop/buy`, {
      method: "OPTIONS",
      headers: { origin: "https://example.netlify.app", "access-control-request-method": "POST" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).toContain("idempotency-key");
  });

  it("rate-limits with 429 and Retry-After", async () => {
    await start({ api: { limit: 3, windowMs: 60_000 } });
    for (let i = 0; i < 3; i += 1) expect((await fetch(`${base}/api/catalog`)).status).toBe(200);
    const limited = await fetch(`${base}/api/catalog`);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("rejects bad bearer tokens with 401", async () => {
    await start();
    expect((await fetch(`${base}/api/me`)).status).toBe(401);
    expect((await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${"x".repeat(40)}` } })).status).toBe(401);
  });
});

describe("HTTP idempotency", () => {
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

  it("charges once when a purchase is retried with the same Idempotency-Key", async () => {
    await start();
    const { token, profile } = await profiles.createGuest({});
    await db.query(`UPDATE profiles SET coins = 1000 WHERE id = $1`, [profile.id]);
    const auth = { authorization: `Bearer ${token}`, "idempotency-key": "buy-zebra-0001" };

    const first = await post("/api/shop/buy", { itemId: "avatar_zebra" }, auth);
    const retry = await post("/api/shop/buy", { itemId: "avatar_zebra" }, auth);
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200); // replayed success, not "already_owned"
    expect(retry.headers.get("idempotency-replayed")).toBe("true");
    expect((await profiles.getView(profile.id))!.coins).toBe(850);
  });

  it("handles concurrent duplicates: one purchase, both callers get the same answer", async () => {
    await start();
    const { token, profile } = await profiles.createGuest({});
    await db.query(`UPDATE profiles SET coins = 1000 WHERE id = $1`, [profile.id]);
    const auth = { authorization: `Bearer ${token}`, "idempotency-key": "buy-race-00001" };
    const [a, b] = await Promise.all([
      post("/api/shop/buy", { itemId: "avatar_rooster" }, auth),
      post("/api/shop/buy", { itemId: "avatar_rooster" }, auth),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await profiles.getView(profile.id))!.coins).toBe(850);
  });

  it("refuses to reuse a key for a different request (422)", async () => {
    await start();
    const { token, profile } = await profiles.createGuest({});
    await db.query(`UPDATE profiles SET coins = 1000 WHERE id = $1`, [profile.id]);
    const auth = { authorization: `Bearer ${token}`, "idempotency-key": "same-key-00001" };
    expect((await post("/api/shop/buy", { itemId: "avatar_zebra" }, auth)).status).toBe(200);
    const reused = await post("/api/shop/buy", { itemId: "avatar_rooster" }, auth);
    expect(reused.status).toBe(422);
    expect(await reused.json()).toMatchObject({ error: "idempotency_key_reused" });
  });

  it("creates one guest profile for a retried sign-up", async () => {
    await start();
    const headers = { "idempotency-key": "signup-000001" };
    const a = (await (await post("/api/profiles", { name: "Ade" }, headers)).json()) as { token: string };
    const b = (await (await post("/api/profiles", { name: "Ade" }, headers)).json()) as { token: string };
    expect(b.token).toBe(a.token);
    const count = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM profiles`);
    expect(count.rows[0]!.n).toBe(1);
  });

  it("limits guest profile creation per IP", async () => {
    await start({ profileCreates: { limit: 2, windowMs: 60_000 } });
    expect((await post("/api/profiles", {})).status).toBe(201);
    expect((await post("/api/profiles", {})).status).toBe(201);
    expect((await post("/api/profiles", {})).status).toBe(429);
  });
});
