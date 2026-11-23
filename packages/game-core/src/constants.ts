import type { MatchupKind } from "./types.js";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
/**
 * Bots fill seats when you're short of friends. Capped so a room stays mostly about
 * people: with more bots you'd mostly be watching bot-vs-bot battles.
 */
export const MAX_BOTS = 4;
export const MAX_NAME_LENGTH = 14;
export const MAX_ANSWER_LENGTH = 80;
export const ROOM_CODE_LENGTH = 4;
/** No I/O/0/1 lookalikes so codes read cleanly off a TV. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export const POINTS_PER_VOTE = 100;
export const SWEEP_BONUS = 250;
/** A "Gbas Gbos!" sweep needs this many votes, so one lone voter (3-player games) can't hand out the bonus. */
export const MIN_SWEEP_VOTES = 2;
export const UNOPPOSED_POINTS = 100;

export interface RoundConfig {
  kind: MatchupKind;
  multiplier: number;
  answerMs: number;
  title: string;
}

export const ROUNDS: readonly RoundConfig[] = [
  { kind: "pair", multiplier: 1, answerMs: 75_000, title: "Round 1" },
  { kind: "pair", multiplier: 2, answerMs: 75_000, title: "Round 2 · Double points" },
  { kind: "all", multiplier: 3, answerMs: 60_000, title: "Last Lash · Everybody answers" },
];

export const VOTE_MS = 20_000;
/**
 * Once everyone has voted, voting stays open this long so the last voter can still
 * change their mind. Vote changes never extend it, so nobody can stall the room.
 */
export const VOTE_LOCK_IN_MS = 3_000;
export const REVEAL_MS = 8_000;
export const SCOREBOARD_MS = 8_000;
