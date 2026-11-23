"use client";

import { coinsToPence, type CatalogItem, type CatalogKind, type ProfileView } from "@afro-party/game-core";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, formatPence, SHOP_ERRORS, type CatalogResponse } from "@/lib/api";
import { useSessionStore } from "@/lib/session-store";
import { useProfile } from "@/lib/use-profile";
import { ItemPreview } from "./profile-screen";
import { Button, Card, Pill, Spinner } from "./ui";

type Tab = CatalogKind | "coins";

const TABS: { id: Tab; label: string }[] = [
  { id: "avatar", label: "Avatars" },
  { id: "card_theme", label: "Card designs" },
  { id: "name_color", label: "Name colours" },
  { id: "reactions", label: "Reactions" },
  { id: "deck", label: "Deck packs" },
  { id: "coins", label: "Get coins" },
];

const EQUIPPABLE: ReadonlySet<CatalogKind> = new Set(["avatar", "card_theme", "name_color"]);

export function ShopScreen() {
  const params = useSearchParams();
  const purchase = params.get("purchase");
  const { profile, setProfile, status, refresh } = useProfile();
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [tab, setTab] = useState<Tab>(purchase ? "coins" : "avatar");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    purchase === "success"
      ? "Payment received! Your coins arrive within a few seconds."
      : purchase === "cancelled"
        ? "Payment cancelled. You weren't charged."
        : null,
  );

  useEffect(() => {
    api
      .catalog()
      .then(setCatalog)
      .catch(() => setMessage("Couldn't load the shop. Check your connection."));
  }, []);

  // Coins are credited by Stripe's webhook, so poll briefly after returning from checkout.
  useEffect(() => {
    if (purchase !== "success") return;
    const ids = [1_500, 4_000, 8_000].map((ms) => window.setTimeout(() => void refresh(), ms));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [purchase, refresh]);

  if (status === "loading" || !catalog) return <Spinner label="Opening the shop…" />;
  if (status === "unavailable" || !profile || !catalog.progressionEnabled) {
    return (
      <Card className="text-center">
        <h1 className="text-xl font-bold">The shop is closed right now</h1>
        <p className="mt-2 text-slate-600">You can still play. Try again soon.</p>
      </Card>
    );
  }

  const token = useSessionStore.getState().profileToken;
  const run = async (key: string, action: () => Promise<{ profile: ProfileView }>, success: string) => {
    if (!token || busy) return;
    setBusy(key);
    try {
      const { profile: next } = await action();
      setProfile(next);
      setMessage(success);
    } catch (err) {
      setMessage(SHOP_ERRORS[err instanceof ApiError ? err.code : ""] ?? "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const buyCoins = async (packId: string) => {
    if (!token || busy) return;
    setBusy(packId);
    try {
      const { url } = await api.checkout(token, packId);
      window.location.assign(url);
    } catch (err) {
      setMessage(SHOP_ERRORS[err instanceof ApiError ? err.code : ""] ?? "Couldn't start checkout.");
      setBusy(null);
    }
  };

  const owned = new Set(profile.owned);
  const equipped = new Set(Object.values(profile.equipped));
  const items = catalog.items.filter((i) => i.kind === tab);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Shop</h1>
          <p className="text-slate-600">Looks and new prompts only. Nothing here changes points or votes.</p>
        </div>
        <span className="rounded-2xl bg-amber-100 px-4 py-2 text-xl font-black text-amber-900 tabular-nums">
          🪙 {profile.coins}
        </span>
      </div>

      <div role="tablist" aria-label="Shop sections" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-amber-500 ${
              tab === t.id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <p role="status" className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">
          {message}
        </p>
      )}

      {tab === "coins" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {catalog.coinPacks.map((pack) => (
            <Card key={pack.id} className="flex flex-col items-center gap-2 text-center">
              {pack.badge && <Pill tone="emerald">{pack.badge}</Pill>}
              <p className="text-4xl" aria-hidden>
                🪙
              </p>
              <p className="text-2xl font-black tabular-nums">{pack.coins.toLocaleString("en-GB")}</p>
              <p className="text-sm text-slate-500">{pack.name}</p>
              <Button
                className="mt-auto w-full"
                disabled={!catalog.paymentsEnabled || busy !== null}
                onClick={() => void buyCoins(pack.id)}
              >
                {busy === pack.id ? "Opening checkout…" : formatPence(pack.pricePence)}
              </Button>
            </Card>
          ))}
          <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">
            {catalog.paymentsEnabled
              ? "Payments are handled securely by Stripe. Coins can't be exchanged back for money."
              : "Buying coins isn't switched on yet. You can still earn coins by playing, finishing games and earning badges."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <ShopItemCard
              key={item.id}
              item={item}
              level={profile.level.level}
              coins={profile.coins}
              isOwned={owned.has(item.id)}
              isEquipped={equipped.has(item.id)}
              busy={busy === item.id}
              onBuy={() => void run(item.id, () => api.buy(token ?? "", item.id), `${item.name} is yours!`)}
              onEquip={() => void run(item.id, () => api.equip(token ?? "", item.id), `${item.name} equipped`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ShopItemCard({
  item,
  level,
  coins,
  isOwned,
  isEquipped,
  busy,
  onBuy,
  onEquip,
}: {
  item: CatalogItem;
  level: number;
  coins: number;
  isOwned: boolean;
  isEquipped: boolean;
  busy: boolean;
  onBuy: () => void;
  onEquip: () => void;
}) {
  const locked = level < item.minLevel;
  const canEquip = EQUIPPABLE.has(item.kind);

  let action;
  if (isOwned) {
    action = canEquip ? (
      <Button variant={isEquipped ? "secondary" : "primary"} disabled={isEquipped || busy} onClick={onEquip} className="w-full">
        {isEquipped ? "Equipped" : "Equip"}
      </Button>
    ) : (
      <p className="text-center text-sm font-semibold text-emerald-700">
        Owned{item.kind === "deck" ? ". Switch it on in the lobby" : ""}
      </p>
    );
  } else if (locked) {
    action = <p className="text-center text-sm font-semibold text-slate-500">🔒 Unlocks at level {item.minLevel}</p>;
  } else {
    action = (
      <Button onClick={onBuy} disabled={busy || coins < item.priceCoins} className="w-full">
        {busy ? "Buying…" : `🪙 ${item.priceCoins}`}
      </Button>
    );
  }

  return (
    <Card className={`flex flex-col gap-3 ${locked && !isOwned ? "opacity-70" : ""}`}>
      <div className="flex min-h-14 items-center justify-center">
        <ItemPreview item={item} />
      </div>
      <div>
        <p className="font-semibold">{item.name}</p>
        {item.kind === "deck" && <p className="text-xs text-slate-600">{item.description}</p>}
        {!isOwned && item.priceCoins > 0 && (
          <p className="text-xs text-slate-500">
            {item.priceCoins} coins ≈ {formatPence(coinsToPence(item.priceCoins))}
          </p>
        )}
        {item.priceCoins === 0 && !isOwned && <p className="text-xs text-slate-500">Free level reward</p>}
      </div>
      <div className="mt-auto">{action}</div>
    </Card>
  );
}
