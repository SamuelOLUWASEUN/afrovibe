import { regionInfo, type HomeRegionCode } from "@afro-party/game-core";
import Image from "next/image";

/**
 * Country flag as a bundled SVG (from flag-icons, MIT — see /flags/license-flag-icons.txt).
 * Emoji flags don't render on Windows (they show as "NG", "GH"…), so never use them in the UI.
 */
export function Flag({
  code,
  className = "h-[0.9em]",
  decorative = false,
}: {
  code: HomeRegionCode;
  /** Height via Tailwind; width follows the 4:3 ratio. */
  className?: string;
  /** True when the country name is already written next to the flag. */
  decorative?: boolean;
}) {
  return (
    <Image
      src={`/flags/${code}.svg`}
      alt={decorative ? "" : regionInfo(code).label}
      width={20}
      height={15}
      unoptimized
      className={`inline-block w-auto shrink-0 rounded-[2px] align-[-0.1em] ring-1 ring-slate-900/10 ${className}`}
    />
  );
}
