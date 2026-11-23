import { randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  allowedReactions,
  createRoom,
  DECK_PACK_PROMPTS,
  DEFAULT_COSMETICS,
  ERROR_MESSAGES,
  projectRoom,
  reduceRoom,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  summarizeGame,
  WETIN_YOU_TALK_PROMPTS,
  type Actor,
  type HomeRegionCode,
  type RoomEvent,
  type RoomMode,
  type RoomState,
  type ServerErrorCode,
  type ServerMessage,
} from "@afro-party/game-core";
import { BotDriver } from "./bot-driver.js";
import type { ServerConfig } from "./config.js";
import type { ProfileService } from "./profile-service.js";

const ALL_PROMPTS = [...WETIN_YOU_TALK_PROMPTS, ...DECK_PACK_PROMPTS];
const PROMPTS_BY_ID = new Map(ALL_PROMPTS.map((p) => [p.id, p]));
const BASIC_REACTIONS = new Set(allowedReactions(1, new Set()));
const REACTION_COOLDOWN_MS = 1_200;

interface LinkedProfile {
  profileId: string;
  reactions: Set<string>;
}

/** Anything that can receive server messages (a WebSocket in production, a stub in tests). */
export interface ClientLink {
  send(message: ServerMessage): void;
  close(): void;
}

interface RoomEntry {
  state: RoomState;
  /** Resume token -> actor. Tokens are the only credential a client holds. */
  sessions: Map<string, Actor>;
  clients: Map<ClientLink, Actor>;
  timer: NodeJS.Timeout | null;
  createdAt: number;
  emptySince: number | null;
  /** playerId -> saved profile, for rewards and owned reactions. */
  profiles: Map<string, LinkedProfile>;
  lastReaction: Map<string, number>;
  /** Schedules the computer players' moves for this room. */
  bots: BotDriver;
}

export type ManagerResult<T> = { ok: true; value: T } | { ok: false; code: ServerErrorCode };

export interface Admission {
  code: string;
  actor: Actor;
  token: string;
}

/** Codes that could spell something unfortunate on a family TV. */
const BLOCKED_CODES = new Set(["ANUS", "ARSE", "CUNT", "DAMN", "DICK", "FUCK", "PISS", "SHIT", "SLUT", "TWAT", "WANK", "HELL", "KILL", "RAPE", "NAZI", "PUSS", "COCK", "DUMB"]);

const cryptoRng = (): number => randomInt(0, 2 ** 32) / 2 ** 32;

/** How long a create/join requestId is remembered for retries. */
const ADMISSION_TTL_MS = 10 * 60_000;

export class RoomManager {
  private readonly rooms = new Map<string, RoomEntry>();
  /** requestId-keyed admissions, so a retried create/join returns the same seat. */
  private readonly admissions = new Map<string, { admission: Admission; expiresAt: number }>();
  /** Admissions still being processed; a concurrent duplicate awaits the same promise. */
  private readonly pendingAdmissions = new Map<string, Promise<ManagerResult<Admission>>>();

  constructor(
    private readonly config: ServerConfig,
    private readonly profileService: ProfileService | null = null,
  ) {}

  get roomCount(): number {
    return this.rooms.size;
  }

  async create(input: {
    mode: RoomMode;
    regions: readonly HomeRegionCode[];
    familyMode: boolean;
    player?: { name: string; homeRegion: HomeRegionCode } | undefined;
    profileToken?: string | undefined;
    requestId?: string | undefined;
    bots?: number | undefined;
  }): Promise<ManagerResult<Admission>> {
    return this.admitOnce(input.requestId ? `create:${input.requestId}` : null, () => this.createRoom(input));
  }

  async join(
    code: string,
    name: string,
    homeRegion: HomeRegionCode,
    profileToken?: string | undefined,
    requestId?: string | undefined,
  ): Promise<ManagerResult<Admission>> {
    return this.admitOnce(requestId ? `join:${code}:${requestId}` : null, () =>
      this.joinRoom(code, name, homeRegion, profileToken),
    );
  }

