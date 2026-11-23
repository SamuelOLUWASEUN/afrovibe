import { describe, expect, it } from "vitest";
import {
  BOT_ANSWERS,
  botTask,
  computeGameReward,
  createRoom,
  DEFAULT_COSMETICS,
  MAX_BOTS,
  MAX_PLAYERS,
  newlyEarnedBadges,
  addGameToLifetime,
  pickBotAnswer,
  pickBotVote,
  projectRoom,
  reduceRoom,
  seededRng,
  summarizeGame,
  WETIN_YOU_TALK_PROMPTS,
  type Actor,
  type Matchup,
  type ReduceContext,
  type RoomEvent,
  type RoomSettings,
  type RoomState,
} from "../src/index.js";

const SETTINGS: RoomSettings = { mode: "remote", regions: ["ng"], familyMode: true, packs: [] };
const JOIN = { cosmetics: DEFAULT_COSMETICS, ownedPacks: [] as string[] };
const HOST: Actor = { kind: "host" };
const vip = (id = "p0"): Actor => ({ kind: "player", id });

let clock = 1_000;
function ctx(seed = 7): ReduceContext {
  clock += 10;
  return { now: clock, rng: seededRng(seed + clock), prompts: WETIN_YOU_TALK_PROMPTS };
}

function tryApply(state: RoomState, event: RoomEvent) {
  return reduceRoom(state, event, ctx());
}

function apply(state: RoomState, event: RoomEvent): RoomState {
  const result = tryApply(state, event);
  if (!result.ok) throw new Error(`Expected ok for ${event.type}, got ${result.error}`);
  return result.state;
}

function withHumans(count: number, settings: RoomSettings = SETTINGS): RoomState {
  let state = createRoom("ABCD", settings);
  for (let i = 0; i < count; i += 1) {
    state = apply(state, { type: "player_joined", playerId: `p${i}`, name: `Person ${i}`, homeRegion: "ng", ...JOIN });
  }
  return state;
}

function addBots(state: RoomState, count: number, actor: Actor = vip()): RoomState {
  let next = state;
  for (let i = 0; i < count; i += 1) next = apply(next, { type: "bot_added", actor });
  return next;
}

/** Plays every bot's outstanding task, the way the server's bot driver does. */
function runBots(state: RoomState, used: Set<string>, rng = seededRng(99)): RoomState {
  let next = state;
  for (let guard = 0; guard < 50; guard += 1) {
    const bot = next.players.find((p) => p.isBot && botTask(next, p.id));
    if (!bot) return next;
    const task = botTask(next, bot.id);
    if (!task) return next;
    if (task.kind === "answer") {
      const prompt = WETIN_YOU_TALK_PROMPTS.find((p) => p.id === task.promptId);
      const text = pickBotAnswer({ promptRegions: prompt?.regions ?? ["pan"], roomRegions: next.settings.regions, used, rng });
      used.add(text);
      next = apply(next, { type: "submit_answer", playerId: bot.id, promptId: task.promptId, text });
    } else {
      const matchup = next.matchups[task.matchupIndex] as Matchup;
      const option = pickBotVote(matchup, bot.id, rng);
      if (option === null) throw new Error("bot had a vote task but no option");
      next = apply(next, { type: "cast_vote", playerId: bot.id, matchupIndex: task.matchupIndex, option });
    }
  }
  throw new Error("bots never settled");
}

function humanAnswers(state: RoomState): RoomState {
  let next = state;
  for (const m of state.matchups) {
    for (const id of m.authorIds) {
      const player = next.players.find((p) => p.id === id);
      if (!player || player.isBot || m.answers[id]) continue;
      next = apply(next, { type: "submit_answer", playerId: id, promptId: m.promptId, text: `${id} has a very funny answer` });
    }
  }
  return next;
}

