"use client";

const COLORS = ["#f59e0b", "#10b981", "#e11d48", "#0ea5e9", "#8b5cf6", "#facc15"];
const PIECES = 48;

/**
 * Lightweight CSS confetti for the winner screen. No canvas or library, about
 * 50 absolutely positioned spans, and nothing at all for people who prefer
 * reduced motion. Positions are derived from the index so renders are stable.
 */
export function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden motion-reduce:hidden">
      {Array.from({ length: PIECES }, (_, i) => {
        const left = (i * 37) % 100;
        const delay = (i % 12) * 0.12;
        const duration = 2.4 + ((i * 7) % 10) / 10;
        const size = 6 + ((i * 5) % 6);
        const color = COLORS[i % COLORS.length];
        return (
          <span
            key={i}
            className="absolute top-0 block animate-[confetti-fall_var(--d)_ease-in_var(--delay)_forwards] rounded-[2px] opacity-0"
            style={
              {
                left: `${left}%`,
                width: size,
                height: size * 1.6,
                background: color,
                "--d": `${duration}s`,
                "--delay": `${delay}s`,
                "--spin": `${(i % 2 === 0 ? 1 : -1) * (360 + i * 15)}deg`,
                "--drift": `${((i * 13) % 80) - 40}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