  /**
   * Idempotent admission. Without a key it just runs. With a key:
   * - a finished admission whose seat still exists is returned as-is (same token);
   * - an in-flight one is awaited, so two racing retries get one seat, not two.
   */
  private async admitOnce(
    key: string | null,
    run: () => Promise<ManagerResult<Admission>>,
  ): Promise<ManagerResult<Admission>> {
    if (!key) return run();
    const cached = this.admissions.get(key);
    if (cached && cached.expiresAt > Date.now() && this.isAdmissionLive(cached.admission)) {
      return { ok: true, value: cached.admission };
    }
    const pending = this.pendingAdmissions.get(key);
    if (pending) return pending;

    const promise = run();
    this.pendingAdmissions.set(key, promise);
    try {
      const result = await promise;
      if (result.ok) this.admissions.set(key, { admission: result.value, expiresAt: Date.now() + ADMISSION_TTL_MS });
      return result;
    } finally {
      this.pendingAdmissions.delete(key);
    }
  }

  private isAdmissionLive(admission: Admission): boolean {
    const entry = this.rooms.get(admission.code);
    return entry !== undefined && entry.sessions.has(admission.token);
  }

  private async createRoom(input: {
    mode: RoomMode;
    regions: readonly HomeRegionCode[];
    familyMode: boolean;
    player?: { name: string; homeRegion: HomeRegionCode } | undefined;
    profileToken?: string | undefined;
    bots?: number | undefined;
  }): Promise<ManagerResult<Admission>> {
    if (this.rooms.size >= this.config.maxRooms) return { ok: false, code: "server_full" };
    if (input.mode === "remote" && !input.player) return { ok: false, code: "invalid_name" };

    const code = this.newCode();
    if (!code) return { ok: false, code: "server_full" };
    const now = Date.now();
    // The bot driver's callbacks close over `entry`; they only run after it is initialised.
    const entry: RoomEntry = {
      state: createRoom(code, {
        mode: input.mode,
        regions: [...new Set(input.regions)],
        familyMode: input.familyMode,
        packs: [],
      }),
      sessions: new Map(),
      clients: new Map(),
      timer: null,
      createdAt: now,
      emptySince: now,
      profiles: new Map(),
      lastReaction: new Map(),
      bots: new BotDriver({
        getState: () => entry.state,
        act: (event) => this.apply(entry, event),
        rng: cryptoRng,
        prompts: PROMPTS_BY_ID,
        log: (message) => console.warn(message),
        delayPercent: this.config.botDelayPercent,
      }),
    };
    this.rooms.set(code, entry);

    let admission: Admission;
    if (input.mode === "screen") {
      const token = newToken();
      admission = { code, actor: { kind: "host" }, token };
      entry.sessions.set(token, admission.actor);
    } else {
      const joined = await this.joinRoom(code, input.player?.name ?? "", input.player?.homeRegion ?? "ng", input.profileToken);
      if (!joined.ok) {
        this.deleteRoom(code);
        return joined;
      }
      admission = joined.value;
    }
    // "Practice with bots": fill seats as part of the same (idempotent) create request.
    for (let i = 0; i < (input.bots ?? 0); i += 1) {
      if (this.apply(entry, { type: "bot_added", actor: admission.actor })) break;
    }
    return { ok: true, value: admission };
  }

  private async joinRoom(
    code: string,
    name: string,
    homeRegion: HomeRegionCode,
    profileToken?: string | undefined,
  ): Promise<ManagerResult<Admission>> {
    if (!this.rooms.has(code)) return { ok: false, code: "room_not_found" };
    // A bad or unknown profile token just means "play as a guest", never an error.
    const identity =
      profileToken && this.profileService
        ? await this.profileService.roomIdentity(profileToken).catch((err: unknown) => {
            console.error("[rooms] profile lookup failed", err);
            return null;
          })
        : null;
    const entry = this.rooms.get(code); // re-read: the room may have closed while we awaited
    if (!entry) return { ok: false, code: "room_not_found" };
    const playerId = randomUUID();
    const error = this.apply(entry, {
      type: "player_joined",
      playerId,
      name,
      homeRegion,
      cosmetics: identity?.cosmetics ?? DEFAULT_COSMETICS,
      ownedPacks: identity?.ownedPacks ?? [],
    });
    if (error) return { ok: false, code: error };
    if (identity) entry.profiles.set(playerId, { profileId: identity.profileId, reactions: new Set(identity.reactions) });
    const token = newToken();
    const actor: Actor = { kind: "player", id: playerId };
    entry.sessions.set(token, actor);
    return { ok: true, value: { code, actor, token } };
  }

