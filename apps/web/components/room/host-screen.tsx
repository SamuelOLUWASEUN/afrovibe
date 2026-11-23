"use client";

import type { RoomView } from "@afro-party/game-core";
import { playerName } from "@/lib/room-helpers";
import type { RoomConnection } from "@/lib/use-room-connection";
import { Card } from "../ui";
import { FinalPanel } from "./final-panel";
import { LobbyPanel } from "./lobby-panel";
import { PhaseBanner } from "./phase-banner";
import { ReactionOverlay } from "./reactions";
import { RevealPanel } from "./reveal-panel";
import { ScoreboardPanel } from "./scoreboard-panel";
import { VotePanel } from "./vote-panel";

/** The shared TV / laptop screen in "One big screen" mode. Never shows anyone's unrevealed answers. */
export function HostScreen({ view, connection }: { view: RoomView; connection: RoomConnection }) {
  const phase = view.phase;
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      {phase.kind !== "lobby" && phase.kind !== "final" && <PhaseBanner view={view} connection={connection} big />}

      {phase.kind === "lobby" && <LobbyPanel view={view} connection={connection} big />}

      {phase.kind === "answering" && (
        <Card className="text-center">
          <h2 className="text-4xl font-black">Check your phones! 📱</h2>
          <p className="mt-2 text-xl text-slate-600">Answer your prompts before time runs out.</p>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[...phase.doneIds, ...phase.waitingIds].map((id) => {
              const done = phase.doneIds.includes(id);
              return (
                <div
                  key={id}
                  className={`rounded-xl border px-4 py-3 text-xl font-semibold ${
                    done ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {done ? "✅" : "✍️"} {playerName(view, id)}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {phase.kind === "voting" && (
        <>
          <VotePanel phase={phase} readOnly big />
          <p className="text-center text-xl text-slate-500">Vote on your phones!</p>
        </>
      )}

      {phase.kind === "reveal" && <RevealPanel view={view} phase={phase} big />}

      {phase.kind === "scoreboard" && (
        <>
          <ScoreboardPanel view={view} title="Scores so far" big />
          {phase.nextRoundTitle && <p className="text-center text-2xl font-semibold text-slate-600">Next: {phase.nextRoundTitle}</p>}
        </>
      )}

      {phase.kind === "final" && <FinalPanel view={view} phase={phase} connection={connection} big />}
      <ReactionOverlay view={view} connection={connection} />
    </main>
  );
}
