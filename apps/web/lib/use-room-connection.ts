"use client";

import type {
  ClientMessage,
  HomeRegionCode,
  RewardSummary,
  RoomView,
  ServerErrorCode,
  ServerMessage,
} from "@afro-party/game-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionStore, type RoomIntent } from "./session-store";

export type ConnectionStatus =
  | "connecting"
  | "open"
  | "reconnecting"
  /** Several attempts in a row never connected: the server is down or the phone is offline. */
  | "unreachable"
  | "needs_join"
  | "not_found"
  | "kicked"
  | "left";

export interface RoomConnection {
  status: ConnectionStatus;
  view: RoomView | null;
  /** Latest user-facing error, cleared automatically after a few seconds. */
  error: { code: ServerErrorCode; message: string } | null;
  /** serverNow - clientNow, for accurate countdowns on phones with wrong clocks. */
  clockOffset: number;
  send: (message: ClientMessage) => void;
  join: (name: string, homeRegion: HomeRegionCode) => void;
  /** Leave for good. Resolves once the server confirms, or after a short timeout if offline. */
  leave: () => Promise<void>;
  /** Manual retry from the "unreachable" screen. */
  retry: () => void;
  /** XP/coins/badges from the game that just ended (profile-linked players only). */
  rewards: RewardSummary | null;
  /** Live emoji reactions, each removed after a couple of seconds. */
  reactions: LiveReaction[];
}

export interface LiveReaction {
  id: string;
  playerId: string;
  emoji: string;
}

const REACTION_TTL_MS = 2_600;
const SERVER_URL = process.env.NEXT_PUBLIC_ROOM_SERVER_URL ?? "ws://localhost:8787/ws";
const MAX_BACKOFF_MS = 8_000;
/** Consecutive failed connection attempts before we stop spinning and say so. */
const UNREACHABLE_AFTER = 5;
const LEAVE_TIMEOUT_MS = 3_000;
/** Join-time errors that should keep the player on the join form. */
const JOIN_ERRORS: ReadonlySet<ServerErrorCode> = new Set([
  "name_taken",
  "invalid_name",
  "room_full",
  "game_in_progress",
  "rate_limited",
]);

function newRequestId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Owns the room WebSocket: admission (create / join / resume), reconnection with
 * backoff, resuming with the stored token so a phone that drops off mid-round
 * slots straight back in, and leaving.
 *
 * Idempotency: each create/join attempt carries a requestId that is reused on
 * every reconnect until a "welcome" arrives, so a lost reply can never create a
 * second player.
 */
