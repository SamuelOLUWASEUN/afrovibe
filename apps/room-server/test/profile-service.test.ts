import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COIN_PACKS, DAILY_GAME_COIN_CAP, findItem, type GameSummaryEntry } from "@afro-party/game-core";
import { createPgliteDb, migrate, type Db } from "../src/db.js";
import { Payments } from "../src/payments.js";
import { ProfileService } from "../src/profile-service.js";

let db: Db;
let profiles: ProfileService;

beforeEach(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await migrate(db); // migrations must be re-runnable
  profiles = new ProfileService(db);
});

afterEach(async () => {
  await db.close();
});

function game(overrides: Partial<GameSummaryEntry> = {}): GameSummaryEntry {
  return {
    playerId: "seat",
    score: 900,
    rank: 1,
    won: true,
    stats: { votesReceived: 6, sweeps: 1, answersGiven: 5, lastLashWins: 0, bestMatchupVotes: 3 },
    playersInGame: 4,
    countriesInGame: 2,
    practice: false,
    ...overrides,
  };
}

async function setCoins(id: string, coins: number) {
  await db.query(`UPDATE profiles SET coins = $2 WHERE id = $1`, [id, coins]);
}

describe("guest profiles", () => {
  it("creates a profile, authenticates by token, and stores only a hash", async () => {
    const { token, profile } = await profiles.createGuest({ name: "  Tunde  ", homeRegion: "ng" });
    expect(profile.name).toBe("Tunde");
    expect(profile.level.level).toBe(1);
    expect(profile.coins).toBe(0);
    expect(profile.owned).toContain("avatar_lion");
    expect(await profiles.authenticate(token)).toBe(profile.id);
    expect(await profiles.authenticate("x".repeat(43))).toBeNull();
    const raw = await db.query<{ token_hash: string }>(`SELECT token_hash FROM profiles`);
    expect(raw.rows[0]!.token_hash).not.toBe(token);
  });
});

describe("game rewards", () => {
  it("grants XP, coins and badges once per game, even if called twice", async () => {
    const { profile } = await profiles.createGuest({});
    const first = await profiles.recordGame("ROOM:1:1", profile.id, game());
    expect(first).not.toBeNull();
    expect(first!.xpGained).toBeGreaterThan(0);
    expect(first!.newBadges.map((b) => b.id)).toEqual(
      expect.arrayContaining(["first_game", "first_win", "gbas_gbos", "jollof_diplomat"]),
    );
    expect(await profiles.recordGame("ROOM:1:1", profile.id, game())).toBeNull();

    const view = (await profiles.getView(profile.id))!;
    expect(view.xp).toBe(first!.totalXp);
    expect(view.coins).toBe(first!.totalCoins);
    expect(view.stats).toEqual({ gamesPlayed: 1, wins: 1, votesReceived: 6, sweeps: 1 });

    // A later game doesn't re-award badges.
    const second = await profiles.recordGame("ROOM:1:2", profile.id, game());
    expect(second!.newBadges).toEqual([]);
  });

  it("pays a practice game (you vs bots) in XP only: no coins, badges or win record", async () => {
    const { profile } = await profiles.createGuest({});
    const practice = game({
      practice: true,
      won: false,
      playersInGame: 1,
      countriesInGame: 1,
      stats: { votesReceived: 0, sweeps: 0, answersGiven: 5, lastLashWins: 0, bestMatchupVotes: 0 },
    });
    const r = await profiles.recordGame("ROOM:1:1", profile.id, practice);
    expect(r).toMatchObject({ practice: true, coinsGained: 0, newBadges: [], coinsCapped: false });
    expect(r!.xpGained).toBeGreaterThan(0);
    const view = (await profiles.getView(profile.id))!;
    expect(view.coins).toBe(0);
    expect(view.stats).toEqual({ gamesPlayed: 0, wins: 0, votesReceived: 0, sweeps: 0 });
    expect(view.badges).toEqual([]);
    expect(await profiles.recordGame("ROOM:1:1", profile.id, practice)).toBeNull(); // still idempotent
  });

  it("pays level-up coins when a level is crossed", async () => {
    const { profile } = await profiles.createGuest({});
    await db.query(`UPDATE profiles SET xp = 95 WHERE id = $1`, [profile.id]);
    const r = await profiles.recordGame("ROOM:1:1", profile.id, game());
    expect(r!.levelBefore).toBe(1);
    expect(r!.levelAfter).toBeGreaterThan(1);
    expect(r!.levelUpCoins).toBeGreaterThan(0);
  });

  it("caps coins earned from games per day but keeps granting XP", async () => {
    const { profile } = await profiles.createGuest({});
    let earnedFromGames = 0;
    let last = null;
    for (let i = 0; i < 20; i += 1) {
      last = await profiles.recordGame(`ROOM:1:${i}`, profile.id, game()); // 10 + 25 (win) + 5 (sweep) = 40 coins each
    }
    const rows = await db.query<{ total: number }>(
      `SELECT COALESCE(SUM(delta),0)::int AS total FROM coin_ledger WHERE profile_id = $1 AND reason = 'game_reward'`,
      [profile.id],
    );
    earnedFromGames = rows.rows[0]!.total;
    expect(earnedFromGames).toBe(DAILY_GAME_COIN_CAP);
    expect(last!.coinsCapped).toBe(true);
    expect(last!.xpGained).toBeGreaterThan(0);
  });
});

