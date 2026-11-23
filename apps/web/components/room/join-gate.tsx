"use client";

import { MAX_NAME_LENGTH, type HomeRegionCode } from "@afro-party/game-core";
import { useEffect, useState, type FormEvent } from "react";
import { useSessionStore } from "@/lib/session-store";
import { syncProfileBeforeJoin } from "@/lib/use-profile";
import { RegionSelect } from "../region-picker";
import { Button, Card } from "../ui";

/** Shown when someone opens a shared /room/ABCD link without a session. */
export function JoinGate({ code, onJoin }: { code: string; onJoin: (name: string, region: HomeRegionCode) => void }) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState<HomeRegionCode>("ng");

  useEffect(() => {
    const profile = useSessionStore.getState().profile;
    if (!profile) return;
    setName(profile.name);
    setRegion(profile.homeRegion);
  }, []);

  const [busy, setBusy] = useState(false);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    await syncProfileBeforeJoin(clean, region);
    onJoin(clean, region);
    setBusy(false);
  };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
      <Card>
        <p className="text-sm font-medium text-slate-500">You&apos;re joining room</p>
        <p className="font-mono text-4xl font-black tracking-[0.3em] text-slate-900">{code}</p>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="gate-name" className="mb-2 block text-sm font-medium text-slate-700">
              Your name
            </label>
            <input
              id="gate-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="nickname"
              autoFocus
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </div>
          <RegionSelect label="Where you dey from?" value={region} onChange={setRegion} />
          <Button type="submit" disabled={!name.trim() || busy}>
            {busy ? "Joining…" : "Join the game"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
