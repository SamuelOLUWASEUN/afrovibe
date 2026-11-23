import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOT_ANSWER_DELAY_MS,
  createRoom,
  DEFAULT_COSMETICS,
  reduceRoom,
  seededRng,
  WETIN_YOU_TALK_PROMPTS,
  type Actor,
  type RoomEvent,
  type RoomState,
  type ServerMessage,
} from "@afro-party/game-core";
import { BotDriver } from "../src/bot-driver.js";
import type { ServerConfig } from "../src/config.js";
import { RoomManager, type Admission, type ClientLink } from "../src/room-manager.js";

const PROMPTS = new Map(WETIN_YOU_TALK_PROMPTS.map((p) => [p.id, p]));
const ME: Actor = { kind: "player", id: "me" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

/** A room held in memory plus a driver, wired the way RoomManager wires them. */
function harness(bots = 2, act?: (event: RoomEvent) => string | null) {
  const rng = seededRng(5);
  let state: RoomState = createRoom("ABCD", { mode: "remote", regions: ["ng"], familyMode: true, packs: [] });
  const calls: RoomEvent[] = [];
  const logs: string[] = [];
  const apply = (event: RoomEvent) => {
    const result = reduceRoom(state, event, { now: Date.now(), rng, prompts: WETIN_YOU_TALK_PROMPTS });
    if (!result.ok) return result.error;
    state = result.state;
    driver.sync();
    return null;
  };
  const driver = new BotDriver({
    getState: () => state,
    act: (event) => {
      calls.push(event);
      return (act ? act(event) : apply(event)) as never;
    },
    rng,
    prompts: PROMPTS,
    log: (m) => logs.push(m),
  });
  apply({ type: "player_joined", playerId: "me", name: "Ada", homeRegion: "ng", cosmetics: DEFAULT_COSMETICS, ownedPacks: [] });
  for (let i = 0; i < bots; i += 1) apply({ type: "bot_added", actor: ME });
  apply({ type: "start_game", actor: ME });
  return { driver, calls, logs, apply, get state() { return state; } };
}

const botAnswers = (calls: RoomEvent[]) => calls.filter((e) => e.type === "submit_answer");

describe("BotDriver", () => {
  it("schedules one move per bot and makes them think before answering", () => {
    const h = harness(2);
    expect(h.driver.scheduled).toBe(2);
    vi.advanceTimersByTime(BOT_ANSWER_DELAY_MS.min - 1);
    expect(botAnswers(h.calls)).toHaveLength(0); // nobody answers instantly
    vi.advanceTimersByTime(60_000);
    // Each bot answers both of its prompts, one at a time.
    expect(botAnswers(h.calls)).toHaveLength(4);
    expect(h.state.phase.kind).toBe("answering"); // still waiting for the person
    expect(h.driver.scheduled).toBe(0);
    expect(h.logs).toEqual([]);
  });

  it("never repeats an answer within a game", () => {
    const h = harness(4);
    vi.advanceTimersByTime(70_000);
    const texts = botAnswers(h.calls).map((e) => (e.type === "submit_answer" ? e.text : ""));
    expect(texts.length).toBeGreaterThanOrEqual(8);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("drops stale moves when the phase changes, then plays the new phase", () => {
    const h = harness(2);
    h.apply({ type: "timeout", phaseSeq: h.state.phaseSeq }); // answering ends before bots act
    const answersBefore = botAnswers(h.calls).length;
    vi.advanceTimersByTime(30_000);
    expect(botAnswers(h.calls).length).toBe(answersBefore); // old answer timers did nothing
    expect(h.logs).toEqual([]);
  });

  it("pauses while no person is connected and resumes when they come back", () => {
    const h = harness(2);
    h.apply({ type: "player_connection", playerId: "me", connected: false });
    expect(h.driver.scheduled).toBe(0);
    vi.advanceTimersByTime(30_000);
    expect(h.calls).toHaveLength(0);
    h.apply({ type: "player_connection", playerId: "me", connected: true });
    expect(h.driver.scheduled).toBe(2);
  });

  it("parks a bot after an error instead of retrying in a loop", () => {
    const h = harness(2, () => "wrong_phase");
    vi.advanceTimersByTime(70_000);
    expect(h.calls).toHaveLength(2); // one attempt per bot, then it waits for the next phase
    expect(h.logs).toHaveLength(2);
    expect(h.driver.scheduled).toBe(0);
  });

  it("stops everything on dispose", () => {
    const h = harness(3);
    h.driver.dispose();
    vi.advanceTimersByTime(60_000);
    expect(h.calls).toHaveLength(0);
    h.driver.sync();
    expect(h.driver.scheduled).toBe(0);
  });
});

// ── Full games through the real RoomManager, on fake time ───────────────────

const CONFIG = {
  maxRooms: 10,
  idleRoomTtlMs: 60_000,
  maxRoomAgeMs: 3_600_000,
  botDelayPercent: 100,
} as unknown as ServerConfig;

function link(messages: ServerMessage[]): ClientLink {
  return { send: (m) => messages.push(m), close: () => undefined };
}

describe("solo game against bots (RoomManager)", () => {
  it("plays from the lobby to the final scoreboard with one person and two bots", async () => {
    const rooms = new RoomManager(CONFIG);
    const created = await rooms.create({
      mode: "remote",
      regions: ["ng"],
      familyMode: true,
      player: { name: "Ada", homeRegion: "ng" },
      bots: 2,
      requestId: "solo-1234",
    });
    if (!created.ok) throw new Error(created.code);
    const me: Admission = created.value;
    const inbox: ServerMessage[] = [];
    rooms.attach(link(inbox), me);
    const view = () => {
      const states = inbox.filter((m): m is Extract<ServerMessage, { t: "state" }> => m.t === "state");
      const last = states.at(-1);
      if (!last) throw new Error("no state yet");
      return last.view;
    };
    expect(view().players.filter((p) => p.isBot)).toHaveLength(2);

    // A retried create (lost "welcome") must not add two more bots or a second room.
    const retried = await rooms.create({
      mode: "remote",
      regions: ["ng"],
      familyMode: true,
      player: { name: "Ada", homeRegion: "ng" },
      bots: 2,
      requestId: "solo-1234",
    });
    expect(retried.ok && retried.value.token === me.token).toBe(true);
    expect(rooms.roomCount).toBe(1);
    expect(view().players).toHaveLength(3);

    expect(rooms.dispatch(me.code, me.actor, { type: "start_game", actor: me.actor })).toBeNull();
    const seen = new Set<string>();
    for (let step = 0; step < 400 && view().phase.kind !== "final"; step += 1) {
      const phase = view().phase;
      seen.add(phase.kind);
      if (phase.kind === "answering") {
        for (const p of phase.myPrompts.filter((x) => !x.answered)) {
          rooms.dispatch(me.code, me.actor, {
            type: "submit_answer",
            playerId: me.actor.kind === "player" ? me.actor.id : "",
            promptId: p.promptId,
            text: `Ada's answer ${p.promptId}`,
          });
        }
      }
      if (phase.kind === "voting" && phase.canVote && phase.myVote === null) {
        const option = phase.options.find((o) => o.votable);
        if (option) {
          rooms.dispatch(me.code, me.actor, {
            type: "cast_vote",
            playerId: me.actor.kind === "player" ? me.actor.id : "",
            matchupIndex: phase.matchupIndex,
            option: option.index,
          });
        }
      }
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(view().phase.kind).toBe("final");
    expect([...seen]).toEqual(expect.arrayContaining(["answering", "voting", "reveal", "scoreboard"]));
    const bots = view().players.filter((p) => p.isBot);
    expect(bots.some((p) => p.score > 0)).toBe(true); // bots really took part
    rooms.shutdown();
  });

  it("lets nobody but the VIP add bots, and only in the lobby", async () => {
    const rooms = new RoomManager(CONFIG);
    const host = await rooms.create({ mode: "remote", regions: ["ng"], familyMode: true, player: { name: "Ada", homeRegion: "ng" } });
    if (!host.ok) throw new Error(host.code);
    const guest = await rooms.join(host.value.code, "Bola", "ng");
    if (!guest.ok) throw new Error(guest.code);
    expect(rooms.dispatch(host.value.code, guest.value.actor, { type: "bot_added", actor: guest.value.actor })).toBe("not_allowed");
    expect(rooms.dispatch(host.value.code, host.value.actor, { type: "bot_added", actor: host.value.actor })).toBeNull();
    rooms.shutdown();
  });
});
