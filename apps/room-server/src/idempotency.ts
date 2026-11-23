import { createHash } from "node:crypto";

export interface StoredResponse {
  status: number;
  body: unknown;
}

interface Entry {
  fingerprint: string;
  expiresAt: number;
  /** Resolves when the first request finishes; duplicates arriving meanwhile wait on it. */
  result: Promise<StoredResponse>;
}

export type IdempotencyOutcome =
  | { kind: "fresh"; response: StoredResponse }
  | { kind: "replayed"; response: StoredResponse }
  | { kind: "conflict" };

/**
 * Stripe-style Idempotency-Key handling for POST endpoints.
 *
 * - Same key + same request  → the first response is replayed (no double purchase).
 * - Same key, concurrent     → the duplicate waits for the first and gets its result.
 * - Same key + different body → 422, because a reused key almost always means a client bug.
 * - 5xx results are not cached, so a genuine retry after a server error can succeed.
 *
 * In-memory, bounded and TTL'd; fine for one instance. The database ledger's unique
 * refs remain the last line of defence for anything involving coins.
 */
export class IdempotencyStore {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly maxEntries = 20_000,
  ) {}

  static fingerprint(method: string, path: string, body: unknown): string {
    return createHash("sha256").update(`${method} ${path} ${JSON.stringify(body ?? null)}`).digest("hex");
  }

  async run(scopedKey: string, fingerprint: string, handler: () => Promise<StoredResponse>): Promise<IdempotencyOutcome> {
    const now = Date.now();
    const existing = this.entries.get(scopedKey);
    if (existing && existing.expiresAt > now) {
      if (existing.fingerprint !== fingerprint) return { kind: "conflict" };
      return { kind: "replayed", response: await existing.result };
    }

    const result = handler();
    this.entries.set(scopedKey, { fingerprint, expiresAt: now + this.ttlMs, result });
    this.evictOverflow();
    try {
      const response = await result;
      if (response.status >= 500) this.entries.delete(scopedKey);
      return { kind: "fresh", response };
    } catch (err) {
      this.entries.delete(scopedKey);
      throw err;
    }
  }

  prune(now = Date.now()): void {
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
  }

  private evictOverflow(): void {
    // Map preserves insertion order, so the first keys are the oldest.
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
