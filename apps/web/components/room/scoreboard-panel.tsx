"use client";

import type { RoomView } from "@afro-party/game-core";
import { rankedPlayers } from "@/lib/room-helpers";
import { PlayerName } from "../player-name";
import { Card } from "../ui";

export function ScoreboardPanel({ view, title, big = false }: { view: RoomView; title: string; big?: boolean }) {
  const ranked = rankedPlayers(view.players);
  const top = ranked[0]?.score ?? 0;
  return (
    <Card>
      <h2 className={`font-bold ${big ? "text-4xl" : "text-xl"}`}>{title}</h2>
      <ol className="mt-4 flex flex-col gap-2">
        {ranked.map((p) => (
          <li key={p.id} className="flex items-center gap-3">
            <span className={`w-7 text-right font-bold text-slate-400 tabular-nums ${big ? "text-2xl" : ""}`}>{1 + ranked.filter((o) => o.score > p.score).length}</span>
            <div className="relative flex-1 overflow-hidden rounded-xl bg-slate-100">
              <div
                className="absolute inset-y-0 left-0 bg-amber-200 transition-[width] duration-700"
                style={{ width: `${top > 0 ? Math.max(4, (p.score / top) * 100) : 4}%` }}
                aria-hidden
              />
              <div className={`relative flex items-center justify-between px-3 ${big ? "py-3 text-2xl" : "py-2"}`}>
                <PlayerName name={p.name} homeRegion={p.homeRegion} cosmetics={p.cosmetics} isBot={p.isBot} />
                <span className="font-mono font-bold tabular-nums">{p.score}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
