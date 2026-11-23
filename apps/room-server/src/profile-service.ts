import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  addGameToLifetime,
  allowedReactions,
  cleanName,
  COINS_PER_LEVEL_UP,
  computeGameReward,
  DAILY_GAME_COIN_CAP,
  DEFAULT_COSMETICS,
  findCoinPack,
  findItem,
  isOwned,
  levelFromXp,
  newlyEarnedBadges,
  CATALOG,
  type GameSummaryEntry,
  type HomeRegionCode,
  type PlayerCosmetics,
  type ProfileView,
  type RewardSummary,
} from "@afro-party/game-core";
import type { Db, Queryable } from "./db.js";

interface ProfileRow {
  id: string;
  display_name: string;
  home_region: HomeRegionCode;
  xp: number;
  coins: number;
  games_played: number;
  wins: number;
  votes_received: number;
  sweeps: number;
  equipped_avatar: string;
  equipped_card_theme: string;
  equipped_name_color: string;
}

export interface RoomIdentity {
  profileId: string;
  cosmetics: PlayerCosmetics;
  ownedPacks: string[];
  reactions: string[];
}

export type ShopError = "unknown_item" | "level_too_low" | "already_owned" | "not_enough_coins" | "not_owned" | "not_equippable";

export type ShopResult = { ok: true; profile: ProfileView } | { ok: false; error: ShopError };

