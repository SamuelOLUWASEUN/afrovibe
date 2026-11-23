"use client";

import { avatarEmoji, type RoomView } from "@afro-party/game-core";
import Link from "next/link";
import { useState } from "react";
import { leaveCopy } from "@/lib/leave-copy";
import type { RoomConnection } from "@/lib/use-room-connection";
import { ConfirmDialog } from "../confirm-dialog";
import { PlayerName } from "../player-name";

/**
 * In-room top bar: home, room code, your name and points, profile, and leave.
 * Mid-game the logo is NOT a link: one accidental tap shouldn't pull you out of a round.
 */
export function RoomHeader({ view, connection }: { view: RoomView; connection: RoomConnection }) {
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const midGame = view.phase.kind !== "lobby" && view.phase.kind !== "final";
  const viewer = view.me;
  const me = viewer.role === "player" ? view.players.find((p) => p.id === viewer.id) : undefined;
  const copy = leaveCopy(view);
  const big = view.me.role === "host";

  const logo = (
    <span className="flex items-center gap-1.5 font-black tracking-tight text-slate-900">
      <span aria-hidden>💬</span>
      <span className={big ? "inline" : "hidden sm:inline"}>Wetin You Talk?</span>
    </span>
  );

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav aria-label="Room" className={`mx-auto flex items-center gap-2 px-4 py-2 ${big ? "max-w-6xl" : "max-w-lg"}`}>
        {midGame ? (
          logo
        ) : (
          <Link href="/" className="rounded-lg px-1 py-1 hover:bg-slate-100" aria-label="Home">
            {logo}
          </Link>
        )}
        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-slate-500">
          {view.code}
        </span>

        <span className="ml-auto" />
        {me && (
          <span className="flex min-w-0 items-center gap-1 text-sm" aria-label={`${me.name}, ${me.score} points`}>
            {/* Name only when there's room; avatar + points always, so your score is never hidden. */}
            <span className="hidden min-w-0 min-[440px]:flex">
              <PlayerName name={me.name} homeRegion={me.homeRegion} cosmetics={me.cosmetics} showLevel={false} />
            </span>
            <span aria-hidden className="min-[440px]:hidden">
              {avatarEmoji(me.cosmetics.avatarId)}
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold whitespace-nowrap text-amber-900 tabular-nums">
              {me.score.toLocaleString("en-GB")} pts
            </span>
          </span>
        )}
        {view.me.role === "player" && (
          <Link
            href="/profile"
            target="_blank"
            rel="noopener"
            className="flex min-h-10 items-center rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            title="Opens in a new tab, so you keep your seat"
          >
            Profile <span aria-hidden>↗</span>
          </Link>
        )}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-10 rounded-lg px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-500"
        >
          {view.me.role === "host" ? "Close" : "Leave"}
        </button>
      </nav>

      <ConfirmDialog
        open={confirming}
        title={copy.title}
        confirmLabel={copy.confirm}
        cancelLabel={copy.cancel}
        busy={leaving}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setLeaving(true);
          void connection.leave();
        }}
      >
        <p>{copy.body}</p>
        {midGame && me && me.score > 0 && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
            {me.score.toLocaleString("en-GB")} points will be lost
          </p>
        )}
      </ConfirmDialog>
    </header>
  );
}
