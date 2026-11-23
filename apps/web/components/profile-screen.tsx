"use client";

import { avatarEmoji, CATALOG, cardTheme, nameColorHex, type CatalogItem, type ProfileView } from "@afro-party/game-core";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, SHOP_ERRORS, type BadgeInfo } from "@/lib/api";
import { Flag } from "./flag";
import { useSessionStore } from "@/lib/session-store";
import { useProfile } from "@/lib/use-profile";
import { Button, Card, Spinner } from "./ui";

export function ProfileScreen() {
  const { profile, setProfile, status } = useProfile();
  const [badges, setBadges] = useState<BadgeInfo[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .catalog()
      .then((c) => setBadges(c.badges))
      .catch(() => undefined);
  }, []);

  if (status === "loading") return <Spinner label="Loading your profile…" />;
  if (status === "unavailable" || !profile) {
    return (
      <Card className="text-center">
        <h1 className="text-xl font-bold">Profiles are offline</h1>
        <p className="mt-2 text-slate-600">You can still play. XP and coins will be back soon.</p>
      </Card>
    );
  }

  const equip = async (item: CatalogItem) => {
    const token = useSessionStore.getState().profileToken;
    if (!token) return;
    try {
      const { profile: next } = await api.equip(token, item.id);
      setProfile(next);
      setMessage(`${item.name} equipped`);
    } catch (err) {
      setMessage(SHOP_ERRORS[err instanceof ApiError ? err.code : ""] ?? "Couldn't equip that.");
    }
  };

  const { level } = profile;
  const pct = level.xpForNext ? Math.round((level.xpIntoLevel / level.xpForNext) * 100) : 100;
  const earned = new Set(profile.badges.map((b) => b.id));
  const owned = new Set(profile.owned);
  const equippable = CATALOG.filter((i) => owned.has(i.id) && (i.kind === "avatar" || i.kind === "card_theme" || i.kind === "name_color"));
  const equippedIds = new Set(Object.values(profile.equipped));

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <span className="flex size-24 items-center justify-center rounded-3xl bg-amber-50 text-6xl" aria-hidden>
          {avatarEmoji(profile.equipped.avatarId)}
        </span>
        <div className="flex-1">
          <h1 className="text-3xl font-black" style={{ color: nameColorHex(profile.equipped.nameColorId) }}>
            {profile.name || "New player"} <Flag code={profile.homeRegion} className="h-6" />
          </h1>
          <p className="mt-1 font-semibold text-slate-600">Level {level.level}</p>
          <div
            className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={level.xpForNext ?? level.xpIntoLevel}
            aria-valuenow={level.xpIntoLevel}
            aria-label="XP towards next level"
          >
            <div className="h-full rounded-full bg-amber-400 transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {level.xpForNext ? `${level.xpIntoLevel} / ${level.xpForNext} XP to level ${level.level + 1}` : "Max level!"}
          </p>
        </div>
        <div className="rounded-2xl bg-amber-50 px-5 py-3 text-center">
          <p className="text-xs font-semibold text-amber-900 uppercase">Coins</p>
          <p className="text-3xl font-black text-amber-900 tabular-nums">🪙 {profile.coins}</p>
          <Link href="/shop" className="text-sm font-semibold text-amber-800 underline-offset-4 hover:underline">
            Go to shop
          </Link>
        </div>
      </Card>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Stats">
        {[
          ["Games", profile.stats.gamesPlayed],
          ["Wins", profile.stats.wins],
          ["Votes received", profile.stats.votesReceived],
          ["Gbas Gbos", profile.stats.sweeps],
        ].map(([label, value]) => (
          <Card key={label} className="text-center">
            <p className="text-2xl font-black tabular-nums">{value}</p>
            <p className="text-sm text-slate-500">{label}</p>
          </Card>
        ))}
      </section>

      <Card>
        <h2 className="text-xl font-bold">
          Badges <span className="text-base font-medium text-slate-400">{earned.size}/{badges.length || "…"}</span>
        </h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {badges.map((b) => {
            const has = earned.has(b.id);
            return (
              <li
                key={b.id}
                className={`rounded-xl border p-3 ${has ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50 opacity-60"}`}
              >
                <p className={`text-3xl ${has ? "" : "grayscale"}`} aria-hidden>
                  {b.icon}
                </p>
                <p className="mt-1 font-semibold">{b.name}</p>
                <p className="text-xs text-slate-600">{b.description}</p>
                <p className="mt-1 text-xs font-semibold text-emerald-700">{has ? "Earned" : `+${b.coins} 🪙`}</p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="text-xl font-bold">Your look</h2>
        <p className="text-sm text-slate-500">Tap to equip. Get more in the shop.</p>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {equippable.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => equip(item)}
              aria-pressed={equippedIds.has(item.id)}
              className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-amber-500 ${
                equippedIds.has(item.id) ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200"
              }`}
            >
              <ItemPreview item={item} />
              {item.name}
            </button>
          ))}
        </div>
        {message && (
          <p role="status" className="mt-3 text-sm font-medium text-slate-700">
            {message}
          </p>
        )}
      </Card>

      <BackupCard profile={profile} />
    </div>
  );
}

export function ItemPreview({ item }: { item: CatalogItem }) {
  switch (item.kind) {
    case "avatar":
      return <span className="text-3xl">{item.emoji}</span>;
    case "card_theme": {
      const theme = cardTheme(item.id);
      return <span className="block h-8 w-full rounded-md border border-slate-200" style={{ background: theme.background }} />;
    }
    case "name_color":
      return (
        <span className="text-lg font-black" style={{ color: item.hex }}>
          Aa
        </span>
      );
    case "reactions":
      return <span className="text-xl">{item.emojis.join("")}</span>;
    case "deck":
      return <span className="text-3xl">🃏</span>;
  }
}

/** Guest profiles live in this browser. The code lets players restore coins on a new phone. */
function BackupCard({ profile }: { profile: ProfileView }) {
  const [revealed, setRevealed] = useState(false);
  const [restore, setRestore] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const token = useSessionStore((s) => s.profileToken);

  const onRestore = async (e: FormEvent) => {
    e.preventDefault();
    const code = restore.trim();
    if (!code) return;
    try {
      await api.me(code);
      useSessionStore.getState().setProfileToken(code);
      window.location.reload();
    } catch {
      setNote("That code didn't work. Check it and try again.");
    }
  };

  return (
    <Card>
      <h2 className="text-xl font-bold">Keep your progress safe</h2>
      <p className="mt-1 text-sm text-slate-600">
        Your profile is saved to this browser. Copy your secret code somewhere safe to restore your level, coins and items
        on another phone. Anyone with this code can use your coins, so never share it.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {revealed && token ? (
          <code className="rounded-lg bg-slate-100 px-3 py-2 text-xs break-all">{token}</code>
        ) : (
          <Button variant="secondary" onClick={() => setRevealed(true)}>
            Show my code
          </Button>
        )}
        {revealed && token && (
          <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(token).then(() => setNote("Copied."))}>
            Copy
          </Button>
        )}
      </div>
      <form onSubmit={onRestore} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="restore" className="sr-only">
          Restore code
        </label>
        <input
          id="restore"
          value={restore}
          onChange={(e) => setRestore(e.target.value)}
          placeholder="Paste a code to restore a profile"
          autoComplete="off"
          className="min-h-11 flex-1 rounded-xl border border-slate-300 px-4 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
        <Button type="submit" variant="secondary" disabled={!restore.trim()}>
          Restore
        </Button>
      </form>
      {note && (
        <p role="status" className="mt-2 text-sm text-slate-600">
          {note}
        </p>
      )}
      <p className="mt-3 text-xs text-slate-400">Profile ID: {profile.id.slice(0, 8)}</p>
    </Card>
  );
}
