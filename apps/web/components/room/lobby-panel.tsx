"use client";

import { findItem, type RoomView } from "@afro-party/game-core";
import { useState } from "react";
import { roomUrl, whatsappShareUrl } from "@/lib/room-helpers";
import type { RoomConnection } from "@/lib/use-room-connection";
import { RegionMultiSelect } from "../region-picker";
import { Button, Card } from "../ui";
import { PlayersList } from "./players-list";
import { RoomQr } from "./room-qr";

export function LobbyPanel({ view, connection, big = false }: { view: RoomView; connection: RoomConnection; big?: boolean }) {
  const connected = view.players.filter((p) => p.connected).length;
  const missing = Math.max(0, view.minPlayers - connected);
  const people = view.players.filter((p) => !p.isBot).length;
  const bots = view.players.length - people;
  const practice = bots > 0 && people < 2;

  return (
    <div className="flex flex-col gap-5">
      <InviteCard code={view.code} big={big} />
      <Card>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className={`font-bold ${big ? "text-2xl" : "text-lg"}`}>Players</h2>
          <span className="text-sm text-slate-500">
            {view.players.length}/{view.maxPlayers}
          </span>
        </div>
        <PlayersList view={view} connection={connection} large={big} />
      </Card>

      {view.canControl ? (
        <Card className="flex flex-col gap-4">
          <RegionMultiSelect
            label="Whose jokes are we playing?"
            value={view.settings.regions}
            onChange={(regions) => connection.send({ t: "settings", regions })}
          />
          {view.availablePacks.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">Deck packs in the room</legend>
              <div className="flex flex-wrap gap-2">
                {view.availablePacks.map((id) => {
                  const on = view.settings.packs.includes(id);
                  const name = findItem(id)?.name ?? id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        connection.send({
                          t: "settings",
                          packs: on ? view.settings.packs.filter((p) => p !== id) : [...view.settings.packs, id],
                        })
                      }
                      className={`min-h-11 rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-amber-500 ${
                        on ? "border-emerald-400 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      🃏 {name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">Someone here owns these packs, so everyone gets to play them.</p>
            </fieldset>
          )}
          <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={view.settings.familyMode}
              onChange={(e) => connection.send({ t: "settings", familyMode: e.target.checked })}
              className="size-5 accent-amber-500"
            />
            Family mode
          </label>
          <BotControls
            botSlots={view.botSlots}
            bots={bots}
            missing={missing}
            onAdd={() => connection.send({ t: "add_bot" })}
          />
          {practice && (
            <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <strong>Practice game.</strong> You&apos;ll earn XP. Coins, badges and wins come from playing at least one
              other person, so invite a friend when you can.
            </p>
          )}
          <Button onClick={() => connection.send({ t: "start" })} disabled={missing > 0}>
            {missing > 0 ? `Need ${missing} more player${missing === 1 ? "" : "s"}` : "Everybody's in, start!"}
          </Button>
        </Card>
      ) : (
        <p className="text-center text-slate-500">Waiting for the VIP to start the game…</p>
      )}
    </div>
  );
}

function BotControls({
  botSlots,
  bots,
  missing,
  onAdd,
}: {
  botSlots: number;
  bots: number;
  missing: number;
  onAdd: () => void;
}) {
  // Nothing to offer: the room is full or already has the most bots allowed.
  if (botSlots === 0 && bots === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3">
      <span className="text-2xl" aria-hidden>
        🤖
      </span>
      <p className="min-w-0 flex-1 text-sm text-slate-700">
        {missing > 0 ? (
          <>
            <strong className="text-slate-900">Short on friends?</strong> Fill a seat with a bot.
          </>
        ) : bots > 0 ? (
          <>
            {bots} bot{bots === 1 ? "" : "s"} playing. Tap <em>Remove</em> to swap one for a friend.
          </>
        ) : (
          <>Want more chaos? Add a bot.</>
        )}
      </p>
      <Button variant="secondary" onClick={onAdd} disabled={botSlots === 0} className="shrink-0">
        {botSlots === 0 ? "Bots full" : "Add a bot"}
      </Button>
    </div>
  );
}

function InviteCard({ code, big }: { code: string; big: boolean }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = roomUrl(code);
    const nav = window.navigator;
    try {
      if (typeof nav.share === "function") {
        await nav.share({ title: "Wetin You Talk?", text: `Join my game! Room code ${code}`, url });
        return;
      }
      await nav.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      /* user cancelled the share sheet */
    }
  };

  return (
    <Card className={`flex items-center gap-5 ${big ? "flex-row" : "flex-col sm:flex-row"}`}>
      <div className="flex-1 text-center sm:text-left">
        <p className="text-sm font-medium text-slate-500">Room code</p>
        <p className={`font-mono font-black tracking-[0.25em] text-slate-900 ${big ? "text-7xl" : "text-5xl"}`}>{code}</p>
        <p className="mt-1 text-sm break-all text-slate-500">{roomUrl(code)}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
          <a
            href={whatsappShareUrl(code)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-xl bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-amber-500"
          >
            Share on WhatsApp
          </a>
          <Button variant="secondary" onClick={share}>
            {copied ? "Link copied!" : "Share link"}
          </Button>
        </div>
      </div>
      <RoomQr code={code} size={big ? 200 : 140} />
    </Card>
  );
}
