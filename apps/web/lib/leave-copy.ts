import type { RoomView } from "@afro-party/game-core";

export interface LeaveCopy {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
}

/**
 * What leaving actually costs depends on when you do it, so the warning says
 * exactly that instead of a generic "are you sure?". Pure function, easy to test.
 */
export function leaveCopy(view: RoomView): LeaveCopy {
  const me = view.me;
  if (me.role === "host") {
    return {
      title: "Close this screen?",
      body: "The room stays open and the game carries on on everyone's phones. The VIP can still run it.",
      confirm: "Close screen",
      cancel: "Keep showing",
    };
  }

  const player = view.players.find((p) => p.id === me.id);
  const vipNote = me.isVip && view.players.length > 1 ? " The next player will become the VIP." : "";
  const phase = view.phase.kind;

  if (phase === "lobby") {
    return {
      title: "Leave this room?",
      body: `You can rejoin with code ${view.code} as long as the game hasn't started.${vipNote}`,
      confirm: "Leave room",
      cancel: "Stay",
    };
  }
  if (phase === "final") {
    return {
      title: "Leave the room?",
      body: `Your rewards from this game are already saved.${vipNote}`,
      confirm: "Leave",
      cancel: "Stay",
    };
  }
  const points = player?.score ?? 0;
  const pointsText = points > 0 ? `your ${points.toLocaleString("en-GB")} points` : "your points";
  return {
    title: "Leave mid-game?",
    body: `You'll lose ${pointsText} and won't earn XP, coins or badges for this game. You can't rejoin until it ends, and the others will carry on without you.${vipNote}`,
    confirm: "Leave game",
    cancel: "Keep playing",
  };
}
