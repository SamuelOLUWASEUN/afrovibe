"use client";

import type { RoomView } from "@afro-party/game-core";
import type { RoomConnection } from "@/lib/use-room-connection";
import { useTurnHaptics } from "@/lib/use-turn-haptics";
import { AnswerPanel } from "./answer-panel";
import { FinalPanel } from "./final-panel";
import { LobbyPanel } from "./lobby-panel";
import { PhaseBanner } from "./phase-banner";
import { ReactionBar, ReactionOverlay } from "./reactions";
import { RevealPanel } from "./reveal-panel";
import { ScoreboardPanel } from "./scoreboard-panel";
import { VotePanel } from "./vote-panel";

/**
 * A player's phone. In "Everyone on phones" mode it is also the display, so it
 * shows full prompts, answers and reveals rather than "look at the TV".
 */
export function PlayerController({ view, connection }: { view: RoomView; connection: RoomConnection }) {
  const phase = view.phase;
  // Your turn = a new set of prompts to answer, or a battle you can vote on.
  const turnKey =
    phase.kind === "answering" && phase.myPrompts.some((p) => !p.answered)
      ? `answer:${phase.round}`
      : phase.kind === "voting" && phase.canVote
        ? `vote:${phase.round}:${phase.matchupIndex}`
        : null;
  useTurnHaptics(turnKey);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-5">

      {phase.kind !== "lobby" && phase.kind !== "final" && <PhaseBanner view={view} connection={connection} />}

      {phase.kind === "lobby" && <LobbyPanel view={view} connection={connection} />}
      {phase.kind === "answering" && <AnswerPanel view={view} phase={phase} connection={connection} />}
      {phase.kind === "voting" && <VotePanel phase={phase} connection={connection} />}
      {phase.kind === "reveal" && <RevealPanel view={view} phase={phase} />}
      {phase.kind === "scoreboard" && (
        <>
          <ScoreboardPanel view={view} title="Scores so far" />
          {phase.nextRoundTitle && <p className="text-center font-semibold text-slate-600">Next: {phase.nextRoundTitle}</p>}
        </>
      )}
      {phase.kind === "final" && <FinalPanel view={view} phase={phase} connection={connection} />}

      {(phase.kind === "voting" || phase.kind === "reveal" || phase.kind === "scoreboard" || phase.kind === "final") && (
        <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur">
          <ReactionBar connection={connection} />
        </div>
      )}
      <ReactionOverlay view={view} connection={connection} />
    </main>
  );
}
