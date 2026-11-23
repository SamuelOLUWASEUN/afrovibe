"use client";

import { allowedReactions, avatarEmoji, CATALOG, isOwned, type RoomView } from "@afro-party/game-core";
import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "@/lib/session-store";
import { api } from "@/lib/api";
import type { RoomConnection } from "@/lib/use-room-connection";

/** Emojis this player may send: the free basics plus any reaction packs their profile owns. */
function useMyReactions(): string[] {
  const [owned, setOwned] = useState<string[] | null>(null);
  useEffect(() => {
    const token = useSessionStore.getState().profileToken;
    if (!token) return;
    let cancelled = false;
    api
      .me(token)
      .then(({ profile }) => {
        if (!cancelled) setOwned(profile.owned);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return useMemo(() => {
    if (!owned) return allowedReactions(1, new Set());
    const set = new Set(owned);
    return CATALOG.filter((i) => i.kind === "reactions" && isOwned(i, 1, set)).flatMap((i) =>
      i.kind === "reactions" ? [...i.emojis] : [],
    );
  }, [owned]);
}

export function ReactionBar({ connection }: { connection: RoomConnection }) {
  const emojis = useMyReactions();
  const [cooling, setCooling] = useState(false);
  const react = (emoji: string) => {
    if (cooling) return;
    connection.send({ t: "react", emoji });
    setCooling(true);
    window.setTimeout(() => setCooling(false), 1_200);
  };
  return (
    <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Send a reaction">
      {emojis.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => react(emoji)}
          disabled={cooling}
          aria-label={`React ${emoji}`}
          className="size-11 rounded-full border border-slate-200 bg-white text-xl transition-transform active:scale-90 disabled:opacity-50 motion-safe:hover:-translate-y-0.5"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/** Floating reactions from everyone in the room. Decorative, so hidden from screen readers. */
export function ReactionOverlay({ view, connection }: { view: RoomView; connection: RoomConnection }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-20 z-20 h-0">
      {connection.reactions.map((r) => {
        const player = view.players.find((p) => p.id === r.playerId);
        // Stable pseudo-random horizontal position per reaction.
        const left = 8 + ((parseInt(r.id.slice(0, 4), 16) || 0) % 84);
        return (
          <span
            key={r.id}
            className="absolute bottom-0 flex flex-col items-center motion-safe:animate-[float-up_2.6s_ease-out_forwards] motion-reduce:opacity-90"
            style={{ left: `${left}%` }}
          >
            <span className="text-4xl">{r.emoji}</span>
            {player && (
              <span className="rounded-full bg-white/90 px-2 text-xs font-semibold text-slate-700 shadow">
                {avatarEmoji(player.cosmetics.avatarId)} {player.name}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
