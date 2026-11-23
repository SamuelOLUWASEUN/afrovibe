/**
 * Core domain types. Everything here is serialisable (plain JSON) so the
 * authoritative server can persist or snapshot a room at any time.
 */

export const REGION_CODES = ["pan", "ng", "gh", "ke", "za"] as const;
export type RegionCode = (typeof REGION_CODES)[number];

/** Regions a player can pick as "home" (pan-African is a content tag only). */
export const HOME_REGION_CODES = ["ng", "gh", "ke", "za"] as const satisfies readonly RegionCode[];
export type HomeRegionCode = (typeof HOME_REGION_CODES)[number];

export type RoomMode = "screen" | "remote";
export type PlayerId = string;

/** What a player's profile shows off in a room. Purely cosmetic: never affects scoring. */
export interface PlayerCosmetics {
  /** Avatar catalog item id. */
  avatarId: string;
  /** Card design catalog item id, used behind this player's answers at the reveal. */
  cardThemeId: string;
  /** Name colour catalog item id. */
  nameColorId: string;
  level: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  homeRegion: HomeRegionCode;
  connected: boolean;
  score: number;
  joinedAt: number;
  cosmetics: PlayerCosmetics;
  /** Deck packs this player owns; anyone in the room who owns a pack unlocks it for everyone. */
  ownedPacks: readonly string[];
  /**
   * Computer-controlled seat. Bots are driven by the server, always count as connected,
   * can never be VIP, and their votes score points but never earn anyone XP, coins or badges.
   */
  isBot: boolean;
}

export interface Prompt {
  id: string;
  /** Contains exactly one "___" blank, or is a question. */
  text: string;
  /** "pan" means it works for any African audience. */
  regions: readonly RegionCode[];
  familySafe: boolean;
  /** Deck pack id; undefined = the free core deck. */
  pack?: string;
}

export interface RoomSettings {
  mode: RoomMode;
  /** Content regions in play. Prompts tagged "pan" are always eligible. */
  regions: readonly HomeRegionCode[];
  familyMode: boolean;
  /** Enabled deck packs (must be owned by someone in the room). */
  packs: readonly string[];
}

/** Per-game running totals used for XP, badges and coins. Reset when a game starts. */
export interface PlayerGameStats {
  votesReceived: number;
  sweeps: number;
  answersGiven: number;
  lastLashWins: number;
  /** Most votes received in a single matchup this game. */
  bestMatchupVotes: number;
}

export type MatchupKind = "pair" | "all";

export interface Matchup {
  kind: MatchupKind;
  promptId: string;
  promptText: string;
  /** Authors in the (shuffled) order their answers are displayed. */
  authorIds: PlayerId[];
  /** null = no answer submitted (yet, or ever). */
  answers: Record<PlayerId, string | null>;
  /** voterId -> option index into authorIds. */
  votes: Record<PlayerId, number>;
  /** Filled in when the matchup is revealed. */
  result: MatchupResult | null;
}

export interface MatchupResult {
  pointsByAuthor: Record<PlayerId, number>;
  votesByAuthor: Record<PlayerId, number>;
  /** Author who took every vote ("Gbas Gbos!" bonus), if any. */
  sweepAuthorId: PlayerId | null;
}

export type Phase =
  | { kind: "lobby" }
  | { kind: "answering"; deadline: number }
  | { kind: "voting"; matchupIndex: number; deadline: number }
  | { kind: "reveal"; matchupIndex: number; deadline: number }
  | { kind: "scoreboard"; deadline: number }
  | { kind: "final" };

export type PhaseKind = Phase["kind"];

export interface RoomState {
  code: string;
  settings: RoomSettings;
  players: Player[];
  /** The "VIP" player who controls the game from their phone. */
  vipId: PlayerId | null;
  phase: Phase;
  /** Index into ROUNDS; meaningless in lobby. */
  round: number;
  /** Increments on every phase transition so stale timers are ignored. */
  phaseSeq: number;
  matchups: Matchup[];
  usedPromptIds: string[];
  stats: Record<PlayerId, PlayerGameStats>;
  /** Increments every time a game starts; with the room code it identifies a game for reward idempotency. */
  gameNumber: number;
}

export type Actor = { kind: "host" } | { kind: "player"; id: PlayerId };
