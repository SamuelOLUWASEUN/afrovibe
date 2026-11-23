import type { RoundConfig } from "../../constants.js";
import { isPromptEligible } from "../../regions.js";
import { shuffle, type Rng } from "../../rng.js";
import type { Matchup, PlayerId, Prompt, RoomSettings } from "../../types.js";

/** Number of prompts a round consumes for `playerCount` players. */
export function promptsNeeded(round: RoundConfig, playerCount: number): number {
  return round.kind === "pair" ? playerCount : 1;
}

/**
 * Picks prompts for a round, preferring ones not yet used this session.
 * Falls back to reusing prompts rather than stalling a live party.
 * Returns null only if the eligible pool itself is too small.
 */
export function pickPrompts(
  pool: readonly Prompt[],
  settings: RoomSettings,
  usedIds: readonly string[],
  count: number,
  rng: Rng,
): Prompt[] | null {
  const eligible = pool.filter((p) => isPromptEligible(p, settings));
  if (eligible.length < count) return null;
  const used = new Set(usedIds);
  const fresh = shuffle(
    eligible.filter((p) => !used.has(p.id)),
    rng,
  );
  if (fresh.length >= count) return fresh.slice(0, count);
  const recycled = shuffle(
    eligible.filter((p) => used.has(p.id)),
    rng,
  );
  return [...fresh, ...recycled].slice(0, count);
}

/**
 * Pair rounds: with players shuffled into a ring, prompt k goes to players k and k+1.
 * Every player answers exactly two prompts and faces two different opponents,
 * and every matchup has (n - 2) neutral voters. Requires n >= 3.
 */
export function buildMatchups(
  round: RoundConfig,
  playerIds: readonly PlayerId[],
  prompts: readonly Prompt[],
  rng: Rng,
): Matchup[] {
  if (round.kind === "all") {
    const prompt = prompts[0];
    if (!prompt) throw new Error("buildMatchups: no prompt for final round");
    return [makeMatchup("all", prompt, shuffle(playerIds, rng))];
  }

  const ring = shuffle(playerIds, rng);
  const n = ring.length;
  if (n < 3) throw new Error("buildMatchups: pair rounds need at least 3 players");
  if (prompts.length < n) throw new Error("buildMatchups: not enough prompts");

  const matchups: Matchup[] = [];
  for (let k = 0; k < n; k += 1) {
    const a = ring[k] as PlayerId;
    const b = ring[(k + 1) % n] as PlayerId;
    const prompt = prompts[k] as Prompt;
    matchups.push(makeMatchup("pair", prompt, shuffle([a, b], rng)));
  }
  return shuffle(matchups, rng);
}

function makeMatchup(kind: Matchup["kind"], prompt: Prompt, authorIds: PlayerId[]): Matchup {
  const answers: Record<PlayerId, string | null> = {};
  for (const id of authorIds) answers[id] = null;
  return {
    kind,
    promptId: prompt.id,
    promptText: prompt.text,
    authorIds,
    answers,
    votes: {},
    result: null,
  };
}
