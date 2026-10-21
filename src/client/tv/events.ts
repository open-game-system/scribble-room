// What just happened, derived from two consecutive TV views (no events on the wire for the TV).
// Pure: the TV page turns these into sounds and one-shot animations.
import type { SfxName } from "../audio-notes";
import type { Phase, TvView } from "../../shared/protocol";
import { URGENT_SECONDS, revealedCount } from "./derive";

export type TvEvent =
  | { type: "phase"; from: Phase; to: Phase }
  | { type: "correct"; seq: number; playerId: string; name: string; points: string }
  | { type: "wrong"; seq: number }
  | { type: "join"; playerId: string }
  | { type: "hint" };

type Diffable = Pick<TvView, "phase" | "turn" | "feed" | "players" | "mask">;

const maxSeq = (feed: Diffable["feed"]): number => feed.reduce((m, f) => Math.max(m, f.seq), -1);

/**
 * Events between `prev` and `next`. The first view (prev null, e.g. after a refresh) yields nothing:
 * the TV never replays history.
 */
export function diffEvents(prev: Diffable | null, next: Diffable): TvEvent[] {
  if (!prev) return [];
  const out: TvEvent[] = [];
  if (prev.phase !== next.phase) out.push({ type: "phase", from: prev.phase, to: next.phase });
  const seen = maxSeq(prev.feed);
  for (const f of next.feed) {
    if (f.seq <= seen) continue;
    if (f.kind === "correct") out.push({ type: "correct", seq: f.seq, playerId: f.playerId, name: f.name, points: f.text });
    else if (f.kind === "guess") out.push({ type: "wrong", seq: f.seq });
  }
  const before = new Set(prev.players.map((p) => p.id));
  for (const p of next.players) if (!before.has(p.id)) out.push({ type: "join", playerId: p.id });
  if (prev.phase === "drawing" && next.phase === "drawing" && prev.turn === next.turn && revealedCount(next.mask) > revealedCount(prev.mask)) {
    out.push({ type: "hint" });
  }
  return out;
}

/** The sound for an event (null = silent). `reason` is the finished turn's reason, for the reveal. */
export function soundFor(e: TvEvent, reason: string | null): SfxName | null {
  switch (e.type) {
    case "correct":
      return "correct";
    case "join":
      return "join";
    case "hint":
      return "pick";
    case "wrong":
      return null;
    case "phase":
      if (e.to === "reveal") return reason === "all-guessed" ? "allGuessed" : reason === "time" ? "timeUp" : "reveal";
      if (e.to === "podium") return "podium";
      if (e.to === "drawing") return "roundStart";
      return null;
  }
}

/** The second to tick for (counting down the last 10 s of drawing), or null. Fires once per second. */
export function tickFor(phase: Phase, prevSeconds: number, seconds: number): number | null {
  if (phase !== "drawing") return null;
  if (seconds === prevSeconds || seconds <= 0 || seconds > URGENT_SECONDS) return null;
  return seconds;
}