function humanVotes(state: RoomState): RoomState {
  if (state.phase.kind !== "voting") return state;
  const index = state.phase.matchupIndex;
  let next = state;
  for (const p of state.players) {
    if (p.isBot) continue;
    const m = next.matchups[index] as Matchup;
    const option = m.authorIds.findIndex((id, i) => id !== p.id && m.answers[id] && i >= 0);
    if (m.kind === "pair" && m.authorIds.includes(p.id)) continue;
    if (option >= 0) next = apply(next, { type: "cast_vote", playerId: p.id, matchupIndex: index, option });
  }
  return next;
}

function timeout(state: RoomState): RoomState {
  return apply(state, { type: "timeout", phaseSeq: state.phaseSeq });
}

/** Drives a whole game: people and bots act, then each phase's timer fires. */
function playToFinal(state: RoomState): RoomState {
  const used = new Set<string>();
  let next = state;
  for (let guard = 0; guard < 200 && next.phase.kind !== "final"; guard += 1) {
    if (next.phase.kind === "answering") next = runBots(humanAnswers(next), used);
    else if (next.phase.kind === "voting") next = runBots(humanVotes(next), used);
    if (next.phase.kind !== "final") next = timeout(next);
  }
  expect(next.phase.kind).toBe("final");
  return next;
}

describe("adding and removing bots", () => {
  it("lets the VIP or host fill seats, never anyone else, and only in the lobby", () => {
    const room = withHumans(2);
    expect(tryApply(room, { type: "bot_added", actor: vip("p1") })).toEqual({ ok: false, error: "not_allowed" });
    const withBot = apply(room, { type: "bot_added", actor: vip("p0") });
    const bot = withBot.players.at(-1);
    expect(bot).toMatchObject({ isBot: true, connected: true, score: 0 });
    expect(bot?.id.startsWith("bot-")).toBe(true);
    expect(apply(room, { type: "bot_added", actor: HOST }).players).toHaveLength(3);

    const started = apply(withBot, { type: "start_game", actor: vip() });
    expect(tryApply(started, { type: "bot_added", actor: vip() })).toEqual({ ok: false, error: "game_in_progress" });
  });

  it("caps bots at MAX_BOTS and never overfills the room", () => {
    const capped = addBots(withHumans(1), MAX_BOTS);
    expect(capped.players.filter((p) => p.isBot)).toHaveLength(MAX_BOTS);
    expect(tryApply(capped, { type: "bot_added", actor: vip() })).toEqual({ ok: false, error: "too_many_bots" });
    expect(projectRoom(capped, vip()).botSlots).toBe(0);

    const nearlyFull = withHumans(MAX_PLAYERS - 1);
    const full = addBots(nearlyFull, 1);
    expect(tryApply(full, { type: "bot_added", actor: vip() })).toEqual({ ok: false, error: "room_full" });
  });

  it("gives every bot a unique name and id, and skips names people already use", () => {
    let room = createRoom("ABCD", { ...SETTINGS, regions: ["ng"] });
    room = apply(room, { type: "player_joined", playerId: "p0", name: "chidi", homeRegion: "ng", ...JOIN });
    room = addBots(room, MAX_BOTS);
    const names = room.players.map((p) => p.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(room.players.map((p) => p.id)).size).toBe(room.players.length);
    // Nigerian prompts in play: Nigerian bots come first (2 left after "chidi" is taken).
    expect(room.players.filter((p) => p.isBot && p.homeRegion === "ng")).toHaveLength(2);
  });

  it("never wears the default avatar, so a bot can't be mistaken for a new player", async () => {
    const { BOT_PERSONAS, DEFAULT_AVATAR_ID, findItem } = await import("../src/index.js");
    for (const bot of BOT_PERSONAS) {
      expect(bot.avatarId).not.toBe(DEFAULT_AVATAR_ID);
      expect(findItem(bot.avatarId)?.kind).toBe("avatar");
    }
  });

    it("can be removed with the normal Remove button", () => {
    const room = addBots(withHumans(1), 2);
    const botId = room.players.find((p) => p.isBot)?.id as string;
    const next = apply(room, { type: "player_kicked", actor: vip(), playerId: botId });
    expect(next.players.some((p) => p.id === botId)).toBe(false);
  });

  it("never makes a bot the VIP, and ignores connection events for bots", () => {
    let room = createRoom("ABCD", { ...SETTINGS, mode: "screen" });
    room = addBots(room, 2, HOST);
    expect(room.vipId).toBeNull();
    room = apply(room, { type: "player_joined", playerId: "p0", name: "Ada", homeRegion: "ng", ...JOIN });
    expect(room.vipId).toBe("p0");
    room = apply(room, { type: "player_connection", playerId: "p0", connected: false });
    expect(room.vipId).toBe("p0"); // nobody human to pass it to; a bot never gets it
    const botId = room.players.find((p) => p.isBot)?.id as string;
    expect(tryApply(room, { type: "player_connection", playerId: botId, connected: false })).toEqual({
      ok: false,
      error: "not_allowed",
    });
  });

  it("refuses to start a game with no people in it", () => {
    const onlyBots = addBots(createRoom("ABCD", { ...SETTINGS, mode: "screen" }), 3, HOST);
    expect(tryApply(onlyBots, { type: "start_game", actor: HOST })).toEqual({ ok: false, error: "needs_human" });
    const solo = addBots(withHumans(1), 2);
    expect(apply(solo, { type: "start_game", actor: vip() }).phase.kind).toBe("answering");
  });

  it("ends the game when the last person leaves, instead of bots playing alone", () => {
    const started = apply(addBots(withHumans(1), 2), { type: "start_game", actor: vip() });
    const after = apply(started, { type: "player_left", playerId: "p0" });
    expect(after.phase.kind).toBe("final");
    expect(summarizeGame(after)).toEqual([]);
  });
});

