"use client";

import type { PlayerView, RoomView } from "@afro-party/game-core";
import { useState } from "react";
import type { RoomConnection } from "@/lib/use-room-connection";
import { ConfirmDialog } from "../confirm-dialog";
import { PlayerName } from "../player-name";
import { Pill } from "../ui";

export function PlayersList({
  view,
  connection,
  large = false,
}: {
  view: RoomView;
  connection: RoomConnection;
  large?: boolean;
}) {
  const myId = view.me.role === "player" ? view.me.id : null;
  const [removing, setRemoving] = useState<PlayerView | null>(null);
  // In the lobby, show the empty seats still needed to start, so the goal is obvious.
  const openSeats = view.phase.kind === "lobby" ? Math.max(0, view.minPlayers - view.players.length) : 0;

  const remove = (p: PlayerView) => {
    // Bots have nothing to lose, so they go straight away; people get a confirmation.
    if (p.isBot) connection.send({ t: "kick", playerId: p.id });
    else setRemoving(p);
  };

  return (
    <>
      <ul className={`grid gap-2 ${large ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
        {view.players.map((p) => (
          <li
            key={p.id}
            className={`flex items-center justify-between gap-2 rounded-xl border px-3 ${
              p.isBot ? "border-sky-100 bg-sky-50/60" : "border-slate-200 bg-white"
            } ${large ? "py-4 text-xl" : "py-2"} ${p.connected ? "" : "opacity-50"} motion-safe:animate-pop`}
          >
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <PlayerName name={p.name} homeRegion={p.homeRegion} cosmetics={p.cosmetics} isBot={p.isBot} />
              {p.isVip && <Pill tone="amber">VIP</Pill>}
              {p.id === myId && <Pill>You</Pill>}
              {!p.connected && <span className="sr-only">(offline)</span>}
            </span>
            {view.canControl && p.id !== myId && (
              <button
                type="button"
                onClick={() => remove(p)}
                className="min-h-9 shrink-0 rounded-lg px-2 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-amber-500"
                aria-label={`Remove ${p.name}`}
              >
                Remove
              </button>
            )}
          </li>
        ))}
        {Array.from({ length: openSeats }, (_, i) => (
          <li
            key={`open-${i}`}
            className={`flex items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-3 text-slate-400 ${
              large ? "py-4 text-xl" : "py-2"
            }`}
          >
            <span aria-hidden className="motion-safe:animate-pulse">
              🪑
            </span>
            Waiting for a player…
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? "this player"}?`}
        confirmLabel="Remove"
        cancelLabel="Keep them"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) connection.send({ t: "kick", playerId: removing.id });
          setRemoving(null);
        }}
      >
        <p>
          They&apos;ll leave the room{view.phase.kind === "lobby" ? "" : " and lose this game's points"}, and their seat code
          stops working.
        </p>
      </ConfirmDialog>
    </>
  );
}
