import {
  MAX_BOTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MIN_SWEEP_VOTES,
  REVEAL_MS,
  ROUNDS,
  SCOREBOARD_MS,
  VOTE_LOCK_IN_MS,
  VOTE_MS,
  type RoundConfig,
} from "../../constants.js";
import { BOT_ID_PREFIX, BOT_PERSONAS, type BotPersona } from "../../content/bot-personas.js";
import { DEFAULT_CARD_THEME_ID, DEFAULT_NAME_COLOR_ID } from "../../progression/catalog.js";
import type { Rng } from "../../rng.js";
import { cleanAnswer, cleanName } from "../../text.js";
import type {
  Actor,
  HomeRegionCode,
  Matchup,
  Phase,
  PlayerCosmetics,
  PlayerGameStats,
  PlayerId,
  Prompt,
  RoomSettings,
  RoomState,
} from "../../types.js";
import { EMPTY_GAME_STATS } from "../../progression/rewards.js";
import { buildMatchups, pickPrompts, promptsNeeded } from "./assign-prompts.js";
import { isNonEmpty, scoreMatchup } from "./scoring.js";

export interface ReduceContext {
  now: number;
  rng: Rng;
  prompts: readonly Prompt[];
}

export type GameErrorCode =
  | "not_allowed"
  | "wrong_phase"
  | "not_enough_players"
  | "room_full"
  | "name_taken"
  | "invalid_name"
  | "game_in_progress"
  | "not_enough_prompts"
  | "unknown_player"
  | "invalid_answer"
  | "already_answered"
  | "invalid_vote"
  | "too_many_bots"
  | "needs_human";

export type ReduceResult = { ok: true; state: RoomState } | { ok: false; error: GameErrorCode };

export type RoomEvent =
  | {
      type: "player_joined";
      playerId: PlayerId;
      name: string;
      homeRegion: HomeRegionCode;
      cosmetics: PlayerCosmetics;
      ownedPacks: readonly string[];
    }
  | { type: "player_connection"; playerId: PlayerId; connected: boolean }
  | { type: "player_cosmetics"; playerId: PlayerId; cosmetics: PlayerCosmetics }
  /** VIP/host fills an empty seat with a computer player (lobby only). Remove one with player_kicked. */
  | { type: "bot_added"; actor: Actor }
  | { type: "player_kicked"; actor: Actor; playerId: PlayerId }
  /** A player chose to leave. Same cleanup as a kick, but anyone may leave themselves. */
  | { type: "player_left"; playerId: PlayerId }
  | {
      type: "update_settings";
      actor: Actor;
      regions?: readonly HomeRegionCode[];
      familyMode?: boolean;
      packs?: readonly string[];
    }
  | { type: "start_game"; actor: Actor }
  | { type: "submit_answer"; playerId: PlayerId; promptId: string; text: string }
  | { type: "cast_vote"; playerId: PlayerId; matchupIndex: number; option: number }
  | { type: "advance"; actor: Actor }
  | { type: "timeout"; phaseSeq: number }
  | { type: "play_again"; actor: Actor };

export function createRoom(code: string, settings: RoomSettings): RoomState {
  return {
    code,
    settings,
    players: [],
    vipId: null,
    phase: { kind: "lobby" },
    round: 0,
    phaseSeq: 0,
    matchups: [],
    usedPromptIds: [],
    stats: {},
    gameNumber: 0,
  };
}

/** Deck packs someone in the room owns (and can therefore switch on). */
export function availablePacks(state: RoomState): string[] {
  return [...new Set(state.players.flatMap((p) => p.ownedPacks))].sort();
}

export function currentRound(state: RoomState): RoundConfig {
  const round = ROUNDS[state.round];
  if (!round) throw new Error(`Invalid round index ${state.round}`);
  return round;
}

export function canControl(state: RoomState, actor: Actor): boolean {
  return actor.kind === "host" || actor.id === state.vipId;
}

