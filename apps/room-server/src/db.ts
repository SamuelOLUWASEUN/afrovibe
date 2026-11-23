import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

export interface Queryable {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Production: a real Postgres (Supabase, Railway, Neon…). */
export function createPgDb(connectionString: string, ssl: boolean): Db {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  pool.on("error", (err) => console.error("[db] idle client error", err.message));
  return {
    query: async <R>(sql: string, params: unknown[] = []) => {
      const result = await pool.query(sql, params);
      return { rows: result.rows as R[] };
    },
    transaction: async <T>(fn: (tx: Queryable) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx: Queryable = {
          query: async <R>(sql: string, params: unknown[] = []) => ({
            rows: (await client.query(sql, params)).rows as R[],
          }),
        };
        const value = await fn(tx);
        await client.query("COMMIT");
        return value;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/**
 * Local dev and tests: Postgres compiled to WASM, in memory or in a folder.
 * Same SQL as production, zero setup. Not for production traffic.
 */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  return {
    query: async <R>(sql: string, params: unknown[] = []) => ({ rows: (await db.query<R>(sql, params)).rows }),
    transaction: <T>(fn: (tx: Queryable) => Promise<T>) =>
      db.transaction(async (tx) =>
        fn({ query: async <R>(sql: string, params: unknown[] = []) => ({ rows: (await tx.query<R>(sql, params)).rows }) }),
      ),
    close: () => db.close(),
  };
}

/** Idempotent schema. Safe to run on every boot. */
export async function migrate(db: Db): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS profiles (
      id uuid PRIMARY KEY,
      token_hash text NOT NULL UNIQUE,
      display_name text NOT NULL DEFAULT '',
      home_region text NOT NULL DEFAULT 'ng',
      xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
      coins integer NOT NULL DEFAULT 0 CHECK (coins >= 0),
      games_played integer NOT NULL DEFAULT 0,
      wins integer NOT NULL DEFAULT 0,
      votes_received integer NOT NULL DEFAULT 0,
      sweeps integer NOT NULL DEFAULT 0,
      equipped_avatar text NOT NULL DEFAULT 'avatar_lion',
      equipped_card_theme text NOT NULL DEFAULT 'theme_plain',
      equipped_name_color text NOT NULL DEFAULT 'color_slate',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS profile_badges (
      profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      badge_id text NOT NULL,
      earned_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (profile_id, badge_id)
    )`,
    `CREATE TABLE IF NOT EXISTS inventory (
      profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      item_id text NOT NULL,
      acquired_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (profile_id, item_id)
    )`,
    // Every coin movement, earned, bought or spent. "ref" makes each one idempotent:
    // a replayed Stripe webhook or a double-processed game can never pay out twice.
    `CREATE TABLE IF NOT EXISTS coin_ledger (
      id bigserial PRIMARY KEY,
      profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      delta integer NOT NULL,
      reason text NOT NULL,
      ref text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS coin_ledger_profile_created ON coin_ledger (profile_id, created_at)`,
  ];
  for (const sql of statements) await db.query(sql);
}
