import type { PlayerView, RoomView } from "@afro-party/game-core";

export function playerName(view: RoomView, id: string): string {
  return view.players.find((p) => p.id === id)?.name ?? "Someone";
}

export function rankedPlayers(players: readonly PlayerView[]): PlayerView[] {
  return [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function roomUrl(code: string): string {
  if (typeof window === "undefined") return `/room/${code}`;
  return `${window.location.origin}/room/${code}`;
}

export function whatsappShareUrl(code: string): string {
  const text = `Come and play Wetin You Talk? with us! Room code ${code}: ${roomUrl(code)}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Deadline of the current phase, if it has one. */
export function phaseDeadline(view: RoomView): number | null {
  return "deadline" in view.phase ? view.phase.deadline : null;
}
