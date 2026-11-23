import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import {
  clientMessageSchema,
  PROTOCOL_VERSION,
  type Actor,
  type ClientMessage,
  type RoomEvent,
  type ServerErrorCode,
  type ServerMessage,
} from "@afro-party/game-core";
import { clientIp } from "./client-ip.js";
import type { ServerConfig } from "./config.js";
import { createApiHandler } from "./http-api.js";
import type { Payments } from "./payments.js";
import type { ProfileService } from "./profile-service.js";
import { ConcurrencyLimiter, SlidingWindowLimiter } from "./rate-limit.js";
import { errorMessage, RoomManager, type Admission, type ClientLink } from "./room-manager.js";

export interface AppDeps {
  config: ServerConfig;
  profiles: ProfileService | null;
  payments: Payments | null;
  /** Access logs on stdout (off in tests). */
  log?: boolean;
}

export interface RunningApp {
  server: Server;
  rooms: RoomManager;
  close: () => Promise<void>;
}

interface Connection extends ClientLink {
  ip: string;
  admission: Admission | null;
  recent: number[];
  /** Messages from one socket are processed strictly in order (admission awaits the DB). */
  queue: Promise<void>;
  alive: boolean;
}

/** Wires HTTP API + WebSocket rooms onto one port. Used by server.ts and by integration tests. */
export function createApp(deps: AppDeps): RunningApp {
  const { config } = deps;
  const rooms = new RoomManager(config, deps.profiles);
  const api = createApiHandler({ profiles: deps.profiles, payments: deps.payments, config, log: deps.log ?? true });

  // Per-IP protection for the socket side. Players in one house share an IP, so these
  // are generous: they stop floods and room-code guessing, not families.
  const socketsPerIp = new ConcurrencyLimiter(config.limits.socketsPerIp);
  const roomCreates = new SlidingWindowLimiter(config.limits.roomCreates.limit, config.limits.roomCreates.windowMs);
  const joins = new SlidingWindowLimiter(config.limits.joins.limit, config.limits.joins.windowMs);

  const server = createServer((req, res) => {
    api(req, res)
      .then((handled) => {
        if (!handled) handlePlainHttp(req, res);
      })
      .catch((err: unknown) => {
        console.error("[http] unhandled", err);
        if (!res.headersSent) res.writeHead(500).end();
      });
  });

  function handlePlainHttp(req: IncomingMessage, res: ServerResponse): void {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: true, rooms: rooms.roomCount, progression: deps.profiles !== null }));
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }

  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: config.maxPayloadBytes,
    verifyClient: (info: { req: IncomingMessage }, done: (ok: boolean, code?: number, message?: string) => void) => {
      const origin = info.req.headers.origin;
      if (config.allowedOrigins.length > 0 && (origin === undefined || !config.allowedOrigins.includes(origin))) {
        return done(false, 403, "Origin not allowed");
      }
      const ip = clientIp(info.req, config.trustProxy);
      if (!socketsPerIp.acquire(ip)) return done(false, 429, "Too many connections");
      // Release when the TCP socket closes. That covers normal closes AND handshakes
      // that fail after this point (where no "connection" event ever fires).
      info.req.socket.once("close", () => socketsPerIp.release(ip));
      (info.req as IncomingMessage & { slotIp?: string }).slotIp = ip;
      done(true);
    },
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const ip = (req as IncomingMessage & { slotIp?: string }).slotIp ?? clientIp(req, config.trustProxy);
    const conn: Connection = {
      ip,
      admission: null,
      recent: [],
      queue: Promise.resolve(),
      alive: true,
      send(message: ServerMessage) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
      },
      close() {
        ws.close(4000, "closed");
      },
    };
    const release = () => {
      if (conn.admission) rooms.detach(conn, conn.admission.code);
      conn.admission = null;
    };

    ws.on("pong", () => {
      conn.alive = true;
    });
    heartbeats.set(ws, conn);

    ws.on("message", (raw: RawData, isBinary: boolean) => {
      if (isBinary) return conn.send(errorMessage("bad_message"));
      if (isMessageFlood(conn)) return conn.send(errorMessage("rate_limited"));
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawToString(raw));
      } catch {
        return conn.send(errorMessage("bad_message"));
      }
      const result = clientMessageSchema.safeParse(parsed);
      if (!result.success) return conn.send(errorMessage("bad_message"));
      conn.queue = conn.queue
        .then(() => handleMessage(conn, result.data))
        .catch((err: unknown) => {
          console.error("[ws] message failed", err);
          conn.send(errorMessage("bad_message"));
        });
    });
    ws.on("close", () => {
      heartbeats.delete(ws);
      release();
    });
    ws.on("error", () => ws.terminate());
  });

  async function handleMessage(conn: Connection, message: ClientMessage): Promise<void> {
    if (message.t === "ping") return conn.send({ t: "pong", serverNow: Date.now() });

    if (message.t === "create" || message.t === "join" || message.t === "resume") {
      if (message.t === "create" && !roomCreates.take(conn.ip)) return conn.send(errorMessage("rate_limited"));
      if (message.t === "join" && !joins.take(conn.ip)) return conn.send(errorMessage("rate_limited"));
      if (conn.admission) {
        // One room per connection; switching rooms means detaching from the old one.
        rooms.detach(conn, conn.admission.code);
        conn.admission = null;
      }
      const admitted =
        message.t === "create"
          ? await rooms.create({
              mode: message.mode,
              regions: message.regions,
              familyMode: message.familyMode,
              player: message.player,
              profileToken: message.profileToken,
              requestId: message.requestId,
              bots: message.bots,
            })
          : message.t === "join"
            ? await rooms.join(message.code, message.name, message.homeRegion, message.profileToken, message.requestId)
            : rooms.resume(message.code, message.token);
      if (!admitted.ok) return conn.send(errorMessage(admitted.code));

      conn.admission = admitted.value;
      const { actor, code, token } = admitted.value;
      conn.send({
        t: "welcome",
        protocol: PROTOCOL_VERSION,
        code,
        role: actor.kind,
        playerId: actor.kind === "player" ? actor.id : null,
        token,
      });
      rooms.attach(conn, admitted.value);
      return;
    }

    if (!conn.admission) return conn.send(errorMessage("not_in_room"));
    const { code, actor } = conn.admission;

    if (message.t === "leave") {
      const error = rooms.leave(code, actor);
      // "Already gone" counts as success: leaving is idempotent from the user's view.
      if (error && error !== "unknown_player" && error !== "room_not_found") return conn.send(errorMessage(error));
      if (error) conn.send({ t: "left" });
      conn.admission = null;
      return;
    }
    if (message.t === "react") {
      const error = rooms.react(code, actor, message.emoji);
      // Drop rate-limited reactions silently: mashing the button shouldn't toast errors.
      if (error && error !== "rate_limited") conn.send(errorMessage(error));
      return;
    }
    const event = toRoomEvent(message, actor);
    if (!event) return conn.send(errorMessage("not_allowed"));
    const error: ServerErrorCode | null = rooms.dispatch(code, actor, event);
    if (error) conn.send(errorMessage(error));
  }

  function isMessageFlood(conn: Connection): boolean {
    const now = Date.now();
    conn.recent = conn.recent.filter((t) => now - t < config.rateLimit.windowMs);
    conn.recent.push(now);
    return conn.recent.length > config.rateLimit.messages;
  }

  // Drop dead sockets (phones that lost signal without a clean close).
  const heartbeats = new Map<WebSocket, Connection>();
  const heartbeat = setInterval(() => {
    for (const [ws, conn] of heartbeats) {
      if (!conn.alive) {
        ws.terminate();
        continue;
      }
      conn.alive = false;
      ws.ping();
    }
  }, config.heartbeatMs);
  const janitor = setInterval(() => {
    rooms.sweep();
    roomCreates.prune();
    joins.prune();
  }, 60_000);
  heartbeat.unref();
  janitor.unref();

  return {
    server,
    rooms,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeat);
        clearInterval(janitor);
        for (const client of wss.clients) client.close(1001, "server restarting");
        rooms.shutdown();
        wss.close();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

function toRoomEvent(message: ClientMessage, actor: Actor): RoomEvent | null {
  const playerId = actor.kind === "player" ? actor.id : null;
  switch (message.t) {
    case "start":
      return { type: "start_game", actor };
    case "advance":
      return { type: "advance", actor };
    case "play_again":
      return { type: "play_again", actor };
    case "kick":
      return { type: "player_kicked", actor, playerId: message.playerId };
    case "add_bot":
      return { type: "bot_added", actor };
    case "settings":
      return {
        type: "update_settings",
        actor,
        ...(message.regions ? { regions: message.regions } : {}),
        ...(message.familyMode !== undefined ? { familyMode: message.familyMode } : {}),
        ...(message.packs ? { packs: message.packs } : {}),
      };
    case "answer":
      return playerId ? { type: "submit_answer", playerId, promptId: message.promptId, text: message.text } : null;
    case "vote":
      return playerId ? { type: "cast_vote", playerId, matchupIndex: message.matchupIndex, option: message.option } : null;
    default:
      return null;
  }
}

function rawToString(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  return raw.toString("utf8");
}