describe("shop", () => {
  it("buys with coins, rejects duplicates, low levels and empty wallets, then equips", async () => {
    const { profile } = await profiles.createGuest({});
    const zebra = findItem("avatar_zebra")!;

    expect(await profiles.buy(profile.id, "avatar_zebra")).toEqual({ ok: false, error: "not_enough_coins" });
    await setCoins(profile.id, 1_000);
    const bought = await profiles.buy(profile.id, "avatar_zebra");
    expect(bought.ok).toBe(true);
    if (bought.ok) {
      expect(bought.profile.coins).toBe(1_000 - zebra.priceCoins);
      expect(bought.profile.owned).toContain("avatar_zebra");
    }
    expect(await profiles.buy(profile.id, "avatar_zebra")).toEqual({ ok: false, error: "already_owned" });
    expect(await profiles.buy(profile.id, "theme_ndebele")).toEqual({ ok: false, error: "level_too_low" });
    expect(await profiles.buy(profile.id, "nope")).toEqual({ ok: false, error: "unknown_item" });

    expect(await profiles.equip(profile.id, "avatar_leopard")).toEqual({ ok: false, error: "not_owned" });
    const equipped = await profiles.equip(profile.id, "avatar_zebra");
    expect(equipped.ok && equipped.profile.equipped.avatarId).toBe("avatar_zebra");
    expect(await profiles.equip(profile.id, "deck_japa")).toEqual({ ok: false, error: "not_equippable" });
  });

  it("never lets the balance go negative under concurrent purchases", async () => {
    const { profile } = await profiles.createGuest({});
    await setCoins(profile.id, 300); // enough for exactly one 200-coin item + one 100-coin item
    const results = await Promise.all([
      profiles.buy(profile.id, "avatar_leopard"),
      profiles.buy(profile.id, "avatar_parrot"),
      profiles.buy(profile.id, "color_emerald"),
    ]);
    const view = (await profiles.getView(profile.id))!;
    expect(view.coins).toBeGreaterThanOrEqual(0);
    const spent = 300 - view.coins;
    const okCount = results.filter((r) => r.ok).length;
    expect(okCount).toBeGreaterThanOrEqual(1);
    expect(spent).toBeLessThanOrEqual(300);
  });

  it("puts owned decks and reactions into the room identity", async () => {
    const { token, profile } = await profiles.createGuest({});
    await setCoins(profile.id, 2_000);
    await profiles.buy(profile.id, "deck_japa");
    await profiles.buy(profile.id, "reactions_wahala");
    const identity = (await profiles.roomIdentity(token))!;
    expect(identity.ownedPacks).toEqual(["deck_japa"]);
    expect(identity.reactions).toContain("💀");
    expect(identity.cosmetics.level).toBe(1);
  });
});

describe("Stripe webhook", () => {
  const payments = () =>
    new Payments({ secretKey: "sk_test_dummy", webhookSecret: "whsec_test_secret", webUrl: "http://localhost:3000" }, profiles);

  function checkoutEvent(profileId: string, packId: string, sessionId = "cs_test_123", paymentStatus = "paid") {
    return JSON.stringify({
      id: "evt_1",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: sessionId, object: "checkout.session", payment_status: paymentStatus, metadata: { profileId, packId } } },
    });
  }

  it("credits coins once for a correctly signed paid session", async () => {
    const { profile } = await profiles.createGuest({});
    const p = payments();
    const pack = COIN_PACKS[1]!;
    const payload = checkoutEvent(profile.id, pack.id);
    expect(await p.handleWebhook(Buffer.from(payload), p.signForTest(payload))).toBe("credited");
    expect(await p.handleWebhook(Buffer.from(payload), p.signForTest(payload))).toBe("duplicate");
    expect((await profiles.getView(profile.id))!.coins).toBe(pack.coins);
  });

  it("rejects forged signatures and ignores unpaid sessions", async () => {
    const { profile } = await profiles.createGuest({});
    const p = payments();
    const payload = checkoutEvent(profile.id, "coins_500");
    expect(await p.handleWebhook(Buffer.from(payload), "t=1,v1=forged")).toBe("invalid_signature");
    expect(await p.handleWebhook(Buffer.from(payload), undefined)).toBe("invalid_signature");
    const unpaid = checkoutEvent(profile.id, "coins_500", "cs_test_2", "unpaid");
    expect(await p.handleWebhook(Buffer.from(unpaid), p.signForTest(unpaid))).toBe("ignored");
    expect((await profiles.getView(profile.id))!.coins).toBe(0);
  });
});
