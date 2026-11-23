import { BOT_ANSWERS, type BotAnswer } from "../../content/bot-answers.js";
import type { Rng } from "../../rng.js";
import type { HomeRegionCode, Matchup, PlayerId, RegionCode, RoomState } from "../../types.js";
import { isEligibleVoter, isVotableOption } from "./reducer.js";
import { isNonEmpty } from "./scoring.js";

/**
 * Pure decision-making for bot seats. The server only decides WHEN a bot acts;
 * WHAT it does lives here, so it is deterministic under a seeded RNG and unit-tested.
 * Bots act through the same reducer events as people, so they get no special powers.
 */

/** Bots "think" for a random spell so they don't all answer the instant a round opens. */
export const BOT_ANSWER_DELAY_MS = { min: 4_000, max: 16_000 } as const;
export const BOT_VOTE_DELAY_MS = { min: 2_000, max: 7_000 } as const;

/** Never act in the last moment before a deadline, so a bot can't race the phase change. */
export const BOT_DEADLINE_MARGIN_MS = 750;

export type BotTask = { kind: "answer"; promptId: string } | { kind: "vote"; matchupIndex: number };

/** What this bot still owes the current phase, if anything. One task at a time. */
export function botTask(state: RoomState, botId: PlayerId): BotTask | null {
  const bot = state.players.find((p) => p.id === botId);
  if (!bot?.isBot) return null;
  const phase = state.phase;
  if (phase.kind === "answering") {
    const owed = state.matchups.find((m) => m.authorIds.includes(botId) && !isNonEmpty(m.answers[botId]));
    return owed ? { kind: "answer", promptId: owed.promptId } : null;
  }
  if (phase.kind === "voting") {
    const matchup = state.matchups[phase.matchupIndex];
    if (!matchup || botId in matchup.votes || !isEligibleVoter(state, matchup, botId)) return null;
    return { kind: "vote", matchupIndex: phase.matchupIndex };
  }
  return null;
}

/** A delay in [min, max], used by the server to schedule a bot's next move. */
export function botDelayMs(range: { min: number; max: number }, rng: Rng): number {
  return Math.round(range.min + rng() * (range.max - range.min));
}

export interface PickBotAnswerInput {
  /** The prompt's region tags ("pan" means any audience). */
  promptRegions: readonly RegionCode[];
  /** Countries switched on in the room. */
  roomRegions: readonly HomeRegionCode[];
  /** Answers already used by any bot this game, so bots never repeat themselves. */
  used: ReadonlySet<string>;
  rng: Rng;
  pool?: readonly BotAnswer[];
}

/**
 * Picks a punchline. Answers tagged with a country in play are three times as likely
 * as pan-African ones; answers for countries NOT in play are never used (a Kenyan
 * room shouldn't get Lagos jokes it won't get).
 */
export function pickBotAnswer(input: PickBotAnswerInput): string {
  const pool = input.pool ?? BOT_ANSWERS;
  const local = input.promptRegions.filter((r) => r !== "pan");
  const target = new Set<RegionCode>(local.length > 0 ? local : input.roomRegions);
  const weightOf = (answer: BotAnswer): number => {
    if (answer.regions.some((r) => target.has(r))) return 3;
    return answer.regions.includes("pan") ? 1 : 0;
  };

  const fresh = pool.filter((a) => !input.used.has(a.text));
  const picked =
    weightedPick(fresh, weightOf, input.rng) ??
    // Every relevant line already used this game: fall back to any unused line, then to repeats.
    weightedPick(fresh, () => 1, input.rng) ??
    weightedPick(pool, weightOf, input.rng) ??
    pool[0];
  return picked?.text ?? "No comment 🤐";
}

/**
 * Picks which answer a bot votes for. Bots can't judge jokes, so it's mostly luck,
 * nudged towards answers with some effort in them: a one-word "lol" is less likely
 * to win a bot's vote than a full line. Authorship is never looked at, so bots don't
 * favour people or each other.
 */
export function pickBotVote(matchup: Matchup, botId: PlayerId, rng: Rng): number | null {
  const options = matchup.authorIds
    .map((_, index) => index)
    .filter((index) => isVotableOption(matchup, botId, index));
  const effort = (index: number): number => {
    const author = matchup.authorIds[index];
    const text = author === undefined ? "" : (matchup.answers[author] ?? "");
    const length = Array.from(text.trim()).length;
    return length < 4 ? 1 : length < 10 ? 2 : 3;
  };
  return weightedPick(options, effort, rng) ?? null;
}

function weightedPick<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T | undefined {
  const weights = items.map((item) => Math.max(0, weight(item)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return undefined;
  let roll = rng() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return items[i];
  }
  // Floating-point edge: return the last item with positive weight.
  for (let i = items.length - 1; i >= 0; i -= 1) if ((weights[i] ?? 0) > 0) return items[i];
  return undefined;
}
