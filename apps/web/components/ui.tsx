import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerSolid";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-amber-500 text-slate-950 hover:bg-amber-400 active:bg-amber-600 shadow-sm disabled:bg-slate-200 disabled:text-slate-400",
  secondary:
    "bg-white text-slate-900 border border-slate-300 hover:bg-slate-100 active:bg-slate-200 disabled:text-slate-400",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "bg-white text-rose-700 border border-rose-200 hover:bg-rose-50",
  dangerSolid: "bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700 shadow-sm disabled:bg-rose-300",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function Pill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "amber" | "emerald" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-900",
    emerald: "bg-emerald-100 text-emerald-800",
  } as const;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-10 text-slate-500">
      <span className="size-8 animate-spin rounded-full border-4 border-slate-200 border-t-amber-500" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}