  resume(code: string, token: string): ManagerResult<Admission> {
    const entry = this.rooms.get(code);
    if (!entry) return { ok: false, code: "room_not_found" };
    const actor = entry.sessions.get(token);
    if (!actor) return { ok: false, code: "session_expired" };
    if (actor.kind === "player" && !entry.state.players.some((p) => p.id === actor.id)) {
      entry.sessions.delete(token);
      return { ok: false, code: "session_expired" };
    }
    return { ok: true, value: { code, actor, token } };
  }

  /** Binds a live connection to an admitted actor and pushes the current view. */
  attach(link: ClientLink, admission: Admission): void {
    const entry = this.rooms.get(admission.code);
    if (!entry) return;
    entry.clients.set(link, admission.actor);
    entry.emptySince = null;
    const { actor } = admission;
    if (actor.kind === "player") {
      const player = entry.state.players.find((p) => p.id === actor.id);
      if (player && !player.connected) {
        this.apply(entry, { type: "player_connection", playerId: actor.id, connected: true });
        return; // apply() already broadcast
      }
    }
    this.sendView(entry, link, actor);
  }

  detach(link: ClientLink, code: string): void {
    const entry = this.rooms.get(code);
    if (!entry) return;
    const actor = entry.clients.get(link);
    entry.clients.delete(link);
    if (entry.clients.size === 0) entry.emptySince = Date.now();
    if (actor?.kind !== "player") return;
    const stillHere = [...entry.clients.values()].some((a) => a.kind === "player" && a.id === actor.id);
    if (!stillHere && entry.state.players.some((p) => p.id === actor.id)) {
      this.apply(entry, { type: "player_connection", playerId: actor.id, connected: false });
    }
  }

  /** Applies a client action. Returns an error code, or null on success. */
  dispatch(code: string, actor: Actor, event: RoomEvent): ServerErrorCode | null {
    const entry = this.rooms.get(code);
    if (!entry) return "room_not_found";
    if (event.type === "player_kicked" && actor.kind === "player" && actor.id === event.playerId) {
      return "not_allowed";
    }
    const error = this.apply(entry, event);
    if (!error && event.type === "player_kicked") this.evict(entry, event.playerId, { t: "kicked" });
    return error;
  }

  /**
   * Voluntary leave. A player is removed from the game (forfeiting this game's
   * points and rewards) and their seat token is revoked. The TV/host screen just
   * gives up its seat: the room carries on, controlled by the VIP's phone.
   */
  leave(code: string, actor: Actor): ServerErrorCode | null {
    const entry = this.rooms.get(code);
    if (!entry) return "room_not_found";
    if (actor.kind === "host") {
      for (const [token, a] of entry.sessions) if (a.kind === "host") entry.sessions.delete(token);
      for (const [link, a] of entry.clients) {
        if (a.kind !== "host") continue;
        link.send({ t: "left" });
        entry.clients.delete(link);
        link.close();
      }
      if (entry.clients.size === 0) entry.emptySince = Date.now();
      return null;
    }
    const error = this.apply(entry, { type: "player_left", playerId: actor.id });
    if (error) return error;
    entry.profiles.delete(actor.id);
    this.evict(entry, actor.id, { t: "left" });
    if (entry.clients.size === 0) entry.emptySince = Date.now();
    return null;
  }

  /** Ephemeral emoji reaction from a player, broadcast to the whole room. */
  react(code: string, actor: Actor, emoji: string): ServerErrorCode | null {
    const entry = this.rooms.get(code);
    if (!entry) return "room_not_found";
    if (actor.kind !== "player") return "not_allowed";
    const allowed = entry.profiles.get(actor.id)?.reactions ?? BASIC_REACTIONS;
    if (!allowed.has(emoji)) return "not_allowed";
    const now = Date.now();
    if (now - (entry.lastReaction.get(actor.id) ?? 0) < REACTION_COOLDOWN_MS) return "rate_limited";
    entry.lastReaction.set(actor.id, now);
    const message: ServerMessage = { t: "reaction", id: randomUUID().slice(0, 8), playerId: actor.id, emoji };
    for (const link of entry.clients.keys()) link.send(message);
    return null;
  }

