"use client";

import type { RoomView } from "@afro-party/game-core";
import { phaseDeadline } from "@/lib/room-helpers";
import { useCountdown } from "@/lib/use-countdown";
import type { RoomConnection } from "@/lib/use-room-connection";

/** Round title, countdown and the host/VIP skip button. */
export function PhaseBanner({ view, connection, big = false }: { view: RoomView; connection: RoomConnection; big?: boolean }) {
  const deadline = phaseDeadline(view);
  const seconds = useCountdown(deadline, connection.clockOffset);
  const title = "roundTitle" in view.phase ? view.phase.roundTitle : "";
  const urgent = seconds !== null && seconds <= 10;

  return (
    <div className="flex items-center justify-between gap-3">
      <p className={`font-semibold text-slate-500 ${big ? "text-2xl" : "text-sm"}`}>{title}</p>
      <div className="flex items-center gap-2">
        {seconds !== null && (
          <span
            aria-live="off"
            className={`min-w-14 rounded-full px-3 py-1 text-center font-mono font-bold tabular-nums ${
              urgent ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"
            } ${big ? "text-3xl" : "text-base"}`}
          >
            {seconds}s
          </span>
        )}
        {view.canControl && deadline !== null && (
          <button
            type="button"
            onClick={() => connection.send({ t: "advance" })}
            className="min-h-9 rounded-lg px-3 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            Skip ›
          </button>
        )}
      </div>
    </div>
  );
}
