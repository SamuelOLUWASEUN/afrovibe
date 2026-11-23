import type { PlayerGameStats, PlayerId, RoomState } from "../types.js";

export interface GameSummaryEntry {
  playerId: PlayerId;
  score: number;
  /** 1-based; tied players share a rank. */
  rank: number;
  won: boolean;
  stats: PlayerGameStats;
  /** People in the game; bots are not counted. */
  playersInGame: number;
  /** Countries among the people in the game; bots are not counted. */
  countriesInGame: number;
  /**
   * Fewer than 2 people (you plus bots). Practice games earn a little XP only:
   * no coins, no badges, and they don't count towards games played or wins.
   */
  practice: boolean;
}

export interface LifetimeStats {
  gamesPlayed: number;
  wins: number;
  votesReceived: number;
  sweeps: number;
}

export const EMPTY_GAME_STATS: PlayerGameStats = {
  votesReceived: 0,
  sweeps: 0,
  answersGiven: 0,
  lastLashWins: 0,
  bestMatchupVotes: 0,
};

/** Coins from games are capped per rolling 24h to blunt farming with alt accounts. */
export const DAILY_GAME_COIN_CAP = 300;

/** A game needs at least this many people (not bots) to pay out coins, badges and wins. */
export const MIN_HUMANS_FOR_REWARDS = 2;

/**
 * Every person (not bot) who was in the room at the end of a finished game.
 * Players who joined but answered nothing still count (they voted), but earn less.
 * Rank and winning are against everyone, bots included: if a bot tops the table, it won.
 */
export function summarizeGame(state: RoomState): GameSummaryEntry[] {
  const everyone = state.players;
  const humans = everyone.filter((p) => !p.isBot);
  const countries = new Set(humans.map((p) => p.homeRegion)).size;
  const practice = humans.length < MIN_HUMANS_FOR_REWARDS;
  const topScore = Math.max(0, ...everyone.map((p) => p.score));
  return humans.map((p) => ({
    playerId: p.id,
    score: p.score,
    rank: 1 + everyone.filter((o) => o.score > p.score).length,
    won: !practice && topScore > 0 && p.score === topScore,
    stats: state.stats[p.id] ?? EMPTY_GAME_STATS,
    playersInGame: humans.length,
    countriesInGame: countries,
    practice,
  }));
}

export interface GameReward {
  xp: number;
  coins: number;
}

/**
 * XP rewards taking part and being funny; coins are deliberately slower so the
 * shop keeps its value. Values are tuning knobs, expected to change after the beta.
 */
export function computeGameReward(entry: GameSummaryEntry): GameReward {
  const { stats } = entry;
  const xp =
    50 + // finishing a game
    5 * stats.answersGiven +
    10 * stats.votesReceived +
    40 * stats.sweeps +
    (entry.won ? 100 : 0);
  const coins = entry.practice ? 0 : 10 + 5 * stats.sweeps + (entry.won ? 25 : 0);
  return { xp, coins };
}

export function addGameToLifetime(before: LifetimeStats, entry: GameSummaryEntry): LifetimeStats {
  if (entry.practice) return before;
  return {
    gamesPlayed: before.gamesPlayed + 1,
    wins: before.wins + (entry.won ? 1 : 0),
    votesReceived: before.votesReceived + entry.stats.votesReceived,
    sweeps: before.sweeps + entry.stats.sweeps,
  };
}
