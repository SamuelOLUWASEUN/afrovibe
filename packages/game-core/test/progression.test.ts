import { describe, expect, it } from "vitest";
import {
  allowedReactions,
  BADGES,
  CATALOG,
  COIN_PACKS,
  coinsToPence,
  computeGameReward,
  createRoom,
  DECK_PACK_PROMPTS,
  DEFAULT_AVATAR_ID,
  DEFAULT_CARD_THEME_ID,
  DEFAULT_COSMETICS,
  DEFAULT_NAME_COLOR_ID,
  findItem,
  isOwned,
  isPromptEligible,
  levelFromXp,
  MAX_LEVEL,
  newlyEarnedBadges,
  reduceRoom,
  seededRng,
  summarizeGame,
  totalXpForLevel,
  WETIN_YOU_TALK_PROMPTS,
  xpForNextLevel,
  addGameToLifetime,
  type GameSummaryEntry,
  type HomeRegionCode,
  type ReduceContext,
  type RoomEvent,
  type RoomState,
} from "../src/index.js";

const PROMPTS = [...WETIN_YOU_TALK_PROMPTS, ...DECK_PACK_PROMPTS];
const ctx = (): ReduceContext => ({ now: 1_000, rng: seededRng(7), prompts: PROMPTS });

function apply(state: RoomState, event: RoomEvent): RoomState {
  const r = reduceRoom(state, event, ctx());
  if (!r.ok) throw new Error(`${event.type}: ${r.error}`);
  return r.state;
}

function join(state: RoomState, id: string, region: HomeRegionCode, ownedPacks: string[] = []): RoomState {
  return apply(state, {
    type: "player_joined",
    playerId: id,
    name: id,
    homeRegion: region,
    cosmetics: DEFAULT_COSMETICS,
    ownedPacks,
  });
}

describe("levels", () => {
  it("uses a rising curve and round-trips totals", () => {
    expect(xpForNextLevel(1)).toBe(100);
    expect(xpForNextLevel(2)).toBe(150);
    expect(levelFromXp(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNext: 100 });
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100)).toEqual({ level: 2, xpIntoLevel: 0, xpForNext: 150 });
    for (const level of [2, 5, 17, 30]) expect(levelFromXp(totalXpForLevel(level)).level).toBe(level);
  });

  it("caps at the max level", () => {
    const info = levelFromXp(10_000_000);
    expect(info.level).toBe(MAX_LEVEL);
    expect(info.xpForNext).toBeNull();
  });
});

describe("catalog", () => {
  it("has unique ids, free defaults, and sane prices", () => {
    const ids = CATALOG.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [DEFAULT_AVATAR_ID, DEFAULT_CARD_THEME_ID, DEFAULT_NAME_COLOR_ID]) {
      const item = findItem(id)!;
      expect(item.priceCoins).toBe(0);
      expect(item.minLevel).toBe(1);
    }
    for (const item of CATALOG) {
      expect(Number.isInteger(item.priceCoins) && item.priceCoins >= 0).toBe(true);
      expect(item.minLevel).toBeGreaterThanOrEqual(1);
    }
  });

  it("gives bigger coin packs a better rate", () => {
    const rates = COIN_PACKS.map((p) => p.pricePence / p.coins);
    for (let i = 1; i < rates.length; i += 1) expect(rates[i]!).toBeLessThan(rates[i - 1]!);
    expect(coinsToPence(500)).toBe(99);
  });

  it("unlocks free items by level and paid ones only via inventory", () => {
    const crown = findItem("avatar_crown")!;
    expect(isOwned(crown, 9, new Set())).toBe(false);
    expect(isOwned(crown, 10, new Set())).toBe(true);
    const paid = findItem("avatar_zebra")!;
    expect(isOwned(paid, 50, new Set())).toBe(false);
    expect(isOwned(paid, 1, new Set(["avatar_zebra"]))).toBe(true);
  });

  it("only allows reaction emojis from owned packs", () => {
    expect(allowedReactions(1, new Set())).toEqual(["😂", "👏", "🔥", "😮"]);
    expect(allowedReactions(1, new Set(["reactions_wahala"]))).toContain("💀");
  });

  it("has a deck item for every deck pack used by prompts", () => {
    const packIds = new Set(DECK_PACK_PROMPTS.map((p) => p.pack));
    for (const id of packIds) expect(findItem(id!)?.kind).toBe("deck");
  });
});

