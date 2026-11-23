"use client";

import { avatarEmoji } from "@afro-party/game-core";
import Link from "next/link";
import { useProfile } from "@/lib/use-profile";

export function SiteHeader() {
  const { profile } = useProfile({ create: false });
  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3" aria-label="Main">
        <Link href="/" className="mr-auto rounded-lg px-2 py-1 font-black tracking-tight whitespace-nowrap text-slate-900">
          <span aria-hidden>💬</span> <span className="hidden sm:inline">Wetin You Talk?</span>
          <span className="sr-only sm:hidden">Wetin You Talk? home</span>
        </Link>
        <Link href="/shop" className="min-h-11 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
          Shop
        </Link>
        <Link
          href="/profile"
          className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          {profile ? (
            <>
              <span aria-hidden>{avatarEmoji(profile.equipped.avatarId)}</span>
              <span className="whitespace-nowrap">Lv {profile.level.level}</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 whitespace-nowrap text-amber-900 tabular-nums">🪙 {profile.coins}</span>
            </>
          ) : (
            "Profile"
          )}
        </Link>
      </nav>
    </header>
  );
}