const EQUIP_COLUMNS = {
  avatar: "equipped_avatar",
  card_theme: "equipped_card_theme",
  name_color: "equipped_name_color",
} as const;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class ProfileService {
  constructor(private readonly db: Db) {}

  async createGuest(input: { name?: string | undefined; homeRegion?: HomeRegionCode | undefined }): Promise<{ token: string; profile: ProfileView }> {
    const token = randomBytes(32).toString("base64url");
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO profiles (id, token_hash, display_name, home_region) VALUES ($1, $2, $3, $4)`,
      [id, hashToken(token), cleanName(input.name ?? ""), input.homeRegion ?? "ng"],
    );
    const profile = await this.getView(id);
    if (!profile) throw new Error("profile vanished after insert");
    return { token, profile };
  }

  async authenticate(token: string): Promise<string | null> {
    const { rows } = await this.db.query<{ id: string }>(`SELECT id FROM profiles WHERE token_hash = $1`, [hashToken(token)]);
    return rows[0]?.id ?? null;
  }

  async getView(id: string, q: Queryable = this.db): Promise<ProfileView | null> {
    const row = await this.row(q, id);
    if (!row) return null;
    const [badges, inventory] = await Promise.all([
      q.query<{ badge_id: string; earned_at: Date | string }>(
        `SELECT badge_id, earned_at FROM profile_badges WHERE profile_id = $1 ORDER BY earned_at`,
        [id],
      ),
      this.inventory(q, id),
    ]);
    const level = levelFromXp(row.xp);
    return {
      id: row.id,
      name: row.display_name,
      homeRegion: row.home_region,
      xp: row.xp,
      level,
      coins: row.coins,
      stats: { gamesPlayed: row.games_played, wins: row.wins, votesReceived: row.votes_received, sweeps: row.sweeps },
      badges: badges.rows.map((b) => ({ id: b.badge_id, earnedAt: new Date(b.earned_at).toISOString() })),
      owned: CATALOG.filter((item) => isOwned(item, level.level, inventory)).map((i) => i.id),
      equipped: {
        avatarId: row.equipped_avatar,
        cardThemeId: row.equipped_card_theme,
        nameColorId: row.equipped_name_color,
      },
    };
  }

  async update(id: string, input: { name?: string | undefined; homeRegion?: HomeRegionCode | undefined }): Promise<ProfileView | null> {
    if (input.name !== undefined) {
      await this.db.query(`UPDATE profiles SET display_name = $2 WHERE id = $1`, [id, cleanName(input.name)]);
    }
    if (input.homeRegion !== undefined) {
      await this.db.query(`UPDATE profiles SET home_region = $2 WHERE id = $1`, [id, input.homeRegion]);
    }
    return this.getView(id);
  }

  async buy(id: string, itemId: string): Promise<ShopResult> {
    const item = findItem(itemId);
    if (!item) return { ok: false, error: "unknown_item" };
    return this.db.transaction(async (tx) => {
      const row = await this.row(tx, id, true);
      if (!row) return { ok: false, error: "unknown_item" } as const;
      const level = levelFromXp(row.xp).level;
      if (level < item.minLevel) return { ok: false, error: "level_too_low" } as const;
      if (isOwned(item, level, await this.inventory(tx, id))) return { ok: false, error: "already_owned" } as const;
      if (row.coins < item.priceCoins) return { ok: false, error: "not_enough_coins" } as const;

      await tx.query(`UPDATE profiles SET coins = coins - $2 WHERE id = $1`, [id, item.priceCoins]);
      await tx.query(`INSERT INTO inventory (profile_id, item_id) VALUES ($1, $2)`, [id, item.id]);
      await tx.query(`INSERT INTO coin_ledger (profile_id, delta, reason, ref) VALUES ($1, $2, 'purchase', $3)`, [
        id,
        -item.priceCoins,
        `buy:${id}:${item.id}`,
      ]);
      const profile = await this.getView(id, tx);
      return profile ? ({ ok: true, profile } as const) : ({ ok: false, error: "unknown_item" } as const);
    });
  }

  async equip(id: string, itemId: string): Promise<ShopResult> {
    const item = findItem(itemId);
    if (!item) return { ok: false, error: "unknown_item" };
    if (item.kind !== "avatar" && item.kind !== "card_theme" && item.kind !== "name_color") {
      return { ok: false, error: "not_equippable" };
    }
    const row = await this.row(this.db, id);
    if (!row) return { ok: false, error: "unknown_item" };
    if (!isOwned(item, levelFromXp(row.xp).level, await this.inventory(this.db, id))) {
      return { ok: false, error: "not_owned" };
    }
    await this.db.query(`UPDATE profiles SET ${EQUIP_COLUMNS[item.kind]} = $2 WHERE id = $1`, [id, item.id]);
    const profile = await this.getView(id);
    return profile ? { ok: true, profile } : { ok: false, error: "unknown_item" };
  }

  /** What a player brings into a room: cosmetics, deck packs and allowed reactions. */
  async roomIdentity(token: string): Promise<RoomIdentity | null> {
    const id = await this.authenticate(token);
    if (!id) return null;
    const row = await this.row(this.db, id);
    if (!row) return null;
    const level = levelFromXp(row.xp).level;
    const inventory = await this.inventory(this.db, id);
    const owned = (itemId: string, fallback: string) => {
      const item = findItem(itemId);
      return item && isOwned(item, level, inventory) ? itemId : fallback;
    };
    return {
      profileId: id,
      cosmetics: {
        // Re-check ownership so a stale equip can never show something unowned.
        avatarId: owned(row.equipped_avatar, DEFAULT_COSMETICS.avatarId),
        cardThemeId: owned(row.equipped_card_theme, DEFAULT_COSMETICS.cardThemeId),
        nameColorId: owned(row.equipped_name_color, DEFAULT_COSMETICS.nameColorId),
        level,
      },
      ownedPacks: CATALOG.filter((i) => i.kind === "deck" && isOwned(i, level, inventory)).map((i) => i.id),
      reactions: allowedReactions(level, inventory),
    };
  }

  /**
   * Grants XP, coins and badges for a finished game. Idempotent per (game, profile):
   * the ledger's unique ref means a retry or duplicate call pays nothing twice.
   * Returns null for a profile that was already rewarded for this game.
   */
  async recordGame(gameRef: string, profileId: string, entry: GameSummaryEntry): Promise<RewardSummary | null> {
    return this.db.transaction(async (tx) => {
      const row = await this.row(tx, profileId, true);
      if (!row) return null;
      const ref = `game:${gameRef}:${profileId}`;
      const dup = await tx.query(`SELECT 1 FROM coin_ledger WHERE ref = $1`, [ref]);
      if (dup.rows.length > 0) return null;

      const reward = computeGameReward(entry);
      const earned = await tx.query<{ total: number }>(
        `SELECT COALESCE(SUM(delta), 0)::int AS total FROM coin_ledger
         WHERE profile_id = $1 AND reason = 'game_reward' AND created_at > now() - interval '1 day'`,
        [profileId],
      );
      const earnedToday = earned.rows[0]?.total ?? 0;
      const gameCoins = Math.max(0, Math.min(reward.coins, DAILY_GAME_COIN_CAP - earnedToday));

      const lifetimeBefore = {
        gamesPlayed: row.games_played,
        wins: row.wins,
        votesReceived: row.votes_received,
        sweeps: row.sweeps,
      };
      const lifetimeAfter = addGameToLifetime(lifetimeBefore, entry);
      const ownedBadges = await tx.query<{ badge_id: string }>(`SELECT badge_id FROM profile_badges WHERE profile_id = $1`, [profileId]);
      const newBadges = newlyEarnedBadges(entry, lifetimeAfter, new Set(ownedBadges.rows.map((b) => b.badge_id)));

      const levelBefore = levelFromXp(row.xp).level;
      const xpAfter = row.xp + reward.xp;
      const levelAfter = levelFromXp(xpAfter).level;
      const levelUpCoins = Math.max(0, levelAfter - levelBefore) * COINS_PER_LEVEL_UP;
      const badgeCoins = newBadges.reduce((sum, b) => sum + b.coins, 0);
      const totalCoins = gameCoins + badgeCoins + levelUpCoins;

      await tx.query(`INSERT INTO coin_ledger (profile_id, delta, reason, ref) VALUES ($1, $2, 'game_reward', $3)`, [
        profileId,
        gameCoins,
        ref,
      ]);
      for (const badge of newBadges) {
        await tx.query(`INSERT INTO profile_badges (profile_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [profileId, badge.id]);
        await tx.query(
          `INSERT INTO coin_ledger (profile_id, delta, reason, ref) VALUES ($1, $2, 'badge_reward', $3) ON CONFLICT (ref) DO NOTHING`,
          [profileId, badge.coins, `badge:${profileId}:${badge.id}`],
        );
      }
      if (levelUpCoins > 0) {
        await tx.query(
          `INSERT INTO coin_ledger (profile_id, delta, reason, ref) VALUES ($1, $2, 'level_up', $3) ON CONFLICT (ref) DO NOTHING`,
          [profileId, levelUpCoins, `level:${profileId}:${levelAfter}`],
        );
      }
      await tx.query(
        `UPDATE profiles SET xp = $2, coins = coins + $3, games_played = $4, wins = $5, votes_received = $6, sweeps = $7 WHERE id = $1`,
        [profileId, xpAfter, totalCoins, lifetimeAfter.gamesPlayed, lifetimeAfter.wins, lifetimeAfter.votesReceived, lifetimeAfter.sweeps],
      );

      return {
        xpGained: reward.xp,
        coinsGained: totalCoins,
        coinsCapped: gameCoins < reward.coins,
        levelBefore,
        levelAfter,
        levelUpCoins,
        newBadges: newBadges.map((b) => ({ id: b.id, name: b.name, icon: b.icon, coins: b.coins })),
        totalXp: xpAfter,
        totalCoins: row.coins + totalCoins,
        practice: entry.practice,
      };
    });
  }

  /** Credits a paid coin pack. `paymentRef` (e.g. the Stripe session id) makes it idempotent. */
  async creditCoinPack(profileId: string, packId: string, paymentRef: string): Promise<"credited" | "duplicate" | "unknown"> {
    const pack = findCoinPack(packId);
    if (!pack) return "unknown";
    return this.db.transaction(async (tx) => {
      const row = await this.row(tx, profileId, true);
      if (!row) return "unknown";
      const inserted = await tx.query(
        `INSERT INTO coin_ledger (profile_id, delta, reason, ref) VALUES ($1, $2, 'coin_pack', $3)
         ON CONFLICT (ref) DO NOTHING RETURNING id`,
        [profileId, pack.coins, `pay:${paymentRef}`],
      );
      if (inserted.rows.length === 0) return "duplicate";
      await tx.query(`UPDATE profiles SET coins = coins + $2 WHERE id = $1`, [profileId, pack.coins]);
      return "credited";
    });
  }

  private async row(q: Queryable, id: string, lock = false): Promise<ProfileRow | null> {
    const { rows } = await q.query<ProfileRow>(
      `SELECT id, display_name, home_region, xp, coins, games_played, wins, votes_received, sweeps,
              equipped_avatar, equipped_card_theme, equipped_name_color
       FROM profiles WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
      [id],
    );
    return rows[0] ?? null;
  }

  private async inventory(q: Queryable, id: string): Promise<Set<string>> {
    const { rows } = await q.query<{ item_id: string }>(`SELECT item_id FROM inventory WHERE profile_id = $1`, [id]);
    return new Set(rows.map((r) => r.item_id));
  }
}