describe("deck packs in rooms", () => {
  it("excludes pack prompts unless the pack is enabled", () => {
    const owambe = DECK_PACK_PROMPTS.find((p) => p.pack === "deck_owambe")!;
    const base = { mode: "screen" as const, regions: ["ng"] as const, familyMode: true };
    expect(isPromptEligible(owambe, { ...base, packs: [] })).toBe(false);
    expect(isPromptEligible(owambe, { ...base, packs: ["deck_owambe"] })).toBe(true);
  });

  it("lets the VIP enable only packs that someone in the room owns, and drops them when the owner is removed", () => {
    let state = createRoom("ABCD", { mode: "screen", regions: ["ng"], familyMode: true, packs: [] });
    state = join(state, "a", "ng");
    state = join(state, "b", "gh", ["deck_japa"]);
    const host = { kind: "host" } as const;
    expect(reduceRoom(state, { type: "update_settings", actor: host, packs: ["deck_owambe"] }, ctx())).toEqual({
      ok: false,
      error: "not_allowed",
    });
    state = apply(state, { type: "update_settings", actor: host, packs: ["deck_japa"] });
    expect(state.settings.packs).toEqual(["deck_japa"]);
    state = apply(state, { type: "player_kicked", actor: host, playerId: "b" });
    expect(state.settings.packs).toEqual([]);
  });
});

describe("game summary and rewards", () => {
  function playFullGame(regions: HomeRegionCode[]): RoomState {
    let state = createRoom("ABCD", { mode: "screen", regions: ["ng"], familyMode: true, packs: [] });
    regions.forEach((r, i) => {
      state = join(state, `p${i}`, r);
    });
    state = apply(state, { type: "start_game", actor: { kind: "host" } });
    let guard = 0;
    while (state.phase.kind !== "final" && guard++ < 200) {
      if (state.phase.kind === "answering") {
        for (const m of state.matchups)
          for (const id of m.authorIds)
            if (m.answers[id] === null)
              state = apply(state, { type: "submit_answer", playerId: id, promptId: m.promptId, text: `${id}!` });
        continue;
      }
      if (state.phase.kind === "voting") {
        const idx = state.phase.matchupIndex;
        const m = state.matchups[idx]!;
        for (const p of state.players) {
          if (m.kind === "pair" && m.authorIds.includes(p.id)) continue;
          // Everyone votes for the first author they're allowed to: produces sweeps.
          const option = m.authorIds.findIndex((a) => a !== p.id);
          state = apply(state, { type: "cast_vote", playerId: p.id, matchupIndex: idx, option });
        }
        // Lock-in window: the server's timer closes voting.
        if (state.phase.kind === "voting") state = apply(state, { type: "timeout", phaseSeq: state.phaseSeq });
        continue;
      }
      state = apply(state, { type: "timeout", phaseSeq: state.phaseSeq });
    }
    return state;
  }

  it("tracks per-game stats that agree with final scores", () => {
    const state = playFullGame(["ng", "gh", "ke", "ng"]);
    expect(state.phase.kind).toBe("final");
    expect(state.gameNumber).toBe(1);
    const summary = summarizeGame(state);
    expect(summary).toHaveLength(4);
    const totalVotes = summary.reduce((s, e) => s + e.stats.votesReceived, 0);
    expect(totalVotes).toBeGreaterThan(0);
    for (const e of summary) {
      expect(e.stats.answersGiven).toBe(5); // 2 + 2 pair prompts + 1 Last Lash
      expect(e.countriesInGame).toBe(3);
    }
    const winners = summary.filter((e) => e.won);
    expect(winners.length).toBeGreaterThan(0);
    expect(winners.every((w) => w.rank === 1)).toBe(true);
    expect(summary.reduce((s, e) => s + e.stats.lastLashWins, 0)).toBeGreaterThan(0);
  });

  it("rewards winners and sweeps more, and awards badges once", () => {
    const base: GameSummaryEntry = {
      playerId: "x",
      score: 0,
      rank: 2,
      won: false,
      stats: { votesReceived: 0, sweeps: 0, answersGiven: 5, lastLashWins: 0, bestMatchupVotes: 0 },
      playersInGame: 8,
      countriesInGame: 3,
      practice: false,
    };
    const winner: GameSummaryEntry = {
      ...base,
      won: true,
      rank: 1,
      stats: { ...base.stats, votesReceived: 9, sweeps: 2, lastLashWins: 1 },
    };
    expect(computeGameReward(winner).xp).toBeGreaterThan(computeGameReward(base).xp);
    expect(computeGameReward(winner).coins).toBeGreaterThan(computeGameReward(base).coins);

    const lifetime = addGameToLifetime({ gamesPlayed: 0, wins: 0, votesReceived: 0, sweeps: 0 }, winner);
    const earned = newlyEarnedBadges(winner, lifetime, new Set()).map((b) => b.id);
    expect(earned).toEqual(
      expect.arrayContaining(["first_game", "first_win", "gbas_gbos", "crowd_favourite", "last_lash_king", "pan_african", "jollof_diplomat", "full_house"]),
    );
    expect(newlyEarnedBadges(winner, lifetime, new Set(earned))).toEqual([]);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });
});
