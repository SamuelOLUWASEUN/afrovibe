import type { CatalogItem, CoinPack, HomeRegionCode, ProfileView } from "@afro-party/game-core";

/** HTTP base of the room server. Defaults to the WebSocket URL's origin. */
function apiBase(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const ws = process.env.NEXT_PUBLIC_ROOM_SERVER_URL ?? "ws://localhost:8787/ws";
  const url = new URL(ws);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "";
  return url.toString().replace(/\/$/, "");
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

function newKey(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Fetch wrapper.
 * - State-changing POSTs carry an Idempotency-Key generated once per user action.
 * - On a network failure (request may or may not have reached the server) a POST is
 *   retried ONCE with the SAME key, so the server replays the first result instead of,
 *   say, buying the item twice. GETs are naturally safe to retry.
 */
async function request<T>(
  path: string,
  init: { method?: string; token?: string | null; body?: unknown; idempotent?: boolean } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const key = init.idempotent ? newKey() : null;
  const attempt = () =>
    fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...(key ? { "idempotency-key": key } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
    });

  let res: Response;
  try {
    res = await attempt();
  } catch {
    if (method !== "GET" && !key) throw new ApiError(0, "network_error");
    await new Promise((r) => setTimeout(r, 600));
    try {
      res = await attempt();
    } catch {
      throw new ApiError(0, "network_error");
    }
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? "server_error");
  return data as T;
}

export interface BadgeInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  coins: number;
}

export interface CatalogResponse {
  items: CatalogItem[];
  coinPacks: CoinPack[];
  badges: BadgeInfo[];
  paymentsEnabled: boolean;
  progressionEnabled: boolean;
}

export const api = {
  catalog: () => request<CatalogResponse>("/api/catalog"),
  createProfile: (input: { name?: string; homeRegion?: HomeRegionCode }) =>
    request<{ token: string; profile: ProfileView }>("/api/profiles", { method: "POST", body: input, idempotent: true }),
  me: (token: string) => request<{ profile: ProfileView }>("/api/me", { token }),
  updateMe: (token: string, input: { name?: string; homeRegion?: HomeRegionCode }) =>
    request<{ profile: ProfileView }>("/api/me", { method: "PATCH", token, body: input }),
  buy: (token: string, itemId: string) =>
    request<{ profile: ProfileView }>("/api/shop/buy", { method: "POST", token, body: { itemId }, idempotent: true }),
  equip: (token: string, itemId: string) =>
    request<{ profile: ProfileView }>("/api/me/equip", { method: "POST", token, body: { itemId }, idempotent: true }),
  checkout: (token: string, packId: string) =>
    request<{ url: string }>("/api/checkout", { method: "POST", token, body: { packId }, idempotent: true }),
};

export const SHOP_ERRORS: Record<string, string> = {
  not_enough_coins: "Not enough coins yet. Play a game or top up.",
  level_too_low: "You need a higher level for this one.",
  already_owned: "You already own this.",
  not_owned: "Buy it first, then equip it.",
  payments_disabled: "Coin purchases aren't switched on yet.",
  progression_disabled: "Profiles aren't available right now.",
  network_error: "Can't reach the server. Check your connection.",
  rate_limited: "Too many requests. Wait a moment.",
  idempotency_key_reused: "That request got mixed up. Please try again.",
};

export function formatPence(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}
