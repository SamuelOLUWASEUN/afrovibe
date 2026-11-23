"use client";

import { useEffect, useState } from "react";

function secondsUntil(deadline: number | null, clockOffset: number): number | null {
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - (Date.now() + clockOffset)) / 1000));
}

/** Whole seconds left until a server-clock deadline, corrected by the measured clock offset. */
export function useCountdown(deadline: number | null, clockOffset: number): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() => secondsUntil(deadline, clockOffset));

  useEffect(() => {
    setSecondsLeft(secondsUntil(deadline, clockOffset));
    if (deadline === null) return;
    const id = window.setInterval(() => setSecondsLeft(secondsUntil(deadline, clockOffset)), 250);
    return () => window.clearInterval(id);
  }, [deadline, clockOffset]);

  return secondsLeft;
}