describe("bot turns", () => {
  it("plays a full solo game against bots from start to finish", () => {
    const started = apply(addBots(withHumans(1), 2), { type: "start_game", actor: vip() });
    const final = playToFinal(started);
    expect(final.players.every((p) => p.score >= 0)).toBe(true);
    expect(final.players.filter((p) => p.isBot).some((p) => p.score > 0)).toBe(true);
  });

  it("only gives a bot work it is actually allowed to do", () => {
    let state = apply(addBots(withHumans(1), 2), { type: "start_game", actor: vip() });
    const bots = state.players.filter((p) => p.isBot);
    for (const bot of bots) expect(botTask(state, bot.id)?.kind).toBe("answer");
    expect(botTask(state, "p0")).toBeNull(); // people aren't driven by the bot brain
    state = runBots(state, new Set());
    for (const bot of bots) expect(botTask(state, bot.id)).toBeNull();
    // Still answering: the person hasn't answered, so bots must wait rather than act again.
    expect(state.phase.kind).toBe("answering");
  });

  it("answers by country, never repeats in a game, and falls back when the pool runs dry", () => {
    const rng = seededRng(3);
    const used = new Set<string>();
    const ke = new Set(BOT_ANSWERS.filter((a) => a.regions.includes("ke")).map((a) => a.text));
    const allowed = new Set(BOT_ANSWERS.filter((a) => a.regions.includes("ke") || a.regions.includes("pan")).map((a) => a.text));
    let kenyan = 0;
    for (let i = 0; i < 40; i += 1) {
      const text = pickBotAnswer({ promptRegions: ["ke"], roomRegions: ["ke"], used, rng });
      expect(allowed.has(text)).toBe(true);
      expect(used.has(text)).toBe(false);
      used.add(text);
      if (ke.has(text)) kenyan += 1;
    }
    expect(kenyan).toBeGreaterThan(0);

    const everything = new Set(BOT_ANSWERS.map((a) => a.text));
    expect(typeof pickBotAnswer({ promptRegions: ["pan"], roomRegions: ["ng"], used: everything, rng })).toBe("string");
  });

  it("keeps every bot answer short and clean enough for family mode", () => {
    for (const answer of BOT_ANSWERS) {
      expect(Array.from(answer.text).length).toBeLessThanOrEqual(80);
      expect(answer.text.trim()).toBe(answer.text);
    }
    expect(new Set(BOT_ANSWERS.map((a) => a.text)).size).toBe(BOT_ANSWERS.length);
  });

  it("votes only for answers it may vote for, nudged towards effort", () => {
    const matchup: Matchup = {
      kind: "all",
      promptId: "x",
      promptText: "x",
      authorIds: ["bot-ama", "a", "b", "c"],
      answers: { "bot-ama": "mine", a: "lol", b: "A goat in a three-piece suit", c: null },
      votes: {},
      result: null,
    };
    const rng = seededRng(11);
    const tally = [0, 0, 0, 0];
    for (let i = 0; i < 2_000; i += 1) {
      const option = pickBotVote(matchup, "bot-ama", rng);
      expect(option === 1 || option === 2).toBe(true); // never its own, never an empty answer
      tally[option as number] = (tally[option as number] ?? 0) + 1;
    }
    expect(tally[2]).toBeGreaterThan(tally[1] as number);
    expect(tally[1]).toBeGreaterThan(0); // effort helps, but it's still a coin toss
  });
});

