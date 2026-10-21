// Which phone screen a player view shows. Pure.
import type { Phase } from "../../shared/protocol";

export type Screen = "lobby" | "pick" | "choosing" | "draw" | "guess" | "reveal" | "podium";

export function screenFor(v: { phase: Phase; me: { isDrawer: boolean } }): Screen {
  switch (v.phase) {
    case "lobby":
      return "lobby";
    case "picking":
      return v.me.isDrawer ? "pick" : "choosing";
    case "drawing":
      return v.me.isDrawer ? "draw" : "guess";
    case "reveal":
      return "reveal";
    case "podium":
      return "podium";
  }
}

/** The host's Skip drawing control shows while a turn is being chosen or drawn. */
export const canSkip = (v: { phase: Phase; me: { isHost: boolean } }): boolean =>
  v.me.isHost && (v.phase === "picking" || v.phase === "drawing");
