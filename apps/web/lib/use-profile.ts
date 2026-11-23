"use client";

import type { HomeRegionCode, ProfileView } from "@afro-party/game-core";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { api, ApiError } from "./api";
import { useSessionStore } from "./session-store";

/**
 * Returns a profile token, creating a guest profile on first use.
 * Never throws: if profiles are unavailable the game still works without them.
 */
let creating: Promise<string | null> | null = null;

export async function ensureProfileToken(seed?: { name?: string; homeRegion?: HomeRegionCode }): Promise<string | null> {
  const existing = useSessionStore.getState().profileToken;
  if (existing) return existing;
  // Several components can ask at once (page + header + join form): share one request
  // so a single visit never creates two guest profiles.
  creating ??= api
    .createProfile(seed ?? {})
    .then(({ token }) => {
      useSessionStore.getState().setProfileToken(token);
      return token;
    })
    .catch(() => null)
    .finally(() => {
      creating = null;
    });
  return creating;
}

export type ProfileStatus = "loading" | "ready" | "unavailable";

/** One in-memory copy of the profile, so the header balance updates the moment the shop spends coins. */
const useProfileCache = create<{ profile: ProfileView | null; set: (p: ProfileView | null) => void }>()((set) => ({
  profile: null,
  set: (profile) => set({ profile }),
}));

/**
 * Loads the current player's profile. With `create`, makes a guest profile if
 * there isn't one yet (profile and shop pages); without it, only reads (header).
 */
export function useProfile({ create = true }: { create?: boolean } = {}) {
  const profile = useProfileCache((s) => s.profile);
  const setProfile = useProfileCache((s) => s.set);
  const [status, setStatus] = useState<ProfileStatus>("loading");

  const refresh = useCallback(async () => {
    const existing = useSessionStore.getState().profileToken;
    const token = create ? await ensureProfileToken(useSessionStore.getState().profile ?? undefined) : existing;
    if (!token) {
      setStatus("unavailable");
      return;
    }
    try {
      const { profile: next } = await api.me(token);
      setProfile(next);
      setStatus("ready");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Token no longer valid (e.g. database reset): start a fresh guest profile.
        useSessionStore.getState().setProfileToken(null);
        if (!create) {
          setStatus("unavailable");
          return;
        }
        const fresh = await ensureProfileToken(useSessionStore.getState().profile ?? undefined);
        if (fresh) {
          const { profile: next } = await api.me(fresh);
          setProfile(next);
          setStatus("ready");
          return;
        }
      }
      setStatus("unavailable");
    }
  }, [create, setProfile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { profile, setProfile, status, refresh };
}

/** Before joining a room: make sure a profile exists and carries the name the player just typed. */
export async function syncProfileBeforeJoin(name: string, homeRegion: HomeRegionCode): Promise<void> {
  const hadToken = useSessionStore.getState().profileToken !== null;
  const token = await ensureProfileToken({ name, homeRegion });
  if (token && hadToken) {
    await api.updateMe(token, { name, homeRegion }).catch(() => undefined);
  }
}
