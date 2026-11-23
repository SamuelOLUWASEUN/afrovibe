export const MAX_LEVEL = 50;
/** Coins granted for every level gained (not subject to the daily earn cap). */
export const COINS_PER_LEVEL_UP = 50;

/** XP needed to go from `level` to `level + 1`. Gentle early curve: 100, 150, 200, … */
export function xpForNextLevel(level: number): number {
  return 100 + 50 * (Math.max(1, level) - 1);
}

/** Total XP needed to reach `level` from zero. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.min(level, MAX_LEVEL); l += 1) total += xpForNextLevel(l);
  return total;
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP the current level needs in total; null at max level. */
  xpForNext: number | null;
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(xp));
  while (level < MAX_LEVEL && remaining >= xpForNextLevel(level)) {
    remaining -= xpForNextLevel(level);
    level += 1;
  }
  return { level, xpIntoLevel: remaining, xpForNext: level >= MAX_LEVEL ? null : xpForNextLevel(level) };
}