export function useRoomConnection(routeCode: string): RoomConnection {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState<RoomConnection["error"]>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [rewards, setRewards] = useState<RewardSummary | null>(null);
  const [reactions, setReactions] = useState<LiveReaction[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const codeRef = useRef<string | null>(routeCode === "new" ? null : routeCode);
  const intentRef = useRef<RoomIntent | null>(null);
  const requestIdRef = useRef<string>(newRequestId());
  const terminalRef = useRef(false);
  const attemptRef = useRef(0);
  const failedOpensRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const errorTimerRef = useRef<number | null>(null);
  const leaveDoneRef = useRef<(() => void) | null>(null);
  const hasViewRef = useRef(false);

  const showError = useCallback((code: ServerErrorCode, message: string) => {
    setError({ code, message });
    if (errorTimerRef.current !== null) window.clearTimeout(errorTimerRef.current);
    errorTimerRef.current = window.setTimeout(() => setError(null), 4_000);
  }, []);

  const rawSend = useCallback((message: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, []);

  /** Ends the session locally: forget the seat token and stop reconnecting. */
  const endSession = useCallback((next: ConnectionStatus) => {
    terminalRef.current = true;
    if (codeRef.current) useSessionStore.getState().forgetSession(codeRef.current);
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    hasViewRef.current = false;
    setView(null);
    setStatus(next);
  }, []);

  const admit = useCallback(() => {
    const code = codeRef.current;
    const session = code ? useSessionStore.getState().sessions[code] : undefined;
    const intent = intentRef.current;
    const profileToken = useSessionStore.getState().profileToken ?? undefined;
    const extras = { ...(profileToken ? { profileToken } : {}), requestId: requestIdRef.current };
    if (code && session) {
      rawSend({ t: "resume", code, token: session.token });
    } else if (intent?.kind === "create") {
      rawSend({
        t: "create",
        mode: intent.mode,
        regions: intent.regions,
        familyMode: intent.familyMode,
        ...(intent.player ? { player: intent.player } : {}),
        ...(intent.bots ? { bots: intent.bots } : {}),
        ...extras,
      });
    } else if (intent?.kind === "join" && code === intent.code) {
      rawSend({ t: "join", code, name: intent.profile.name, homeRegion: intent.profile.homeRegion, ...extras });
    } else if (code) {
      setStatus("needs_join");
    } else {
      // /room/new without an intent (e.g. a refresh before the room existed).
      terminalRef.current = true;
      setStatus("not_found");
    }
  }, [rawSend]);

  const handleMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.t) {
        case "welcome": {
          codeRef.current = message.code;
          intentRef.current = null;
          requestIdRef.current = newRequestId(); // the next attempt (if any) is a new request
          useSessionStore.getState().saveSession(message.code, {
            token: message.token,
            role: message.role,
            playerId: message.playerId,
          });
          if (window.location.pathname !== `/room/${message.code}`) {
            window.history.replaceState(null, "", `/room/${message.code}`);
          }
          setStatus("open");
          return;
        }
        case "state":
          setClockOffset(message.serverNow - Date.now());
          hasViewRef.current = true;
          setView(message.view);
          setStatus("open");
          if (message.view.phase.kind !== "final") setRewards(null);
          return;
        case "rewards":
          setRewards(message.rewards);
          return;
        case "reaction": {
          const reaction: LiveReaction = { id: message.id, playerId: message.playerId, emoji: message.emoji };
          setReactions((list) => [...list.slice(-15), reaction]);
          window.setTimeout(() => setReactions((list) => list.filter((r) => r.id !== reaction.id)), REACTION_TTL_MS);
          return;
        }
        case "pong":
          setClockOffset(message.serverNow - Date.now());
          return;
        case "kicked":
          endSession("kicked");
          return;
        case "left": {
          const done = leaveDoneRef.current;
          leaveDoneRef.current = null;
          endSession("left");
          done?.();
          return;
        }
        case "error": {
          if (message.code === "session_expired") {
            if (codeRef.current) useSessionStore.getState().forgetSession(codeRef.current);
            hasViewRef.current = false;
            setView(null);
            setStatus("needs_join");
            return;
          }
          if (message.code === "room_not_found") {
            endSession("not_found");
            return;
          }
          if (JOIN_ERRORS.has(message.code) && !hasViewRef.current) {
            intentRef.current = null;
            setStatus("needs_join");
          }
          showError(message.code, message.message);
          return;
        }
      }
    },
    [endSession, showError],
  );

  const handleMessageRef = useRef(handleMessage);
  useEffect(() => {
    handleMessageRef.current = handleMessage;
  }, [handleMessage]);

  const connect = useCallback(() => {
    if (terminalRef.current) return;
    const existing = wsRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;

    let opened = false;
    const ws = new WebSocket(SERVER_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      opened = true;
      attemptRef.current = 0;
      failedOpensRef.current = 0;
      admit();
    };
    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        handleMessageRef.current(JSON.parse(event.data) as ServerMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      if (terminalRef.current) return;
      if (!opened) failedOpensRef.current += 1;
      if (failedOpensRef.current >= UNREACHABLE_AFTER) {
        // Stop the spinner; the user gets a clear message and a Retry button.
        setStatus("unreachable");
        return;
      }
      setStatus((s) => (s === "needs_join" ? s : "reconnecting"));
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attemptRef.current);
      attemptRef.current += 1;
      retryTimerRef.current = window.setTimeout(connect, delay);
    };
  }, [admit]);

  const retry = useCallback(() => {
    failedOpensRef.current = 0;
    attemptRef.current = 0;
    terminalRef.current = false;
    setStatus("connecting");
    connect();
  }, [connect]);

  useEffect(() => {
    intentRef.current = useSessionStore.getState().takePendingIntent() ?? intentRef.current;
    terminalRef.current = false;
    connect();

    // Phones suspend sockets in the background; reconnect as soon as the tab is visible again.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || terminalRef.current) return;
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      attemptRef.current = 0;
      connect();
    };
    // Back online after a tunnel or a lift: try straight away instead of waiting for backoff.
    const onOnline = () => {
      if (!terminalRef.current) retry();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      if (errorTimerRef.current !== null) window.clearTimeout(errorTimerRef.current);
      terminalRef.current = true;
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [connect, retry]);

  const join = useCallback(
    (name: string, homeRegion: HomeRegionCode) => {
      const code = codeRef.current;
      if (!code) return;
      const profile = { name, homeRegion };
      useSessionStore.getState().setProfile(profile);
      intentRef.current = { kind: "join", code, profile };
      requestIdRef.current = newRequestId();
      setStatus("connecting");
      if (wsRef.current?.readyState === WebSocket.OPEN) admit();
      else connect();
    },
    [admit, connect],
  );

  const leave = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          // Offline: forget the seat locally. The server treats us as disconnected,
          // and the seat is cleaned up when the room ends.
          endSession("left");
          resolve();
          return;
        }
        leaveDoneRef.current = resolve;
        ws.send(JSON.stringify({ t: "leave" } satisfies ClientMessage));
        window.setTimeout(() => {
          if (leaveDoneRef.current !== resolve) return;
          leaveDoneRef.current = null;
          endSession("left");
          resolve();
        }, LEAVE_TIMEOUT_MS);
      }),
    [endSession],
  );

  return { status, view, error, clockOffset, send: rawSend, join, leave, retry, rewards, reactions };
}
