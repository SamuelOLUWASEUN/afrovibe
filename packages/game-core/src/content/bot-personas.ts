import type { HomeRegionCode } from "../types.js";

/** The computer players. Invented characters (no real people), always shown with a BOT tag. */
export interface BotPersona {
  /** Stable key; the bot's player id is `bot-<key>`. */
  key: string;
  name: string;
  homeRegion: HomeRegionCode;
  avatarId: string;
}

export const BOT_PERSONAS: readonly BotPersona[] = [
  { key: "bisi", name: "Aunty Bisi", homeRegion: "ng", avatarId: "avatar_parrot" },
  { key: "chidi", name: "Chidi", homeRegion: "ng", avatarId: "avatar_pepper" },
  { key: "tunde", name: "Baba Tunde", homeRegion: "ng", avatarId: "avatar_drum" },
  { key: "kofi", name: "Uncle Kofi", homeRegion: "gh", avatarId: "avatar_rooster" },
  { key: "ama", name: "Ama", homeRegion: "gh", avatarId: "avatar_giraffe" },
  { key: "wanjiru", name: "Wanjiru", homeRegion: "ke", avatarId: "avatar_zebra" },
  { key: "otieno", name: "Otieno", homeRegion: "ke", avatarId: "avatar_elephant" },
  { key: "thandi", name: "Thandi", homeRegion: "za", avatarId: "avatar_leopard" },
  { key: "sipho", name: "Sipho", homeRegion: "za", avatarId: "avatar_gorilla" },
];

export const BOT_ID_PREFIX = "bot-";
