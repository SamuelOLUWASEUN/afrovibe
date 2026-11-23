import type { PlayerCosmetics } from "../types.js";

/**
 * Everything players can own. Prices are in coins; coins are earned by playing
 * or bought with real money. Items are cosmetic or content (deck packs) only.
 * Nothing here changes points, votes or the odds of winning, by design.
 */

export type CatalogKind = "avatar" | "card_theme" | "name_color" | "reactions" | "deck";

interface BaseItem {
  id: string;
  kind: CatalogKind;
  name: string;
  /** 0 = free (once the level requirement is met). */
  priceCoins: number;
  minLevel: number;
}

export interface AvatarItem extends BaseItem {
  kind: "avatar";
  emoji: string;
}

export interface CardThemeItem extends BaseItem {
  kind: "card_theme";
  /** CSS background value; authored here, never user input. */
  background: string;
  textTone: "dark" | "light";
}

export interface NameColorItem extends BaseItem {
  kind: "name_color";
  hex: string;
}

export interface ReactionsItem extends BaseItem {
  kind: "reactions";
  emojis: readonly string[];
}

export interface DeckItem extends BaseItem {
  kind: "deck";
  description: string;
}

export type CatalogItem = AvatarItem | CardThemeItem | NameColorItem | ReactionsItem | DeckItem;

export const DEFAULT_AVATAR_ID = "avatar_lion";
export const DEFAULT_CARD_THEME_ID = "theme_plain";
export const DEFAULT_NAME_COLOR_ID = "color_slate";
export const DEFAULT_REACTIONS_ID = "reactions_basic";

/** Cosmetics for players without a profile (or before it loads). */
export const DEFAULT_COSMETICS: PlayerCosmetics = {
  avatarId: DEFAULT_AVATAR_ID,
  cardThemeId: DEFAULT_CARD_THEME_ID,
  nameColorId: DEFAULT_NAME_COLOR_ID,
  level: 1,
};

export const CATALOG: readonly CatalogItem[] = [
  // Avatars
  { id: "avatar_lion", kind: "avatar", name: "Lion", emoji: "🦁", priceCoins: 0, minLevel: 1 },
  { id: "avatar_elephant", kind: "avatar", name: "Elephant", emoji: "🐘", priceCoins: 0, minLevel: 1 },
  { id: "avatar_giraffe", kind: "avatar", name: "Giraffe", emoji: "🦒", priceCoins: 0, minLevel: 1 },
  { id: "avatar_rooster", kind: "avatar", name: "Rooster", emoji: "🐓", priceCoins: 150, minLevel: 1 },
  { id: "avatar_zebra", kind: "avatar", name: "Zebra", emoji: "🦓", priceCoins: 150, minLevel: 1 },
  { id: "avatar_leopard", kind: "avatar", name: "Leopard", emoji: "🐆", priceCoins: 200, minLevel: 2 },
  { id: "avatar_parrot", kind: "avatar", name: "Parrot", emoji: "🦜", priceCoins: 200, minLevel: 2 },
  { id: "avatar_drum", kind: "avatar", name: "Talking Drum", emoji: "🥁", priceCoins: 300, minLevel: 3 },
  { id: "avatar_pepper", kind: "avatar", name: "Pepper", emoji: "🌶️", priceCoins: 300, minLevel: 3 },
  { id: "avatar_gorilla", kind: "avatar", name: "Silverback", emoji: "🦍", priceCoins: 450, minLevel: 5 },
  { id: "avatar_crown", kind: "avatar", name: "Crown", emoji: "👑", priceCoins: 0, minLevel: 10 },
  { id: "avatar_trophy", kind: "avatar", name: "Champion", emoji: "🏆", priceCoins: 0, minLevel: 20 },

  // Card designs (shown behind your answer at the reveal)
  { id: "theme_plain", kind: "card_theme", name: "Plain", background: "#ffffff", textTone: "dark", priceCoins: 0, minLevel: 1 },
  {
    id: "theme_adire",
    kind: "card_theme",
    name: "Adire Indigo",
    background:
      "radial-gradient(circle at 25% 25%, rgba(255,255,255,.18) 0 6px, transparent 7px) 0 0/28px 28px, linear-gradient(135deg, #1e3a8a, #312e81)",
    textTone: "light",
    priceCoins: 400,
    minLevel: 2,
  },
  {
    id: "theme_kente",
    kind: "card_theme",
    name: "Kente Gold",
    background:
      "repeating-linear-gradient(90deg, #f59e0b 0 18px, #15803d 18px 26px, #f59e0b 26px 44px, #b91c1c 44px 52px), #f59e0b",
    textTone: "dark",
    priceCoins: 500,
    minLevel: 3,
  },
  {
    id: "theme_ankara",
    kind: "card_theme",
    name: "Ankara Pop",
    background:
      "radial-gradient(circle at 50% 50%, #fde047 0 8px, #f97316 9px 14px, transparent 15px) 0 0/36px 36px, #0d9488",
    textTone: "light",
    priceCoins: 500,
    minLevel: 4,
  },
  {
    id: "theme_kitenge",
    kind: "card_theme",
    name: "Kitenge Sunset",
    background: "linear-gradient(160deg, #fb923c, #e11d48 55%, #7c2d12)",
    textTone: "light",
    priceCoins: 350,
    minLevel: 2,
  },
  {
    id: "theme_ndebele",
    kind: "card_theme",
    name: "Ndebele Lines",
    background:
      "repeating-linear-gradient(0deg, #0f172a 0 4px, transparent 4px 22px), repeating-linear-gradient(90deg, #0f172a 0 4px, #fde68a 4px 30px, #2563eb 30px 44px, #fde68a 44px 70px)",
    textTone: "dark",
    priceCoins: 650,
    minLevel: 6,
  },

  // Name colours
  { id: "color_slate", kind: "name_color", name: "Classic", hex: "#0f172a", priceCoins: 0, minLevel: 1 },
  { id: "color_emerald", kind: "name_color", name: "Emerald", hex: "#047857", priceCoins: 100, minLevel: 1 },
  { id: "color_amber", kind: "name_color", name: "Amber", hex: "#b45309", priceCoins: 100, minLevel: 1 },
  { id: "color_rose", kind: "name_color", name: "Rose", hex: "#be123c", priceCoins: 150, minLevel: 2 },
  { id: "color_sky", kind: "name_color", name: "Sky", hex: "#0369a1", priceCoins: 150, minLevel: 2 },
  { id: "color_violet", kind: "name_color", name: "Violet", hex: "#6d28d9", priceCoins: 200, minLevel: 3 },
  { id: "color_gold", kind: "name_color", name: "Gold", hex: "#a16207", priceCoins: 0, minLevel: 15 },

  // Reaction packs (tap to react during voting and reveals)
  { id: "reactions_basic", kind: "reactions", name: "Basics", emojis: ["😂", "👏", "🔥", "😮"], priceCoins: 0, minLevel: 1 },
  { id: "reactions_wahala", kind: "reactions", name: "Wahala", emojis: ["😤", "🙄", "💀", "🤦🏾"], priceCoins: 200, minLevel: 1 },
  { id: "reactions_party", kind: "reactions", name: "Owambe", emojis: ["🎉", "💃🏾", "🕺🏾", "🥳"], priceCoins: 200, minLevel: 2 },
  { id: "reactions_jollof", kind: "reactions", name: "Jollof Wars", emojis: ["🍛", "🌶️", "👑", "🏳️"], priceCoins: 250, minLevel: 3 },

  // Deck packs: new prompts. One owner unlocks the pack for the whole room.
  {
    id: "deck_owambe",
    kind: "deck",
    name: "Owambe & Weddings",
    description: "Aso ebi drama, uninvited guests and the MC who won't drop the mic.",
    priceCoins: 600,
    minLevel: 1,
  },
  {
    id: "deck_japa",
    kind: "deck",
    name: "Japa Life",
    description: "Visa queues, first winters abroad and the family group chat back home.",
    priceCoins: 600,
    minLevel: 1,
  },
];

