"use client";

import { cardTheme, DEFAULT_COSMETICS, type PhaseView, type RoomView } from "@afro-party/game-core";
import { playerName } from "@/lib/room-helpers";
import { PlayerName } from "../player-name";
import { Card, Pill } from "../ui";

type RevealPhase = Extract<PhaseView, { kind: "reveal" }>;

export function RevealPanel({ view, phase, big = false }: { view: RoomView; phase: RevealPhase; big?: boolean }) {
  const ordered = [...phase.options].sort((a, b) => b.votes - a.votes);
  return (
    <div className="flex flex-col gap-4">
      <Card className="bg-amber-50">
        <h2 className={`leading-snug font-bold ${big ? "text-4xl" : "text-2xl"}`}>{phase.prompt}</h2>
      </Card>
      <div className={`grid gap-3 ${big && ordered.length <= 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {ordered.map((o) => {
          const author = view.players.find((p) => p.id === o.authorId);
          const theme = cardTheme(author?.cosmetics.cardThemeId ?? DEFAULT_COSMETICS.cardThemeId);
          const light = theme.textTone === "light";
          return (
            <div
              key={o.index}
              className={`overflow-hidden rounded-2xl border-2 bg-white motion-safe:animate-pop ${
                o.isSweep ? "border-emerald-400" : "border-slate-200"
              }`}
            >
              <div className="p-5" style={{ background: theme.background }}>
                <p
                  className={`inline rounded-lg px-2 py-0.5 leading-relaxed font-semibold [box-decoration-break:clone] ${
                    big ? "text-3xl" : "text-xl"
                  } ${theme.id === "theme_plain" ? "px-0 text-slate-900" : light ? "bg-slate-950/55 text-white" : "bg-white/85 text-slate-900"}`}
                >
                  {o.text ?? <em className="font-normal opacity-70">No answer 🤐</em>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
                {author ? (
                  <PlayerName name={author.name} homeRegion={author.homeRegion} cosmetics={author.cosmetics} isBot={author.isBot} />
                ) : (
                  <span className="font-semibold text-slate-500">{o.authorName}</span>
                )}
                <Pill tone={o.points > 0 ? "amber" : "slate"}>+{o.points}</Pill>
                {o.isSweep && <Pill tone="emerald">Gbas Gbos! 💥</Pill>}
              </div>
              <p className="px-5 pt-1 pb-4 text-sm text-slate-500">
                {o.votes === 0
                  ? "No votes"
                  : `${o.votes} vote${o.votes === 1 ? "" : "s"}: ${o.voterIds.map((id) => playerName(view, id)).join(", ")}`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
