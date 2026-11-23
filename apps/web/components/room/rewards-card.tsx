"use client";

import type { RewardSummary } from "@afro-party/game-core";
import Link from "next/link";
import { Card, Pill } from "../ui";

/** End-of-game payout: XP, coins, level-ups and new badges for this player. */
export function RewardsCard({ rewards }: { rewards: RewardSummary }) {
  const levelledUp = rewards.levelAfter > rewards.levelBefore;
  return (
    <Card className="border-amber-200 motion-safe:animate-pop">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-lg font-bold">Your rewards</h3>
        <Pill tone="amber">+{rewards.xpGained} XP</Pill>
        <Pill tone="emerald">+{rewards.coinsGained} 🪙</Pill>
      </div>
      {levelledUp && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-center text-lg font-black text-amber-900">
          ⬆️ Level up! You&apos;re now level {rewards.levelAfter} (+{rewards.levelUpCoins} 🪙)
        </p>
      )}
      {rewards.newBadges.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {rewards.newBadges.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
              <span className="text-2xl" aria-hidden>
                {b.icon}
              </span>
              <span className="flex-1">
                <span className="block text-xs font-medium text-slate-500">New badge</span>
                <span className="font-semibold">{b.name}</span>
              </span>
              <span className="text-sm font-semibold text-emerald-700">+{b.coins} 🪙</span>
            </li>
          ))}
        </ul>
      )}
      {rewards.practice && (
        <p className="mt-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
          🤖 Practice game: XP only. Play with at least one other person to earn coins, badges and wins.
        </p>
      )}
      {rewards.coinsCapped && (
        <p className="mt-3 text-xs text-slate-500">
          You&apos;ve hit today&apos;s coin limit from games. XP still counts, and coins come back tomorrow.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
        <Link href="/profile" target="_blank" className="text-amber-700 underline-offset-4 hover:underline">
          View profile ↗
        </Link>
        <Link href="/shop" target="_blank" className="text-amber-700 underline-offset-4 hover:underline">
          Spend coins ↗
        </Link>
      </div>
    </Card>
  );
}
