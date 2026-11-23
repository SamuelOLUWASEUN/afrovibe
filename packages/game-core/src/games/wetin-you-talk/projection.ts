import { MAX_ANSWER_LENGTH, MAX_BOTS, MAX_PLAYERS, MIN_PLAYERS, ROUNDS } from "../../constants.js";
import type { Actor, HomeRegionCode, PlayerCosmetics, PlayerId, RoomSettings, RoomState } from "../../types.js";
import { availablePacks, botCount, isEligibleVoter, isVotableOption } from "./reducer.js";
import { isNonEmpty } from "./scoring.js";

/**
 * Per-viewer projection of room state. This is the ONLY shape that leaves the
 * server: answers stay hidden until voting, and authorship stays hidden until
 * the reveal, so a curious player cannot learn anything from the network tab.
 */

export interface PlayerView {
  id: PlayerId;
  name: string;
  homeRegion: HomeRegionCode;
  connected: boolean;
  score: number;
  isVip: boolean;
  cosmetics: PlayerCosmetics;
  isBot: boolean;
}

export interface MyPromptView {
  promptId: string;
  text: string;
  answered: boolean;
}

export interface VotingOptionView {
  index: number;
  text: string | null;
  isMine: boolean;
  votable: boolean;
}

export interface RevealOptionView {
  index: number;
  text: string | null;
  authorId: PlayerId;
  authorName: string;
  votes: number;
  points: number;
  voterIds: PlayerId[];
  isSweep: boolean;
}

interface RoundMeta {
  round: number;
  roundTitle: string;
  roundCount: number;
  deadline: number;
}

export type PhaseView =
  | { kind: "lobby" }
  | ({
      kind: "answering";
      myPrompts: MyPromptView[];
      doneIds: PlayerId[];
      waitingIds: PlayerId[];
      maxAnswerLength: number;
    } & RoundMeta)
  | ({
      kind: "voting";
      matchupIndex: number;
      matchupCount: number;
      prompt: string;
      options: VotingOptionView[];
      canVote: boolean;
      myVote: number | null;
      votedIds: PlayerId[];
    } & RoundMeta)
  | ({
      kind: "reveal";
      matchupIndex: number;
      matchupCount: number;
      prompt: string;
      options: RevealOptionView[];
    } & RoundMeta)
  | ({ kind: "scoreboard"; nextRoundTitle: string | null } & RoundMeta)
  | { kind: "final"; winnerIds: PlayerId[] };

export type ViewerView = { role: "host" } | { role: "player"; id: PlayerId; isVip: boolean };

export interface RoomView {
  code: string;
  settings: RoomSettings;
  players: PlayerView[];
  me: ViewerView;
  canControl: boolean;
  phase: PhaseView;
  minPlayers: number;
  maxPlayers: number;
  /** How many more bots the VIP may add right now (0 outside the lobby or when full). */
  botSlots: number;
  /** Deck packs someone in the room owns and the VIP can switch on. */
  availablePacks: string[];
}

export function projectRoom(state: RoomState, viewer: Actor): RoomView {
  const viewerId = viewer.kind === "player" ? viewer.id : null;
  const players: PlayerView[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    homeRegion: p.homeRegion,
    connected: p.connected,
    score: p.score,
    isVip: p.id === state.vipId,
    cosmetics: p.cosmetics,
    isBot: p.isBot,
  }));
  const me: ViewerView =
    viewer.kind === "host" ? { role: "host" } : { role: "player", id: viewer.id, isVip: viewer.id === state.vipId };

  return {
    code: state.code,
    settings: state.settings,
    players,
    me,
    canControl: viewer.kind === "host" || viewer.id === state.vipId,
    phase: projectPhase(state, viewerId),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    botSlots:
      state.phase.kind === "lobby"
        ? Math.max(0, Math.min(MAX_BOTS - botCount(state), MAX_PLAYERS - state.players.length))
        : 0,
    availablePacks: availablePacks(state),
  };
}

function roundMeta(state: RoomState, deadline: number): RoundMeta {
  return {
    round: state.round,
    roundTitle: ROUNDS[state.round]?.title ?? "",
    roundCount: ROUNDS.length,
    deadline,
  };
}

function projectPhase(state: RoomState, viewerId: PlayerId | null): PhaseView {
  const phase = state.phase;
  switch (phase.kind) {
    case "lobby":
      return { kind: "lobby" };

    case "answering": {
      const owed = new Map<PlayerId, boolean>();
      for (const m of state.matchups) {
        for (const id of m.authorIds) {
          owed.set(id, (owed.get(id) ?? true) && isNonEmpty(m.answers[id]));
        }
      }
      const myPrompts: MyPromptView[] = viewerId
        ? state.matchups
            .filter((m) => m.authorIds.includes(viewerId))
            .map((m) => ({ promptId: m.promptId, text: m.promptText, answered: isNonEmpty(m.answers[viewerId]) }))
        : [];
      return {
        kind: "answering",
        ...roundMeta(state, phase.deadline),
        myPrompts,
        doneIds: [...owed].filter(([, done]) => done).map(([id]) => id),
        waitingIds: [...owed].filter(([, done]) => !done).map(([id]) => id),
        maxAnswerLength: MAX_ANSWER_LENGTH,
      };
    }

    case "voting": {
      const matchup = state.matchups[phase.matchupIndex];
      if (!matchup) return { kind: "lobby" };
      const canVote = viewerId !== null && isEligibleVoter(state, matchup, viewerId);
      const myVote = viewerId !== null ? (matchup.votes[viewerId] ?? null) : null;
      return {
        kind: "voting",
        ...roundMeta(state, phase.deadline),
        matchupIndex: phase.matchupIndex,
        matchupCount: state.matchups.length,
        prompt: matchup.promptText,
        options: matchup.authorIds.map((authorId, index) => ({
          index,
          text: matchup.answers[authorId] ?? null,
          isMine: authorId === viewerId,
          votable: viewerId !== null && canVote && isVotableOption(matchup, viewerId, index),
        })),
        canVote,
        myVote,
        votedIds: Object.keys(matchup.votes),
      };
    }

    case "reveal": {
      const matchup = state.matchups[phase.matchupIndex];
      if (!matchup || !matchup.result) return { kind: "lobby" };
      const result = matchup.result;
      return {
        kind: "reveal",
        ...roundMeta(state, phase.deadline),
        matchupIndex: phase.matchupIndex,
        matchupCount: state.matchups.length,
        prompt: matchup.promptText,
        options: matchup.authorIds.map((authorId, index) => ({
          index,
          text: matchup.answers[authorId] ?? null,
          authorId,
          authorName: state.players.find((p) => p.id === authorId)?.name ?? "Removed player",
          votes: result.votesByAuthor[authorId] ?? 0,
          points: result.pointsByAuthor[authorId] ?? 0,
          voterIds: Object.entries(matchup.votes)
            .filter(([, option]) => option === index)
            .map(([voterId]) => voterId),
          isSweep: result.sweepAuthorId === authorId,
        })),
      };
    }

    case "scoreboard":
      return {
        kind: "scoreboard",
        ...roundMeta(state, phase.deadline),
        nextRoundTitle: ROUNDS[state.round + 1]?.title ?? null,
      };

    case "final": {
      const top = Math.max(0, ...state.players.map((p) => p.score));
      return {
        kind: "final",
        winnerIds: top > 0 ? state.players.filter((p) => p.score === top).map((p) => p.id) : [],
      };
    }
  }
}
