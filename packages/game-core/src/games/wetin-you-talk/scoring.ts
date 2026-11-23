import { MIN_SWEEP_VOTES, POINTS_PER_VOTE, SWEEP_BONUS, UNOPPOSED_POINTS } from "../../constants.js";
import type { Matchup, MatchupResult, PlayerId } from "../../types.js";

/**
 * Scores one matchup.
 * - Each vote is worth POINTS_PER_VOTE × multiplier.
 * - An answer that takes every vote cast, from at least MIN_SWEEP_VOTES voters, earns a
 *   SWEEP_BONUS × multiplier ("Gbas Gbos!").
 * - If only one author answered, they get UNOPPOSED_POINTS × multiplier and no vote happens.
 */
export function scoreMatchup(matchup: Matchup, multiplier: number): MatchupResult {
  const pointsByAuthor: Record<PlayerId, number> = {};
  const votesByAuthor: Record<PlayerId, number> = {};
  for (const authorId of matchup.authorIds) {
    pointsByAuthor[authorId] = 0;
    votesByAuthor[authorId] = 0;
  }

  const answered = matchup.authorIds.filter((id) => isNonEmpty(matchup.answers[id]));
  if (answered.length === 0) {
    return { pointsByAuthor, votesByAuthor, sweepAuthorId: null };
  }
  if (answered.length === 1) {
    const only = answered[0] as PlayerId;
    pointsByAuthor[only] = UNOPPOSED_POINTS * multiplier;
    return { pointsByAuthor, votesByAuthor, sweepAuthorId: null };
  }

  let totalVotes = 0;
  for (const option of Object.values(matchup.votes)) {
    const authorId = matchup.authorIds[option];
    if (authorId === undefined || !isNonEmpty(matchup.answers[authorId])) continue;
    votesByAuthor[authorId] = (votesByAuthor[authorId] ?? 0) + 1;
    totalVotes += 1;
  }

  let sweepAuthorId: PlayerId | null = null;
  for (const authorId of matchup.authorIds) {
    const votes = votesByAuthor[authorId] ?? 0;
    pointsByAuthor[authorId] = votes * POINTS_PER_VOTE * multiplier;
    if (totalVotes >= MIN_SWEEP_VOTES && votes === totalVotes) sweepAuthorId = authorId;
  }
  if (sweepAuthorId !== null) {
    pointsByAuthor[sweepAuthorId] = (pointsByAuthor[sweepAuthorId] ?? 0) + SWEEP_BONUS * multiplier;
  }

  return { pointsByAuthor, votesByAuthor, sweepAuthorId };
}

export function isNonEmpty(answer: string | null | undefined): answer is string {
  return typeof answer === "string" && answer.length > 0;
}
