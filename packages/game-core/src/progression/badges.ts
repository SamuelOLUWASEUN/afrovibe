import type { GameSummaryEntry, LifetimeStats } from "./rewards.js";

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** One-off coin reward when first earned. */
  coins: number;
  earned: (game: GameSummaryEntry, lifetime: LifetimeStats) => boolean;
}

export const BADGES: readonly BadgeDef[] = [
  {
    id: "first_game",
    name: "Welcome to the Party",
    description: "Finish your first game.",
    icon: "🎉",
    coins: 50,
    earned: (_g, l) => l.gamesPlayed >= 1,
  },
  {
    id: "first_win",
    name: "Oga at the Top",
    description: "Win a game.",
    icon: "🥇",
    coins: 100,
    earned: (_g, l) => l.wins >= 1,
  },
  {
    id: "gbas_gbos",
    name: "Gbas Gbos!",
    description: "Take every vote in a matchup (2+ voters).",
    icon: "💥",
    coins: 50,
    earned: (_g, l) => l.sweeps >= 1,
  },
  {
    id: "sweep_master",
    name: "Sweep Master",
    description: "Land 10 Gbas Gbos sweeps.",
    icon: "🧹",
    coins: 150,
    earned: (_g, l) => l.sweeps >= 10,
  },
  {
    id: "crowd_favourite",
    name: "Crowd Favourite",
    description: "Get 8 or more votes in one game.",
    icon: "📣",
    coins: 75,
    earned: (g) => g.stats.votesReceived >= 8,
  },
  {
    id: "last_lash_king",
    name: "Last Lash King",
    description: "Top the Last Lash round.",
    icon: "👑",
    coins: 75,
    earned: (g) => g.stats.lastLashWins >= 1,
  },
  {
    id: "jollof_diplomat",
    name: "Jollof Diplomat",
    description: "Play a game with people from another country.",
    icon: "🤝🏾",
    coins: 50,
    earned: (g) => g.countriesInGame >= 2,
  },
  {
    id: "pan_african",
    name: "Pan-African",
    description: "Play a game with people from 3 or more countries.",
    icon: "🌍",
    coins: 100,
    earned: (g) => g.countriesInGame >= 3,
  },
  {
    id: "full_house",
    name: "Full House",
    description: "Play in a full 8-player game.",
    icon: "🏠",
    coins: 75,
    earned: (g) => g.playersInGame >= 8,
  },
  {
    id: "regular",
    name: "Regular Customer",
    description: "Finish 10 games.",
    icon: "🎟️",
    coins: 100,
    earned: (_g, l) => l.gamesPlayed >= 10,
  },
  {
    id: "veteran",
    name: "Veteran",
    description: "Finish 50 games.",
    icon: "🎖️",
    coins: 250,
    earned: (_g, l) => l.gamesPlayed >= 50,
  },
  {
    id: "champion",
    name: "Champion",
    description: "Win 10 games.",
    icon: "🏆",
    coins: 250,
    earned: (_g, l) => l.wins >= 10,
  },
];

export function findBadge(id: string): BadgeDef | undefined {
  return BADGES.find((b) => b.id === id);
}

export function newlyEarnedBadges(
  game: GameSummaryEntry,
  lifetimeAfter: LifetimeStats,
  alreadyOwned: ReadonlySet<string>,
): BadgeDef[] {
  if (game.practice) return []; // badges are earned playing people, not bots
  return BADGES.filter((b) => !alreadyOwned.has(b.id) && b.earned(game, lifetimeAfter));
}
