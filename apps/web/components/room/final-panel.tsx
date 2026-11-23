"use client";

import type { PhaseView, RoomView } from "@afro-party/game-core";
import { avatarEmoji } from "@afro-party/game-core";
import { Flag } from "../flag";
import type { RoomConnection } from "@/lib/use-room-connection";
import { Button, Card } from "../ui";
import { Confetti } from "../confetti";
import { RewardsCard } from "./rewards-card";
import { ScoreboardPanel } from "./scoreboard-panel";

type FinalPhase = Extract<PhaseView, { kind: "final" }>;

export function FinalPanel({
  view,
  phase,
  connection,
  big = false,
}: {
  view: RoomView;
  phase: FinalPhase;
  connection: RoomConnection;
  big?: boolean;
}) {
  const winners = view.players.filter((p) => phase.winnerIds.includes(p.id));
  return (
    <div className="flex flex-col gap-5">
      {winners.length > 0 && <Confetti />}
      <Card className="bg-amber-50 text-center motion-safe:animate-pop">
        <p className={big ? "text-7xl" : "text-5xl"} aria-hidden>
          🏆
        </p>
        {winners.length > 0 ? (
          <h2 className={`mt-2 font-black ${big ? "text-5xl" : "text-3xl"}`}>
            {winners.map((w, i) => (
              <span key={w.id}>
                {i > 0 && " & "}
                {avatarEmoji(w.cosmetics.avatarId)} {w.name} <Flag code={w.homeRegion} />
              </span>
            ))}{" "}
            {winners.length === 1 ? "wins!" : "share the crown!"}
          </h2>
        ) : (
          <h2 className={`mt-2 font-black ${big ? "text-5xl" : "text-3xl"}`}>Game over!</h2>
        )}
      </Card>
      {connection.rewards && <RewardsCard rewards={connection.rewards} />}
      <ScoreboardPanel view={view} title="Final scores" big={big} />
      {view.canControl ? (
        <Button onClick={() => connection.send({ t: "play_again" })}>Play again (new prompts)</Button>
      ) : (
        <p className="text-center text-slate-500">The VIP can start another game.</p>
      )}
    </div>
  );
}
