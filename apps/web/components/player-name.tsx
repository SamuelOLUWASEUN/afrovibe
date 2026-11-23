import { avatarEmoji, nameColorHex, type HomeRegionCode, type PlayerCosmetics } from "@afro-party/game-core";
import { Flag } from "./flag";

/** Avatar + coloured name + level, everywhere a player is shown. */
export function PlayerName({
  name,
  homeRegion,
  cosmetics,
  showLevel = true,
  isBot = false,
  className = "",
}: {
  name: string;
  homeRegion: HomeRegionCode;
  cosmetics: PlayerCosmetics;
  showLevel?: boolean;
  /** Computer players always say so, wherever their name appears. */
  isBot?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <span aria-hidden className="shrink-0">
        {avatarEmoji(cosmetics.avatarId)}
      </span>
      <span className="min-w-[4ch] truncate font-semibold" style={{ color: nameColorHex(cosmetics.nameColorId) }}>
        {name}
      </span>
      <Flag code={homeRegion} />
      {isBot ? (
        <span className="shrink-0 rounded-md bg-sky-100 px-1.5 text-[0.7em] font-bold whitespace-nowrap text-sky-800">
          🤖 Bot
        </span>
      ) : showLevel && (
        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 text-[0.7em] font-bold whitespace-nowrap text-slate-600 tabular-nums">
          Lv {cosmetics.level}
        </span>
      )}
    </span>
  );
}