const ok = (state: RoomState): ReduceResult => ({ ok: true, state });
const fail = (error: GameErrorCode): ReduceResult => ({ ok: false, error });

export function reduceRoom(state: RoomState, event: RoomEvent, ctx: ReduceContext): ReduceResult {
  switch (event.type) {
    case "player_joined":
      return onPlayerJoined(state, event);
    case "bot_added":
      return onBotAdded(state, event.actor, ctx.rng);
    case "player_connection":
      return onConnection(state, event.playerId, event.connected, ctx);
    case "player_cosmetics":
      if (!state.players.some((p) => p.id === event.playerId)) return fail("unknown_player");
      return ok({
        ...state,
        players: state.players.map((p) => (p.id === event.playerId ? { ...p, cosmetics: event.cosmetics } : p)),
      });
    case "player_kicked":
      if (!canControl(state, event.actor)) return fail("not_allowed");
      return removePlayer(state, event.playerId, ctx);
    case "player_left":
      return removePlayer(state, event.playerId, ctx);
    case "update_settings":
      return onUpdateSettings(state, event);
    case "start_game":
      return onStart(state, event.actor, ctx);
    case "submit_answer":
      return onAnswer(state, event, ctx);
    case "cast_vote":
      return onVote(state, event, ctx);
    case "advance":
      if (!canControl(state, event.actor)) return fail("not_allowed");
      return step(state, ctx);
    case "timeout":
      // Stale timer from an earlier phase: ignore silently.
      if (event.phaseSeq !== state.phaseSeq) return ok(state);
      return step(state, ctx);
    case "play_again":
      return onPlayAgain(state, event.actor);
  }
}

// ── Lobby ──────────────────────────────────────────────────────────────────────

function onPlayerJoined(
  state: RoomState,
  event: Extract<RoomEvent, { type: "player_joined" }>,
): ReduceResult {
  if (state.phase.kind !== "lobby") return fail("game_in_progress");
  if (state.players.length >= MAX_PLAYERS) return fail("room_full");
  if (state.players.some((p) => p.id === event.playerId)) return fail("not_allowed");
  const name = cleanName(event.name);
  if (name.length === 0) return fail("invalid_name");
  const lower = name.toLocaleLowerCase();
  if (state.players.some((p) => p.name.toLocaleLowerCase() === lower)) return fail("name_taken");

  return ok({
    ...state,
    players: [
      ...state.players,
      {
        id: event.playerId,
        name,
        homeRegion: event.homeRegion,
        connected: true,
        score: 0,
        joinedAt: state.players.length,
        cosmetics: event.cosmetics,
        ownedPacks: [...new Set(event.ownedPacks)],
        isBot: false,
      },
    ],
    vipId: state.vipId ?? event.playerId,
  });
}

export function botCount(state: RoomState): number {
  return state.players.filter((p) => p.isBot).length;
}

/** A persona whose name and id are free in this room, preferring countries in play. */
export function pickBotPersona(state: RoomState, rng: Rng): BotPersona | null {
  const names = new Set(state.players.map((p) => p.name.toLocaleLowerCase()));
  const ids = new Set(state.players.map((p) => p.id));
  const free = BOT_PERSONAS.filter(
    (b) => !names.has(b.name.toLocaleLowerCase()) && !ids.has(`${BOT_ID_PREFIX}${b.key}`),
  );
  const local = free.filter((b) => state.settings.regions.includes(b.homeRegion));
  const pool = local.length > 0 ? local : free;
  return pool[Math.floor(rng() * pool.length)] ?? null;
}

