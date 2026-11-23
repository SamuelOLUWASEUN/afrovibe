"use client";

import type { PhaseView } from "@afro-party/game-core";
import type { RoomConnection } from "@/lib/use-room-connection";
import { Card } from "../ui";

type VotingPhase = Extract<PhaseView, { kind: "voting" }>;

/** Voting buttons for phones. On the big screen, `readOnly` shows the same layout without buttons. */
export function VotePanel({
  phase,
  connection,
  readOnly = false,
  big = false,
}: {
  phase: VotingPhase;
  connection?: RoomConnection;
  readOnly?: boolean;
  big?: boolean;
}) {
  const isMyMatchup = phase.options.some((o) => o.isMine) && !phase.canVote;
  const interactive = !readOnly && phase.canVote && connection !== undefined;

  return (
    <div className="flex flex-col gap-4">
      <Card className="bg-amber-50">
        <p className="text-sm font-medium text-amber-900">
          Matchup {phase.matchupIndex + 1} of {phase.matchupCount}
        </p>
        <h2 className={`mt-1 leading-snug font-bold ${big ? "text-4xl" : "text-2xl"}`}>{phase.prompt}</h2>
      </Card>

      {!readOnly && isMyMatchup && (
        <p className="text-center font-medium text-slate-600">Your answer is up! Sit tight while the others vote 🙏</p>
      )}
      {!readOnly && phase.canVote && (
        <p className="text-center font-medium text-slate-600" aria-live="polite">
          {phase.myVote === null ? "Tap the funniest answer" : "Changed your mind? Tap the other answer before time runs out."}
        </p>
      )}

      <div className={`grid gap-3 ${big ? "grid-cols-2" : "grid-cols-1"}`}>
        {phase.options.map((o) => {
          const chosen = phase.myVote === o.index;
          const content = (
            <span className={`block leading-snug font-semibold ${big ? "text-3xl" : "text-xl"}`}>
              {o.text ?? <em className="font-normal text-slate-400">No answer 🤐</em>}
            </span>
          );
          if (!interactive) {
            return (
              <div
                key={o.index}
                className={`rounded-2xl border-2 bg-white p-5 ${o.isMine ? "border-amber-300" : "border-slate-200"}`}
              >
                {content}
                {o.isMine && <span className="mt-2 block text-xs font-medium text-amber-800">Your answer</span>}
              </div>
            );
          }
          return (
            <button
              key={o.index}
              type="button"
              disabled={!o.votable || chosen}
              aria-pressed={chosen}
              onClick={() => connection.send({ t: "vote", matchupIndex: phase.matchupIndex, option: o.index })}
              className={`min-h-20 rounded-2xl border-2 p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-amber-500 ${
                chosen
                  ? "border-amber-500 bg-amber-50 disabled:opacity-100"
                  : "border-slate-200 bg-white hover:border-amber-300 disabled:opacity-60"
              }`}
            >
              {content}
              {chosen && <span className="mt-2 block text-xs font-semibold text-amber-800">Your vote ✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
