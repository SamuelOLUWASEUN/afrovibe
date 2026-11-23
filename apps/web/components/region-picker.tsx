"use client";

import { REGIONS, type HomeRegionCode } from "@afro-party/game-core";
import { Flag } from "./flag";

interface SingleProps {
  label: string;
  value: HomeRegionCode;
  onChange: (value: HomeRegionCode) => void;
}

/** Pick one country (the player's home flag). */
export function RegionSelect({ label, value, onChange }: SingleProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">{label}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {REGIONS.map((r) => (
          <label
            key={r.code}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-amber-500 ${
              value === r.code ? "border-amber-400 bg-amber-50 text-slate-900" : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              name={label}
              checked={value === r.code}
              onChange={() => onChange(r.code)}
            />
            <Flag code={r.code} decorative />
            {r.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface MultiProps {
  label: string;
  value: readonly HomeRegionCode[];
  onChange: (value: HomeRegionCode[]) => void;
  disabled?: boolean;
}

/** Pick which countries' jokes are in play. At least one must stay selected. */
export function RegionMultiSelect({ label, value, onChange, disabled = false }: MultiProps) {
  const toggle = (code: HomeRegionCode) => {
    const next = value.includes(code) ? value.filter((c) => c !== code) : [...value, code];
    if (next.length > 0) onChange(next);
  };
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-sm font-medium text-slate-700">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {REGIONS.map((r) => {
          const on = value.includes(r.code);
          return (
            <button
              key={r.code}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(r.code)}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-500 disabled:opacity-60 ${
                on ? "border-amber-400 bg-amber-50 text-slate-900" : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              <Flag code={r.code} decorative /> {r.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">Pan-African prompts are always included.</p>
    </fieldset>
  );
}