function onBotAdded(state: RoomState, actor: Actor, rng: Rng): ReduceResult {
  if (!canControl(state, actor)) return fail("not_allowed");
  if (state.phase.kind !== "lobby") return fail("game_in_progress");
  if (state.players.length >= MAX_PLAYERS) return fail("room_full");
  if (botCount(state) >= MAX_BOTS) return fail("too_many_bots");
  const persona = pickBotPersona(state, rng);
  if (!persona) return fail("too_many_bots");
  return ok({
    ...state,
    players: [
      ...state.players,
      {
        id: `${BOT_ID_PREFIX}${persona.key}`,
        name: persona.name,
        homeRegion: persona.homeRegion,
        connected: true,
        score: 0,
        joinedAt: state.players.length,
        cosmetics: {
          avatarId: persona.avatarId,
          cardThemeId: DEFAULT_CARD_THEME_ID,
          nameColorId: DEFAULT_NAME_COLOR_ID,
          level: 1,
        },
        ownedPacks: [],
        isBot: true,
      },
    ],
  });
}

function onUpdateSettings(
  state: RoomState,
  event: Extract<RoomEvent, { type: "update_settings" }>,
): ReduceResult {
  if (!canControl(state, event.actor)) return fail("not_allowed");
  if (state.phase.kind !== "lobby") return fail("wrong_phase");
  const regions = event.regions ?? state.settings.regions;
  if (regions.length === 0) return fail("not_allowed");
  const packs = event.packs ?? state.settings.packs;
  const available = new Set(availablePacks(state));
  if (packs.some((p) => !available.has(p))) return fail("not_allowed");
  return ok({
    ...state,
    settings: {
      ...state.settings,
      regions: [...new Set(regions)],
      familyMode: event.familyMode ?? state.settings.familyMode,
      packs: [...new Set(packs)],
    },
  });
}

function onStart(state: RoomState, actor: Actor, ctx: ReduceContext): ReduceResult {
  if (!canControl(state, actor)) return fail("not_allowed");
  if (state.phase.kind !== "lobby") return fail("wrong_phase");
  const connected = state.players.filter((p) => p.connected);
  if (connected.length < MIN_PLAYERS) return fail("not_enough_players");
  // Bots fill seats; they can't be the whole party.
  if (!connected.some((p) => !p.isBot)) return fail("needs_human");
  const firstRound = ROUNDS[0] as RoundConfig;
  const probe = pickPrompts(
    ctx.prompts,
    state.settings,
    [],
    promptsNeeded(firstRound, connected.length),
    ctx.rng,
  );
  if (!probe) return fail("not_enough_prompts");

  const stats: Record<PlayerId, PlayerGameStats> = {};
  for (const p of state.players) stats[p.id] = { ...EMPTY_GAME_STATS };
  const reset: RoomState = {
    ...state,
    players: state.players.map((p) => ({ ...p, score: 0 })),
    round: 0,
    matchups: [],
    stats,
    gameNumber: state.gameNumber + 1,
  };
  return startRound(reset, ctx);
}

function onPlayAgain(state: RoomState, actor: Actor): ReduceResult {
  if (!canControl(state, actor)) return fail("not_allowed");
  if (state.phase.kind !== "final") return fail("wrong_phase");
  return ok({
    ...state,
    players: state.players.map((p) => ({ ...p, score: 0 })),
    phase: { kind: "lobby" },
    round: 0,
    phaseSeq: state.phaseSeq + 1,
    matchups: [],
    stats: {},
  });
}

// ── Connections & moderation ───────────────────────────────────────────────────

function onConnection(
  state: RoomState,
  playerId: PlayerId,
  connected: boolean,
  ctx: ReduceContext,
): ReduceResult {
  const target = state.players.find((p) => p.id === playerId);
  if (!target) return fail("unknown_player");
  if (target.isBot) return fail("not_allowed"); // bots are always "connected"
  let next: RoomState = {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, connected } : p)),
  };
  next = ensureVip(next);
  // A disconnect may have removed the last player we were waiting on.
  return ok(connected ? next : maybeAutoAdvance(next, ctx));
}

/**
 * Removes a player (kicked or left). Their unrevealed answers are hidden so the
 * opponent's battle becomes unopposed rather than lost to a ghost, their pending
 * votes are voided, VIP passes on, and packs only they owned switch off.
 */
