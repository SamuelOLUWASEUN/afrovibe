"use client";

import { useEffect, useRef } from "react";

/**
 * A short buzz when it becomes your turn (new prompts to answer, or a battle to vote on),
 * so players who put their phone down on a call don't miss it.
 * Android only in practice: iOS Safari doesn't implement navigator.vibrate, and we
 * skip it for anyone who asked their device to reduce motion.
 */
export function useTurnHaptics(turnKey: string | null): void {
  const last = useRef<string | null>(null);
  // The turn that was already active when the page loaded (e.g. a refresh mid-round).
  const atMount = useRef<string | null>(turnKey);
  useEffect(() => {
    if (turnKey === null || turnKey === last.current) return;
    last.current = turnKey;
    if (turnKey === atMount.current) return; // don't buzz just because the page loaded
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate(35);
  }, [turnKey]);
}
