import { describe, expect, it } from "vitest";
import {
  buildMatchups,
  cleanAnswer,
  DEFAULT_COSMETICS,
  createRoom,
  isPromptEligible,
  projectRoom,
  reduceRoom,
  ROUNDS,
  scoreMatchup,
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

const SETTINGS: RoomSettings = { mode: "screen", regions: ["ng"], familyMode: true, packs: [] };
const JOIN = { cosmetics: DEFAULT_COSMETICS, ownedPacks: [] as string[] };
const HOST: Actor = { kind: "host" };

function ctx(seed = 1, now = 1_000): ReduceContext {
  return { now, rng: seededRng(seed), prompts: WETIN_YOU_TALK_PROMPTS };
}

function apply(state: RoomState, event: RoomEvent, c: ReduceContext = ctx()): RoomState {
  const result = reduceRoom(state, event, c);
  if (!result.ok) throw new Error(`Expected ok for ${event.type}, got ${result.error}`);
  return result.state;
}

function roomWith(count: number, settings: RoomSettings = SETTINGS): RoomState {
  let state = createRoom("ABCD", settings);
  for (let i = 0; i < count; i += 1) {
    state = apply(state, { type: "player_joined", playerId: `p${i}`, name: `Player ${i}`, homeRegion: "ng", ...JOIN });
  }
  return state;
}

function answerAll(state: RoomState): RoomState {
  let next = state;
  for (const m of state.matchups) {
    for (const id of m.authorIds) {
      if (m.answers[id] !== null) continue;
      next = apply(next, { type: "submit_answer", playerId: id, promptId: m.promptId, text: `${id} says hi` });
    }
  }
  return next;
}

function voteAll(state: RoomState, pick: (m: Matchup, voterId: string) => number): RoomState {
  if (state.phase.kind !== "voting") throw new Error("not voting");
  const index = state.phase.matchupIndex;
  const matchup = state.matchups[index] as Matchup;
  let next = state;
  for (const p of state.players) {
    if (matchup.kind === "pair" && matchup.authorIds.includes(p.id)) continue;
    next = apply(next, { type: "cast_vote", playerId: p.id, matchupIndex: index, option: pick(matchup, p.id) });
  }
  return next;
}

const firstOtherOption = (m: Matchup, voterId: string): number => m.authorIds.findIndex((id) => id !== voterId);

describe("scoreMatchup", () => {
  const base: Matchup = {
    kind: "pair",
    promptId: "x",
    promptText: "x",
    authorIds: ["a", "b"],
    answers: { a: "one", b: "two" },
    votes: {},
    result: null,
  };

  it("awards points per vote and a sweep bonus for taking every vote", () => {
    const result = scoreMatchup({ ...base, votes: { c: 0, d: 0 } }, 2);
    expect(result.pointsByAuthor).toEqual({ a: 2 * 100 * 2 + 250 * 2, b: 0 });
    expect(result.sweepAuthorId).toBe("a");
  });

  it("splits points without a bonus when votes are shared", () => {
    const result = scoreMatchup({ ...base, votes: { c: 0, d: 1 } }, 1);
    expect(result.pointsByAuthor).toEqual({ a: 100, b: 100 });
    expect(result.sweepAuthorId).toBeNull();
  });

  it("gives unopposed points when only one author answered", () => {
    const result = scoreMatchup({ ...base, answers: { a: "one", b: null } }, 3);
    expect(result.pointsByAuthor).toEqual({ a: 300, b: 0 });
  });

  it("needs at least two votes for a sweep, so a lone voter can't hand out the bonus", () => {
    const result = scoreMatchup({ ...base, votes: { c: 0 } }, 1);
    expect(result.pointsByAuthor).toEqual({ a: 100, b: 0 });
    expect(result.sweepAuthorId).toBeNull();
  });

  it("gives nothing when nobody answered or nobody voted", () => {
    expect(scoreMatchup({ ...base, answers: { a: null, b: null } }, 1).pointsByAuthor).toEqual({ a: 0, b: 0 });
    expect(scoreMatchup(base, 1).sweepAuthorId).toBeNull();
  });
});

describe("buildMatchups", () => {
  it.each([3, 4, 5, 8])("gives each of %i players exactly two prompts against two different opponents", (n) => {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const prompts = WETIN_YOU_TALK_PROMPTS.slice(0, n);
    const matchups = buildMatchups(ROUNDS[0]!, ids, prompts, seededRng(n));
    expect(matchups).toHaveLength(n);
    for (const id of ids) {
      const mine = matchups.filter((m) => m.authorIds.includes(id));
      expect(mine).toHaveLength(2);
      const opponents = mine.map((m) => m.authorIds.find((a) => a !== id));
      expect(new Set(opponents).size).toBe(2);
    }
    expect(new Set(matchups.map((m) => m.promptId)).size).toBe(n);
  });
});

describe("lobby", () => {
  it("makes the first joiner VIP and rejects duplicate names case-insensitively", () => {
    const state = roomWith(1);
    expect(state.vipId).toBe("p0");
    const dup = reduceRoom(state, { type: "player_joined", playerId: "x", name: "player 0", homeRegion: "gh", ...JOIN }, ctx());
    expect(dup).toEqual({ ok: false, error: "name_taken" });
  });

  it("caps the room at 8 players", () => {
    const full = roomWith(8);
    const result = reduceRoom(full, { type: "player_joined", playerId: "p9", name: "Late", homeRegion: "ng", ...JOIN }, ctx());
    expect(result).toEqual({ ok: false, error: "room_full" });
  });

  it("only lets the host or VIP start, and needs three connected players", () => {
    expect(reduceRoom(roomWith(2), { type: "start_game", actor: HOST }, ctx())).toEqual({
      ok: false,
      error: "not_enough_players",
    });
    const three = roomWith(3);
    expect(reduceRoom(three, { type: "start_game", actor: { kind: "player", id: "p1" } }, ctx())).toEqual({
      ok: false,
      error: "not_allowed",
    });
    const started = apply(three, { type: "start_game", actor: { kind: "player", id: "p0" } });
    expect(started.phase.kind).toBe("answering");
  });

  it("refuses joins once the game has started", () => {
    const started = apply(roomWith(3), { type: "start_game", actor: HOST });
    const result = reduceRoom(started, { type: "player_joined", playerId: "late", name: "Late", homeRegion: "ng", ...JOIN }, ctx());
    expect(result).toEqual({ ok: false, error: "game_in_progress" });
  });
});

describe("full game", () => {
  it("plays three rounds to a final with consistent scores", () => {
    let state = apply(roomWith(4), { type: "start_game", actor: HOST });
    for (let round = 0; round < ROUNDS.length; round += 1) {
      expect(state.phase.kind).toBe("answering");
      expect(state.round).toBe(round);
      state = answerAll(state);
      while (state.phase.kind === "voting" || state.phase.kind === "reveal") {
        if (state.phase.kind === "voting") {
          state = voteAll(state, firstOtherOption);
          // Everyone has voted: voting stays open for the lock-in window, then the timer reveals.
          state = apply(state, { type: "timeout", phaseSeq: state.phaseSeq });
        } else {
          state = apply(state, { type: "timeout", phaseSeq: state.phaseSeq });
        }
      }
      expect(state.phase.kind).toBe("scoreboard");
      state = apply(state, { type: "timeout", phaseSeq: state.phaseSeq });
    }
    expect(state.phase.kind).toBe("final");

    const awarded = state.matchups.length; // sanity: last lash produced one matchup
    expect(awarded).toBe(1);
    const total = state.players.reduce((sum, p) => sum + p.score, 0);
    expect(total).toBeGreaterThan(0);

    const view = projectRoom(state, HOST);
    expect(view.phase.kind).toBe("final");
    if (view.phase.kind === "final") expect(view.phase.winnerIds.length).toBeGreaterThan(0);

    const again = apply(state, { type: "play_again", actor: HOST });
    expect(again.phase.kind).toBe("lobby");
    expect(again.players.every((p) => p.score === 0)).toBe(true);
  });

  it("does not use the same prompt twice in one session", () => {
    let state = apply(roomWith(5), { type: "start_game", actor: HOST });
    const seen = new Set(state.matchups.map((m) => m.promptId));
    state = apply(state, { type: "advance", actor: HOST }); // skip answering → no answers → straight to reveals
    while (state.phase.kind !== "scoreboard") state = apply(state, { type: "advance", actor: HOST });
    state = apply(state, { type: "advance", actor: HOST });
    for (const m of state.matchups) expect(seen.has(m.promptId)).toBe(false);
  });
});

describe("rules", () => {
  it("prevents pair authors from voting and players from voting for themselves in the Last Lash", () => {
    let state = answerAll(apply(roomWith(3), { type: "start_game", actor: HOST }));
    expect(state.phase.kind).toBe("voting");
    if (state.phase.kind !== "voting") return;
    const m = state.matchups[state.phase.matchupIndex]!;
    const author = m.authorIds[0]!;
    expect(
      reduceRoom(state, { type: "cast_vote", playerId: author, matchupIndex: state.phase.matchupIndex, option: 1 }, ctx()),
    ).toEqual({ ok: false, error: "not_allowed" });

    // Jump to the Last Lash.
    while (state.round < 2) state = apply(state, { type: "advance", actor: HOST });
    state = answerAll(state);
    if (state.phase.kind !== "voting") throw new Error("expected Last Lash voting");
    const lash = state.matchups[0]!;
    const voter = lash.authorIds[0]!;
    expect(
      reduceRoom(state, { type: "cast_vote", playerId: voter, matchupIndex: 0, option: 0 }, ctx()),
    ).toEqual({ ok: false, error: "invalid_vote" });
    state = apply(state, { type: "cast_vote", playerId: voter, matchupIndex: 0, option: 1 });
    // Changing your mind is allowed while voting is open…
    state = apply(state, { type: "cast_vote", playerId: voter, matchupIndex: 0, option: 2 });
    expect(state.matchups[0]!.votes[voter]).toBe(2);
    // …but never to your own answer.
    expect(
      reduceRoom(state, { type: "cast_vote", playerId: voter, matchupIndex: 0, option: 0 }, ctx()),
    ).toEqual({ ok: false, error: "invalid_vote" });
  });

  it("locks answers once submitted and rejects blank answers", () => {
    const state = apply(roomWith(3), { type: "start_game", actor: HOST });
    const m = state.matchups[0]!;
    const id = m.authorIds[0]!;
    expect(reduceRoom(state, { type: "submit_answer", playerId: id, promptId: m.promptId, text: "   " }, ctx())).toEqual({
      ok: false,
      error: "invalid_answer",
    });
    const once = apply(state, { type: "submit_answer", playerId: id, promptId: m.promptId, text: "first" });
    expect(reduceRoom(once, { type: "submit_answer", playerId: id, promptId: m.promptId, text: "second" }, ctx())).toEqual({
      ok: false,
      error: "already_answered",
    });
  });

  it("ignores stale timers from earlier phases", () => {
    const state = apply(roomWith(3), { type: "start_game", actor: HOST });
    const stale = apply(state, { type: "timeout", phaseSeq: state.phaseSeq - 1 });
    expect(stale).toBe(state);
  });

  it("auto-advances when the last player we were waiting on disconnects", () => {
    let state = apply(roomWith(4), { type: "start_game", actor: HOST });
    const laggard = "p3";
    for (const m of state.matchups) {
      for (const id of m.authorIds) {
        if (id === laggard) continue;
        state = apply(state, { type: "submit_answer", playerId: id, promptId: m.promptId, text: "ok" });
      }
    }
    expect(state.phase.kind).toBe("answering");
    state = apply(state, { type: "player_connection", playerId: laggard, connected: false });
    expect(state.phase.kind).not.toBe("answering");
  });

  it("kicking hides the player's unrevealed answers and passes VIP on", () => {
    let state = answerAll(apply(roomWith(4), { type: "start_game", actor: HOST }));
    state = apply(state, { type: "player_kicked", actor: HOST, playerId: "p0" });
    expect(state.vipId).toBe("p1");
    expect(state.players.some((p) => p.id === "p0")).toBe(false);
    for (const m of state.matchups) {
      if (!m.result && "p0" in m.answers) expect(m.answers.p0).toBeNull();
    }
  });
});

describe("projection", () => {
  it("never leaks other players' answers during answering, or authors during voting", () => {
    let state = apply(roomWith(4), { type: "start_game", actor: HOST });
    const m = state.matchups[0]!;
    const [a, b] = m.authorIds as [string, string];
    state = apply(state, { type: "submit_answer", playerId: a, promptId: m.promptId, text: "SECRET-ANSWER" });

    const viewForB = JSON.stringify(projectRoom(state, { kind: "player", id: b }));
    const viewForHost = JSON.stringify(projectRoom(state, HOST));
    expect(viewForB).not.toContain("SECRET-ANSWER");
    expect(viewForHost).not.toContain("SECRET-ANSWER");

    state = answerAll({ ...state });
    expect(state.phase.kind).toBe("voting");
    const voting = projectRoom(state, HOST);
    if (voting.phase.kind !== "voting") throw new Error("expected voting");
    for (const option of voting.phase.options) {
      expect(Object.keys(option).sort()).toEqual(["index", "isMine", "text", "votable"]);
    }
  });

  it("shows a player only their own prompts", () => {
    const state = apply(roomWith(4), { type: "start_game", actor: HOST });
    const view = projectRoom(state, { kind: "player", id: "p2" });
    if (view.phase.kind !== "answering") throw new Error("expected answering");
    const mine = state.matchups.filter((m) => m.authorIds.includes("p2")).map((m) => m.promptId);
    expect(view.phase.myPrompts.map((p) => p.promptId).sort()).toEqual(mine.sort());
  });
});

describe("content", () => {
  it("has unique ids and texts, and every prompt has a blank or a question", () => {
    const ids = WETIN_YOU_TALK_PROMPTS.map((p) => p.id);
    const texts = WETIN_YOU_TALK_PROMPTS.map((p) => p.text.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(texts).size).toBe(texts.length);
    for (const p of WETIN_YOU_TALK_PROMPTS) expect(p.text.includes("___") || p.text.endsWith("?")).toBe(true);
    expect(WETIN_YOU_TALK_PROMPTS.length).toBeGreaterThanOrEqual(100);
  });

  it("filters adult prompts in family mode and respects regions", () => {
    const adult = WETIN_YOU_TALK_PROMPTS.find((p) => !p.familySafe)!;
    expect(isPromptEligible(adult, { ...SETTINGS, familyMode: true })).toBe(false);
    const kenyan = WETIN_YOU_TALK_PROMPTS.find((p) => p.regions.includes("ke"))!;
    expect(isPromptEligible(kenyan, { ...SETTINGS, regions: ["ng"] })).toBe(false);
    expect(isPromptEligible(kenyan, { ...SETTINGS, regions: ["ng", "ke"] })).toBe(true);
  });

  it("has enough family-safe prompts for a full 8-player game in every single region", () => {
    for (const region of ["ng", "gh", "ke", "za"] as const) {
      const settings: RoomSettings = { mode: "screen", regions: [region], familyMode: true, packs: [] };
      const eligible = WETIN_YOU_TALK_PROMPTS.filter((p) => isPromptEligible(p, settings));
      expect(eligible.length, region).toBeGreaterThanOrEqual(8 * 2 + 1);
    }
  });
});

describe("text cleaning", () => {
  it("strips control characters, collapses whitespace and masks blocked words in family mode", () => {
    expect(cleanAnswer("  hello​ \n world  ", false)).toBe("hello world");
    expect(cleanAnswer("what the fuck", true)).toBe("what the f***");
    expect(cleanAnswer("what the fuck", false)).toBe("what the fuck");
  });
});

describe("changing votes", () => {
  function votingWith(players: number) {
    let state = answerAll(apply(roomWith(players), { type: "start_game", actor: HOST }));
    if (state.phase.kind !== "voting") throw new Error("expected voting");
    const index = state.phase.matchupIndex;
    const m = state.matchups[index]!;
    const voters = state.players.map((p) => p.id).filter((id) => !m.authorIds.includes(id));
    return { state, index, voters };
  }

  it("counts only the final choice at the reveal", () => {
    let { state, index, voters } = votingWith(4);
    const [v1, v2] = voters as [string, string];
    state = apply(state, { type: "cast_vote", playerId: v1, matchupIndex: index, option: 0 });
    state = apply(state, { type: "cast_vote", playerId: v1, matchupIndex: index, option: 1 });
    state = apply(state, { type: "cast_vote", playerId: v2, matchupIndex: index, option: 1 });
    state = apply(state, { type: "timeout", phaseSeq: state.phaseSeq });
    expect(state.phase.kind).toBe("reveal");
    const m = state.matchups[index]!;
    const secondAuthor = m.authorIds[1]!;
    expect(m.result!.votesByAuthor[secondAuthor]).toBe(2);
    expect(m.result!.votesByAuthor[m.authorIds[0]!]).toBe(0);
  });

  it("opens a short lock-in window when everyone has voted, and changes never extend it", () => {
    let { state, index, voters } = votingWith(4);
    const startDeadline = state.phase.kind === "voting" ? state.phase.deadline : 0;
    const seq = state.phaseSeq;
    for (const v of voters) state = apply(state, { type: "cast_vote", playerId: v, matchupIndex: index, option: 0 }, ctx(1, 2_000));
    expect(state.phase.kind).toBe("voting"); // not revealed instantly
    expect(state.phaseSeq).toBe(seq); // same phase, so the server's timer stays valid
    const lockDeadline = state.phase.kind === "voting" ? state.phase.deadline : 0;
    expect(lockDeadline).toBe(2_000 + 3_000);
    expect(lockDeadline).toBeLessThan(startDeadline);

    // A late change, later in time, must not push the deadline back out.
    state = apply(state, { type: "cast_vote", playerId: voters[0]!, matchupIndex: index, option: 1 }, ctx(1, 4_500));
    expect(state.phase.kind === "voting" && state.phase.deadline).toBe(lockDeadline);

    state = apply(state, { type: "timeout", phaseSeq: state.phaseSeq });
    expect(state.phase.kind).toBe("reveal");
  });

  it("treats re-tapping the same answer as a no-op and rejects votes after the reveal", () => {
    let { state, index, voters } = votingWith(4);
    state = apply(state, { type: "cast_vote", playerId: voters[0]!, matchupIndex: index, option: 0 });
    const same = reduceRoom(state, { type: "cast_vote", playerId: voters[0]!, matchupIndex: index, option: 0 }, ctx());
    expect(same.ok && same.state).toBe(state);
    state = apply(state, { type: "timeout", phaseSeq: state.phaseSeq });
    expect(state.phase.kind).toBe("reveal");
    expect(
      reduceRoom(state, { type: "cast_vote", playerId: voters[0]!, matchupIndex: index, option: 1 }, ctx()),
    ).toEqual({ ok: false, error: "wrong_phase" });
  });

  it("never reveals vote counts while voting is open", () => {
    let { state, index, voters } = votingWith(4);
    state = apply(state, { type: "cast_vote", playerId: voters[0]!, matchupIndex: index, option: 0 });
    const view = projectRoom(state, { kind: "player", id: voters[1]! });
    if (view.phase.kind !== "voting") throw new Error("expected voting");
    const json = JSON.stringify(view.phase);
    expect(json).not.toMatch(/"votes"|votesByAuthor|"result"/);
    expect(view.phase.myVote).toBeNull(); // only your own vote is ever shown to you
  });
});

describe("leaving", () => {
  it("lets any player leave themselves and passes VIP on", () => {
    let state = roomWith(4);
    state = apply(state, { type: "player_left", playerId: "p0" });
    expect(state.players.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(state.vipId).toBe("p1");
    expect(reduceRoom(state, { type: "player_left", playerId: "p0" }, ctx())).toEqual({ ok: false, error: "unknown_player" });
  });

  it("mid-game: hides the leaver's answers, voids their votes, and the game moves on without them", () => {
    let state = apply(roomWith(4), { type: "start_game", actor: HOST });
    // Everyone except p3 answers; then p3 leaves, which should complete the answering phase.
    for (const m of state.matchups)
      for (const id of m.authorIds)
        if (id !== "p3") state = apply(state, { type: "submit_answer", playerId: id, promptId: m.promptId, text: "ok" });
    expect(state.phase.kind).toBe("answering");
    state = apply(state, { type: "player_left", playerId: "p3" });
    expect(state.phase.kind).not.toBe("answering");
    for (const m of state.matchups) if ("p3" in m.answers && !m.result) expect(m.answers.p3).toBeNull();
    expect(summarizeGame({ ...state, phase: { kind: "final" } }).some((e) => e.playerId === "p3")).toBe(false);
  });

  it("treats a re-sent identical answer as a no-op but still rejects a different second answer", () => {
    const state = apply(roomWith(3), { type: "start_game", actor: HOST });
    const m = state.matchups[0]!;
    const id = m.authorIds[0]!;
    const once = apply(state, { type: "submit_answer", playerId: id, promptId: m.promptId, text: "Na wa" });
    const again = reduceRoom(once, { type: "submit_answer", playerId: id, promptId: m.promptId, text: "Na wa" }, ctx());
    expect(again.ok && again.state).toBe(once);
    expect(reduceRoom(once, { type: "submit_answer", playerId: id, promptId: m.promptId, text: "Different" }, ctx())).toEqual({
      ok: false,
      error: "already_answered",
    });
  });
});
