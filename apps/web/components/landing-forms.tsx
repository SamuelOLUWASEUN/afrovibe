"use client";

import { MAX_NAME_LENGTH, isValidRoomCode, type HomeRegionCode, type RoomMode } from "@afro-party/game-core";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useSessionStore } from "@/lib/session-store";
import { syncProfileBeforeJoin } from "@/lib/use-profile";
import { RegionMultiSelect, RegionSelect } from "./region-picker";
import { Button, Card } from "./ui";

/** Two bots plus you is the smallest full game (3 players). */
const PRACTICE_BOTS = 2;

function NameInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-700">
        Your name
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_NAME_LENGTH}
        autoComplete="nickname"
        placeholder="e.g. Tunde"
        className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
      />
    </div>
  );
}

function useSavedProfile(setName: (v: string) => void, setRegion: (v: HomeRegionCode) => void) {
  // Prefill after mount so server and client markup match.
  useEffect(() => {
    const profile = useSessionStore.getState().profile;
    if (!profile) return;
    setName(profile.name);
    setRegion(profile.homeRegion);
  }, [setName, setRegion]);
}

export function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [region, setRegion] = useState<HomeRegionCode>("ng");
  useSavedProfile(setName, setRegion);

  const cleanCode = code.trim().toUpperCase();
  const canSubmit = isValidRoomCode(cleanCode) && name.trim().length > 0;

  const [busy, setBusy] = useState(false);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    const profile = { name: name.trim(), homeRegion: region };
    await syncProfileBeforeJoin(profile.name, profile.homeRegion);
    const store = useSessionStore.getState();
    store.setProfile(profile);
    store.setPendingIntent({ kind: "join", code: cleanCode, profile });
    router.push(`/room/${cleanCode}`);
  };

  return (
    <Card>
      <h2 className="text-xl font-bold">Join a game</h2>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="room-code" className="mb-2 block text-sm font-medium text-slate-700">
            Room code
          </label>
          <input
            id="room-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            maxLength={4}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="ABCD"
            className="min-h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-center font-mono text-3xl tracking-[0.4em] uppercase outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
        </div>
        <NameInput id="join-name" value={name} onChange={setName} />
        <RegionSelect label="Where you dey from?" value={region} onChange={setRegion} />
        <Button type="submit" disabled={!canSubmit || busy}>
          {busy ? "Joining…" : "Join"}
        </Button>
      </form>
    </Card>
  );
}

export function HostForm() {
  const router = useRouter();
  const [mode, setMode] = useState<RoomMode>("remote");
  const [regions, setRegions] = useState<HomeRegionCode[]>(["ng"]);
  const [familyMode, setFamilyMode] = useState(true);
  const [name, setName] = useState("");
  const [region, setRegion] = useState<HomeRegionCode>("ng");
  useSavedProfile(setName, setRegion);

  const needsName = mode === "remote";
  const canSubmit = !needsName || name.trim().length > 0;
  // Practice needs your name on screen, so only in phone mode (TV mode hides the name box).
  const canPractice = mode === "remote" && name.trim().length > 0;

  const [busy, setBusy] = useState<"create" | "practice" | null>(null);
  const go = async (kind: "create" | "practice") => {
    if (busy) return;
    // Practice is always on your own phone: you play, the bots fill the other seats.
    const playMode: RoomMode = kind === "practice" ? "remote" : mode;
    const player = playMode === "remote" ? { name: name.trim(), homeRegion: region } : null;
    if (player && player.name.length === 0) return;
    setBusy(kind);
    if (player) await syncProfileBeforeJoin(player.name, player.homeRegion);
    const store = useSessionStore.getState();
    if (player) store.setProfile(player);
    store.setPendingIntent({
      kind: "create",
      mode: playMode,
      regions,
      familyMode,
      player,
      ...(kind === "practice" ? { bots: PRACTICE_BOTS } : {}),
    });
    router.push("/room/new");
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) void go("create");
  };

  const modeOption = (value: RoomMode, title: string, body: string) => (
    <label
      className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-amber-500 ${
        mode === value ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <input type="radio" name="mode" className="sr-only" checked={mode === value} onChange={() => setMode(value)} />
      <span className="font-semibold text-slate-900">{title}</span>
      <span className="text-sm text-slate-600">{body}</span>
    </label>
  );

  return (
    <Card>
      <h2 className="text-xl font-bold">Host a game</h2>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">How are you playing?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {modeOption("remote", "📱 Everyone on phones", "Great on a WhatsApp or Zoom call with family abroad.")}
            {modeOption("screen", "📺 One big screen", "Open this on a TV or laptop; phones are the controllers.")}
          </div>
        </fieldset>
        {needsName && (
          <>
            <NameInput id="host-name" value={name} onChange={setName} />
            <RegionSelect label="Where you dey from?" value={region} onChange={setRegion} />
          </>
        )}
        <RegionMultiSelect label="Whose jokes are we playing?" value={regions} onChange={setRegions} />
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={familyMode}
            onChange={(e) => setFamilyMode(e.target.checked)}
            className="size-5 accent-amber-500"
          />
          Family mode (no grown-up prompts, rude words masked)
        </label>
        <Button type="submit" disabled={!canSubmit || busy !== null}>
          {busy === "create" ? "Creating…" : "Create room"}
        </Button>
        <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-slate-400 uppercase" aria-hidden>
          <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={() => void go("practice")} disabled={!canPractice || busy !== null}>
            {busy === "practice" ? "Calling the bots…" : "🤖 Practice with bots"}
          </Button>
          <p className="text-center text-xs text-slate-500">
            {canPractice
              ? "No friends online? Play now against 2 bots. Friends can still join with the room code."
              : mode === "screen"
                ? "Switch to “Everyone on phones” and add your name to practise against bots."
                : "Add your name above to practise against bots."}
          </p>
        </div>
      </form>
    </Card>
  );
}
