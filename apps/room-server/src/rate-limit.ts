/**
 * In-memory limiters. Correct for the single-instance deployment this server is
 * designed for (rooms live in memory anyway). If you ever run several instances,
 * move these to Redis so limits are shared.
 */

/** Allows `limit` events per `windowMs` per key (sliding window). */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records an attempt; returns true if it is allowed. */
  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Seconds until the oldest hit in the window expires (for Retry-After). */
  retryAfterSeconds(key: string, now = Date.now()): number {
    const oldest = this.hits.get(key)?.[0];
    return oldest === undefined ? 0 : Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
  }

  /** Drops expired keys so memory stays bounded. Call periodically. */
  prune(now = Date.now()): void {
    for (const [key, times] of this.hits) {
      const recent = times.filter((t) => now - t < this.windowMs);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }

  get size(): number {
    return this.hits.size;
  }
}

/** Caps simultaneous things (e.g. open sockets) per key. */
export class ConcurrencyLimiter {
  private readonly counts = new Map<string, number>();

  constructor(private readonly max: number) {}

  acquire(key: string): boolean {
    const current = this.counts.get(key) ?? 0;
    if (current >= this.max) return false;
    this.counts.set(key, current + 1);
    return true;
  }

  release(key: string): void {
    const current = this.counts.get(key) ?? 0;
    if (current <= 1) this.counts.delete(key);
    else this.counts.set(key, current - 1);
  }

  count(key: string): number {
    return this.counts.get(key) ?? 0;
  }
}