describe("rewards with bots", () => {
  it("treats you-plus-bots as practice: XP only, no coins, badges or win record", () => {
    const final = playToFinal(apply(addBots(withHumans(1), 3), { type: "start_game", actor: vip() }));
    const summary = summarizeGame(final);
    expect(summary).toHaveLength(1); // bots never get a summary entry
    const me = summary[0];
    if (!me) throw new Error("missing summary");
    expect(me).toMatchObject({ practice: true, won: false, playersInGame: 1 });
    expect(me.stats.votesReceived).toBe(0); // only bots could vote for you
    expect(me.stats.sweeps).toBe(0);
    const reward = computeGameReward(me);
    expect(reward.coins).toBe(0);
    expect(reward.xp).toBeGreaterThan(0);
    const before = { gamesPlayed: 4, wins: 1, votesReceived: 3, sweeps: 0 };
    expect(addGameToLifetime(before, me)).toEqual(before);
    expect(newlyEarnedBadges(me, before, new Set())).toEqual([]);
  });

  it("with 2+ people a bot just fills a seat and the game pays out normally", () => {
    const started = apply(addBots(withHumans(2), 1), { type: "start_game", actor: vip() });
    const final = playToFinal(started);
    const summary = summarizeGame(final);
    expect(summary.map((e) => e.playerId).sort()).toEqual(["p0", "p1"]);
    expect(summary.every((e) => !e.practice && e.playersInGame === 2)).toBe(true);
    const reward = computeGameReward(summary[0] as (typeof summary)[number]);
    expect(reward.coins).toBeGreaterThan(0); // a real game pays coins again
  });

  it("does not count a bot's vote towards your stats in a single battle", () => {
    // Two people and one bot: in a pair battle the third seat is the only voter.
    let state = apply(addBots(withHumans(2), 1), { type: "start_game", actor: vip() });
    state = runBots(humanAnswers(state), new Set());
    expect(state.phase.kind).toBe("voting");
    const battleWithBotVoter = state.phase.kind === "voting" ? state.matchups[state.phase.matchupIndex] : undefined;
    if (!battleWithBotVoter) throw new Error("no battle");
    const botVoter = !battleWithBotVoter.authorIds.some((id) => id.startsWith("bot-"));
    state = runBots(humanVotes(state), new Set());
    state = timeout(state); // reveal
    expect(state.phase.kind).toBe("reveal");
    const revealed = state.matchups[0] as Matchup;
    const pointsGiven = Object.values(revealed.result?.pointsByAuthor ?? {}).reduce((a, b) => a + b, 0);
    expect(pointsGiven).toBeGreaterThan(0); // the vote still scores on screen
    const statVotes = revealed.authorIds.reduce((sum, id) => sum + (state.stats[id]?.votesReceived ?? 0), 0);
    if (botVoter) expect(statVotes).toBe(0); // ...but a bot's vote earns nobody XP
    else expect(statVotes).toBe(1);
  });
});