  /** Removes idle and expired rooms and stale admission records. Call periodically. */
  sweep(now = Date.now()): number {
    for (const [key, record] of this.admissions) if (record.expiresAt <= now) this.admissions.delete(key);
    let removed = 0;
    for (const [code, entry] of this.rooms) {
      const idle = entry.emptySince !== null && now - entry.emptySince > this.config.idleRoomTtlMs;
      const expired = now - entry.createdAt > this.config.maxRoomAgeMs;
      if (idle || expired) {
        for (const link of entry.clients.keys()) link.close();
        this.deleteRoom(code);
        removed += 1;
      }
    }
    return removed;
  }

  shutdown(): void {
    for (const code of [...this.rooms.keys()]) this.deleteRoom(code);
  }

  // ── internals ────────────────────────────────────────────────────────────────

  private apply(entry: RoomEntry, event: RoomEvent): ServerErrorCode | null {
    const result = reduceRoom(entry.state, event, {
      now: Date.now(),
      rng: cryptoRng,
      prompts: ALL_PROMPTS,
    });
    if (!result.ok) return result.error;
    if (result.state === entry.state) return null; // no-op (e.g. stale timer)
    const previous = entry.state;
    entry.state = result.state;
    this.schedule(entry);
    this.broadcast(entry);
    entry.bots.sync();
    if (previous.phase.kind !== "final" && result.state.phase.kind === "final") {
      void this.grantRewards(entry, result.state);
    }
    return null;
  }

  /** Pays out XP, coins and badges to profile-linked players once a game ends. */
  private async grantRewards(entry: RoomEntry, finished: RoomState): Promise<void> {
    const service = this.profileService;
    if (!service || finished.gameNumber === 0) return;
    const gameRef = `${finished.code}:${entry.createdAt}:${finished.gameNumber}`;
    for (const summary of summarizeGame(finished)) {
      const linked = entry.profiles.get(summary.playerId);
      if (!linked) continue;
      try {
        const rewards = await service.recordGame(gameRef, linked.profileId, summary);
        if (!rewards) continue;
        for (const [link, actor] of entry.clients) {
          if (actor.kind === "player" && actor.id === summary.playerId) link.send({ t: "rewards", rewards });
        }
        if (rewards.levelAfter > rewards.levelBefore && this.rooms.get(finished.code) === entry) {
          const player = entry.state.players.find((p) => p.id === summary.playerId);
          if (player) {
            this.apply(entry, {
              type: "player_cosmetics",
              playerId: player.id,
              cosmetics: { ...player.cosmetics, level: rewards.levelAfter },
            });
          }
        }
      } catch (err) {
        console.error(`[rooms] reward grant failed for ${linked.profileId}`, err);
      }
    }
  }

  /** One timer per room, always tracking the current phase's deadline. */
  private schedule(entry: RoomEntry): void {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    const phase = entry.state.phase;
    if (!("deadline" in phase)) return;
    const seq = entry.state.phaseSeq;
    const code = entry.state.code;
    const delay = Math.max(0, phase.deadline - Date.now());
    entry.timer = setTimeout(() => {
      const current = this.rooms.get(code);
      if (current) this.apply(current, { type: "timeout", phaseSeq: seq });
    }, delay);
    entry.timer.unref();
  }

  private broadcast(entry: RoomEntry): void {
    for (const [link, actor] of entry.clients) this.sendView(entry, link, actor);
  }

  private sendView(entry: RoomEntry, link: ClientLink, actor: Actor): void {
    link.send({ t: "state", view: projectRoom(entry.state, actor), serverNow: Date.now() });
  }

  private evict(entry: RoomEntry, playerId: string, notice: ServerMessage): void {
    for (const [token, actor] of entry.sessions) {
      if (actor.kind === "player" && actor.id === playerId) entry.sessions.delete(token);
    }
    for (const [link, actor] of entry.clients) {
      if (actor.kind === "player" && actor.id === playerId) {
        link.send(notice);
        entry.clients.delete(link);
        link.close();
      }
    }
  }

  private deleteRoom(code: string): void {
    const entry = this.rooms.get(code);
    if (entry?.timer) clearTimeout(entry.timer);
    entry?.bots.dispose();
    this.rooms.delete(code);
  }

  private newCode(): string | null {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
        code += ROOM_CODE_ALPHABET[randomInt(0, ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code) && !BLOCKED_CODES.has(code)) return code;
    }
    return null;
  }
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function errorMessage(code: ServerErrorCode): ServerMessage {
  return { t: "error", code, message: ERROR_MESSAGES[code] };
}
