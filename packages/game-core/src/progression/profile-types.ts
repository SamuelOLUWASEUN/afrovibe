import type { HomeRegionCode } from "../types.js";
import type { LevelInfo } from "./levels.js";
import type { LifetimeStats } from "./rewards.js";

/** Shared shapes for the profile HTTP API and in-game reward messages. */

export interface EquippedItems {
  avatarId: string;
  cardThemeId: string;
  nameColorId: string;
}

export interface ProfileView {
  id: string;
  name: string;
  homeRegion: HomeRegionCode;
  xp: number;
  level: LevelInfo;
  coins: number;
  stats: LifetimeStats;
  badges: { id: string; earnedAt: string }[];
  /** Owned catalog item ids, including free items unlocked by level. */
  owned: string[];
  equipped: EquippedItems;
}

export interface RewardSummary {
  xpGained: number;
  coinsGained: number;
  /** True when the daily coin cap reduced this game's coin reward. */
  coinsCapped: boolean;
  levelBefore: number;
  levelAfter: number;
  /** Bonus coins for levelling up (included in coinsGained). */
  levelUpCoins: number;
  newBadges: { id: string; name: string; icon: string; coins: number }[];
  totalXp: number;
  totalCoins: number;
  /** A game with bots and fewer than 2 people: XP only, no coins, badges or win record. */
  practice: boolean;
}