function removePlayer(state: RoomState, playerId: PlayerId, ctx: ReduceContext): ReduceResult {
  if (!state.players.some((p) => p.id === playerId)) return fail("unknown_player");

  const matchups = state.matchups.map((m) => {
    if (m.result) return m;
    const votes = { ...m.votes };
    delete votes[playerId];
    const answers = { ...m.answers };
    if (playerId in answers) answers[playerId] = null;
    return { ...m, answers, votes };
  });

  let next: RoomState = {
    ...state,
    players: state.players.filter((p) => p.id !== playerId),
    vipId: state.vipId === playerId ? null : state.vipId,
    matchups,
  };
  // Packs only stay on while someone who owns them is still in the room.
  const stillAvailable = new Set(availablePacks(next));
  next = { ...next, settings: { ...next.settings, packs: next.settings.packs.filter((p) => stillAvailable.has(p)) } };
  next = ensureVip(next);
  // The last person left mid-game: nobody to play for, so finish instead of letting bots play alone.
  const inGame = next.phase.kind !== "lobby" && next.phase.kind !== "final";
  if (inGame && !next.players.some((p) => !p.isBot)) return ok(withPhase(next, { kind: "final" }));
  return ok(maybeAutoAdvance(next, ctx));
}

/** VIP passes to the earliest-joined connected person (never a bot) if the current VIP is gone. */
function ensureVip(state: RoomState): RoomState {
  const current = state.players.find((p) => p.id === state.vipId);
  if (current?.connected) return state;
  const candidate = state.players.find((p) => p.connected && !p.isBot);
  if (!candidate) return current ? state : { ...state, vipId: null };
  return { ...state, vipId: candidate.id };
}

// ── Answering ──────────────────────────────────────────────────────────────────

function onAnswer(
  state: RoomState,
  event: Extract<RoomEvent, { type: "submit_answer" }>,
  ctx: ReduceContext,
): ReduceResult {
  if (state.phase.kind !== "answering") return fail("wrong_phase");
  const index = state.matchups.findIndex(
    (m) => m.promptId === event.promptId && m.authorIds.includes(event.playerId),
  );
  const matchup = state.matchups[index];
  if (!matchup) return fail("invalid_answer");
  const text = cleanAnswer(event.text, state.settings.familyMode);
  const existing = matchup.answers[event.playerId];
  if (isNonEmpty(existing)) {
    // A retried send of the same answer (flaky mobile data) is a harmless no-op.
    return existing === text ? ok(state) : fail("already_answered");
  }
  if (text.length === 0) return fail("invalid_answer");

  const updated: Matchup = { ...matchup, answers: { ...matchup.answers, [event.playerId]: text } };
  const next = bumpStats(replaceMatchup(state, index, updated), event.playerId, { answersGiven: 1 });
  return ok(maybeAutoAdvance(next, ctx));
}

function everyoneAnswered(state: RoomState): boolean {
  const connected = new Set(state.players.filter((p) => p.connected).map((p) => p.id));
  return state.matchups.every((m) =>
    m.authorIds.every((id) => !connected.has(id) || isNonEmpty(m.answers[id])),
  );
}

// ── Voting ─────────────────────────────────────────────────────────────────────

export function isEligibleVoter(state: RoomState, matchup: Matchup, playerId: PlayerId): boolean {
  if (!state.players.some((p) => p.id === playerId)) return false;
  if (matchup.kind === "pair") return !matchup.authorIds.includes(playerId);
  // Last Lash: everyone votes, as long as there is someone else's answer to pick.
  return matchup.authorIds.some((id) => id !== playerId && isNonEmpty(matchup.answers[id]));
}

export function isVotableOption(matchup: Matchup, voterId: PlayerId, option: number): boolean {
  const authorId = matchup.authorIds[option];
  return authorId !== undefined && authorId !== voterId && isNonEmpty(matchup.answers[authorId]);
}