export interface CoinPack {
  id: string;
  name: string;
  coins: number;
  /** Price in pence (GBP minor units). */
  pricePence: number;
  badge?: string;
}

/** Real-money coin bundles. Bigger bundles carry a bonus so card fees are a smaller share. */
export const COIN_PACKS: readonly CoinPack[] = [
  { id: "coins_500", name: "Small chops", coins: 500, pricePence: 99 },
  { id: "coins_1200", name: "Party pack", coins: 1_200, pricePence: 199, badge: "+20% bonus" },
  { id: "coins_3500", name: "Owambe pack", coins: 3_500, pricePence: 499, badge: "Best value" },
  { id: "coins_8000", name: "Big Man pack", coins: 8_000, pricePence: 999, badge: "+60% bonus" },
];

/**
 * Real-money equivalent of a coin price, using the smallest bundle's rate
 * (the most a player could have paid per coin). UK advertising guidance expects
 * in-game prices to show their real-world cost.
 */
export function coinsToPence(coins: number): number {
  const base = COIN_PACKS[0] as CoinPack;
  return Math.round((coins * base.pricePence) / base.coins);
}

export function findItem(id: string): CatalogItem | undefined {
  return CATALOG.find((i) => i.id === id);
}

export function findCoinPack(id: string): CoinPack | undefined {
  return COIN_PACKS.find((p) => p.id === id);
}

/** Free items unlock automatically at their level; paid ones must be in the inventory. */
export function isOwned(item: CatalogItem, level: number, inventory: ReadonlySet<string>): boolean {
  if (inventory.has(item.id)) return true;
  return item.priceCoins === 0 && level >= item.minLevel;
}

export function avatarEmoji(id: string): string {
  const item = findItem(id);
  return item?.kind === "avatar" ? item.emoji : "🦁";
}

export function nameColorHex(id: string): string {
  const item = findItem(id);
  return item?.kind === "name_color" ? item.hex : "#0f172a";
}

export function cardTheme(id: string): CardThemeItem {
  const item = findItem(id);
  if (item?.kind === "card_theme") return item;
  return findItem(DEFAULT_CARD_THEME_ID) as CardThemeItem;
}

/** All reaction emojis a player may send, given owned reaction packs. */
export function allowedReactions(level: number, inventory: ReadonlySet<string>): string[] {
  return CATALOG.filter((i): i is ReactionsItem => i.kind === "reactions" && isOwned(i, level, inventory)).flatMap(
    (i) => [...i.emojis],
  );
}
