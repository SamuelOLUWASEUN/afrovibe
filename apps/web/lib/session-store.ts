"use client";

import type { HomeRegionCode, RoomMode } from "@afro-party/game-core";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export interface StoredSession {
  token: string;
  role: "host" | "player";
  playerId: string | null;
  savedAt: number;
}

export interface Profile {
  name: string;
  homeRegion: HomeRegionCode;
}

export type RoomIntent =
  | {
      kind: "create";
      mode: RoomMode;
      regions: HomeRegionCode[];
      familyMode: boolean;
      player: Profile | null;
      /** Seats to fill with bots on creation ("Practice with bots"). */
      bots?: number;
    }
  | { kind: "join"; code: string; profile: Profile };

interface SessionState {
  sessions: Record<string, StoredSession>;
  profile: Profile | null;
  /** Secret for the saved profile (XP, coins, cosmetics). Treat like a password. */
  profileToken: string | null;
  /** In-memory only: what the room page should do once its socket opens. */
  pendingIntent: RoomIntent | null;
  saveSession: (code: string, session: Omit<StoredSession, "savedAt">) => void;
  forgetSession: (code: string) => void;
  setProfile: (profile: Profile) => void;
  setProfileToken: (token: string | null) => void;
  setPendingIntent: (intent: RoomIntent | null) => void;
  takePendingIntent: () => RoomIntent | null;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Never touch localStorage on the server or when it is blocked (private mode, in-app browsers). */
const safeStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(name, value);
    } catch {
      /* storage full or blocked: sessions just won't survive a refresh */
    }
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: {},
      profile: null,
      profileToken: null,
      pendingIntent: null,
      saveSession: (code, session) =>
        set((state) => ({ sessions: { ...pruned(state.sessions), [code]: { ...session, savedAt: Date.now() } } })),
      forgetSession: (code) =>
        set((state) => {
          const sessions = { ...state.sessions };
          delete sessions[code];
          return { sessions };
        }),
      setProfile: (profile) => set({ profile }),
      setProfileToken: (profileToken) => set({ profileToken }),
      setPendingIntent: (pendingIntent) => set({ pendingIntent }),
      takePendingIntent: () => {
        const intent = get().pendingIntent;
        set({ pendingIntent: null });
        return intent;
      },
    }),
    {
      name: "wyt-session-v1",
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        sessions: pruned(state.sessions),
        profile: state.profile,
        profileToken: state.profileToken,
      }),
    },
  ),
);

function pruned(sessions: Record<string, StoredSession>): Record<string, StoredSession> {
  const now = Date.now();
  return Object.fromEntries(Object.entries(sessions).filter(([, s]) => now - s.savedAt < SESSION_TTL_MS));
}