function onVote(
  state: RoomState,
  event: Extract<RoomEvent, { type: "cast_vote" }>,
  ctx: ReduceContext,
): ReduceResult {
  const phase = state.phase;
  if (phase.kind !== "voting") return fail("wrong_phase");
  if (phase.matchupIndex !== event.matchupIndex) return fail("wrong_phase");
  const matchup = state.matchups[phase.matchupIndex];
  if (!matchup) return fail("wrong_phase");
  if (!isEligibleVoter(state, matchup, event.playerId)) return fail("not_allowed");
  if (!Number.isInteger(event.option) || !isVotableOption(matchup, event.playerId, event.option)) {
    return fail("invalid_vote");
  }
  // Changing your mind is allowed until voting closes; re-tapping the same answer is a no-op.
  if (matchup.votes[event.playerId] === event.option) return ok(state);

  const updated: Matchup = { ...matchup, votes: { ...matchup.votes, [event.playerId]: event.option } };
  const next = replaceMatchup(state, phase.matchupIndex, updated);
  return ok(maybeAutoAdvance(next, ctx));
}

function everyoneVoted(state: RoomState, matchup: Matchup): boolean {
  return state.players
    .filter((p) => p.connected && isEligibleVoter(state, matchup, p.id))
    .every((p) => p.id in matchup.votes);
}

// ── Phase machine ──────────────────────────────────────────────────────────────

/** Moves to the next phase (used by timeouts and the host's skip button). */
function step(state: RoomState, ctx: ReduceContext): ReduceResult {
  const phase = state.phase;
  switch (phase.kind) {
    case "lobby":
    case "final":
      return fail("wrong_phase");
    case "answering":
      return ok(beginVotingFrom(state, 0, ctx));
    case "voting":
      return ok(reveal(state, phase.matchupIndex, ctx));
    case "reveal":
      return ok(beginVotingFrom(state, phase.matchupIndex + 1, ctx));
    case "scoreboard":
      return ok(nextRound(state, ctx));
  }
}

/** Advances automatically once nobody connected is left to act. */
function maybeAutoAdvance(state: RoomState, ctx: ReduceContext): RoomState {
  const phase = state.phase;
  if (phase.kind === "answering" && everyoneAnswered(state)) {
    return beginVotingFrom(state, 0, ctx);
  }
  if (phase.kind === "voting") {
    const matchup = state.matchups[phase.matchupIndex];
    if (matchup && everyoneVoted(state, matchup)) {
      // Don't reveal instantly: give a short lock-in window for last-second changes.
      // Same phase (same phaseSeq), just an earlier deadline; never pushed later.
      const lockIn = ctx.now + VOTE_LOCK_IN_MS;
      if (lockIn < phase.deadline) return { ...state, phase: { ...phase, deadline: lockIn } };
    }
  }
  return state;
}

function withPhase(state: RoomState, phase: Phase): RoomState {
  return { ...state, phase, phaseSeq: state.phaseSeq + 1 };
}

function startRound(state: RoomState, ctx: ReduceContext): ReduceResult {
  const round = currentRound(state);
  const participants = state.players.filter((p) => p.connected).map((p) => p.id);
  if (participants.length < MIN_PLAYERS) {
    return ok(withPhase({ ...state, matchups: [] }, { kind: "final" }));
  }
  const prompts = pickPrompts(
    ctx.prompts,
    state.settings,
    state.usedPromptIds,
    promptsNeeded(round, participants.length),
    ctx.rng,
  );
  if (!prompts) return fail("not_enough_prompts");

  const matchups = buildMatchups(round, participants, prompts, ctx.rng);
  return ok(
    withPhase(
      {
        ...state,
        matchups,
        usedPromptIds: [...new Set([...state.usedPromptIds, ...prompts.map((p) => p.id)])],
      },
      { kind: "answering", deadline: ctx.now + round.answerMs },
    ),
  );
}

