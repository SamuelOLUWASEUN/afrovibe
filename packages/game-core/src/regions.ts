import type { HomeRegionCode, Prompt, RoomSettings } from "./types.js";

export interface RegionInfo {
  code: HomeRegionCode;
  label: string;
  flag: string;
}

export const REGIONS: readonly RegionInfo[] = [
  { code: "ng", label: "Nigeria", flag: "🇳🇬" },
  { code: "gh", label: "Ghana", flag: "🇬🇭" },
  { code: "ke", label: "Kenya", flag: "🇰🇪" },
  { code: "za", label: "South Africa", flag: "🇿🇦" },
];

export function regionInfo(code: HomeRegionCode): RegionInfo {
  const found = REGIONS.find((r) => r.code === code);
  if (!found) throw new Error(`Unknown region ${code}`);
  return found;
}

/** A prompt is eligible if it is pan-African or tagged with any region in play. */
export function isPromptEligible(prompt: Prompt, settings: RoomSettings): boolean {
  if (settings.familyMode && !prompt.familySafe) return false;
  if (prompt.pack !== undefined && !settings.packs.includes(prompt.pack)) return false;
  return prompt.regions.some((r) => r === "pan" || (settings.regions as readonly string[]).includes(r));
}