function beginVotingFrom(state: RoomState, fromIndex: number, ctx: ReduceContext): RoomState {
  const matchup = state.matchups[fromIndex];
  if (!matchup) {
    return withPhase(state, { kind: "scoreboard", deadline: ctx.now + SCOREBOARD_MS });
  }
  const answered = matchup.authorIds.filter((id) => isNonEmpty(matchup.answers[id])).length;
  const hasVoters = state.players.some((p) => p.connected && isEligibleVoter(state, matchup, p.id));
  if (answered < 2 || !hasVoters) {
    // Nothing to vote on: go straight to the reveal.
    return reveal(state, fromIndex, ctx);
  }
  return withPhase(state, { kind: "voting", matchupIndex: fromIndex, deadline: ctx.now + VOTE_MS });
}

function reveal(state: RoomState, index: number, ctx: ReduceContext): RoomState {
  const matchup = state.matchups[index];
  if (!matchup) return beginVotingFrom(state, index + 1, ctx);
  const result = scoreMatchup(matchup, currentRound(state).multiplier);
  const players = state.players.map((p) => ({
    ...p,
    score: p.score + (result.pointsByAuthor[p.id] ?? 0),
  }));
  let next = replaceMatchup({ ...state, players }, index, { ...matchup, result });
  // Bot votes score points on screen, but rewards (XP, badges) only count votes from people,
  // so nobody can farm "Crowd Favourite" or sweeps by filling a room with bots.
  const humanVotes = humanVotesByAuthor(state, matchup);
  const topVotes = Math.max(0, ...Object.values(humanVotes));
  for (const authorId of matchup.authorIds) {
    const votes = humanVotes[authorId] ?? 0;
    next = bumpStats(next, authorId, {
      votesReceived: votes,
      sweeps: result.sweepAuthorId === authorId && votes >= MIN_SWEEP_VOTES ? 1 : 0,
      lastLashWins: matchup.kind === "all" && topVotes > 0 && votes === topVotes ? 1 : 0,
      bestMatchupVotes: votes,
    });
  }
  return withPhase(next, { kind: "reveal", matchupIndex: index, deadline: ctx.now + REVEAL_MS });
}

function humanVotesByAuthor(state: RoomState, matchup: Matchup): Record<PlayerId, number> {
  const bots = new Set(state.players.filter((p) => p.isBot).map((p) => p.id));
  const counts: Record<PlayerId, number> = {};
  for (const [voterId, option] of Object.entries(matchup.votes)) {
    if (bots.has(voterId)) continue;
    const authorId = matchup.authorIds[option];
    if (authorId !== undefined) counts[authorId] = (counts[authorId] ?? 0) + 1;
  }
  return counts;
}

function nextRound(state: RoomState, ctx: ReduceContext): RoomState {
  const nextIndex = state.round + 1;
  if (nextIndex >= ROUNDS.length) return withPhase(state, { kind: "final" });
  const result = startRound({ ...state, round: nextIndex }, ctx);
  // Prompt pool exhaustion mid-game should never strand players: end gracefully.
  return result.ok ? result.state : withPhase(state, { kind: "final" });
}

/** Adds to a player's per-game stats; `bestMatchupVotes` is a running max, not a sum. */
function bumpStats(state: RoomState, playerId: PlayerId, delta: Partial<PlayerGameStats>): RoomState {
  const current = state.stats[playerId];
  if (!current) return state; // joined after the game started, or removed
  const updated: PlayerGameStats = {
    votesReceived: current.votesReceived + (delta.votesReceived ?? 0),
    sweeps: current.sweeps + (delta.sweeps ?? 0),
    answersGiven: current.answersGiven + (delta.answersGiven ?? 0),
    lastLashWins: current.lastLashWins + (delta.lastLashWins ?? 0),
    bestMatchupVotes: Math.max(current.bestMatchupVotes, delta.bestMatchupVotes ?? 0),
  };
  return { ...state, stats: { ...state.stats, [playerId]: updated } };
}

function replaceMatchup(state: RoomState, index: number, matchup: Matchup): RoomState {
  const matchups = state.matchups.slice();
  matchups[index] = matchup;
  return { ...state, matchups };
}
