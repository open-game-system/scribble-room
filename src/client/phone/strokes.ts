// The drawer's local strokes: drawn at once on an overlay, dropped when the room echoes them back on the
// canvas socket (the base canvas then shows them), or after a grace period (lost on a dropped socket: the
// base canvas is the truth). Pure.
import type { Op } from "../../shared/protocol";

export type LocalStroke = {
  id: number;
  color: number;
  size: number;
  /** Interleaved x,y in CANVAS units, as drawn (unrounded). */
  pts: number[];
  /** STROKE chunks sent for this stroke so far. */
  chunks: number;
  /** ms when the finger lifted; null while drawing. */
  endedAt: number | null;
};

/** How long a finished stroke may wait for its echo before the overlay lets go of it. */
export const ECHO_GRACE_MS = 3000;

/** Ops already in the room for each stroke id. */
export function opsPerStroke(ops: Readonly<Record<string, Op>>): Map<number, number> {
  const n = new Map<number, number>();
  for (const op of Object.values(ops)) n.set(op.stroke, (n.get(op.stroke) ?? 0) + 1);
  return n;
}

/** Keeps the strokes the base canvas does not show yet. */
export function settle(locals: readonly LocalStroke[], ops: Readonly<Record<string, Op>>, now: number, grace = ECHO_GRACE_MS): LocalStroke[] {
  const seen = opsPerStroke(ops);
  return locals.filter((s) => {
    if (s.endedAt === null) return true;
    if ((seen.get(s.id) ?? 0) >= s.chunks) return false;
    return now - s.endedAt < grace;
  });
}

/** The next stroke id: above every id this phone used this turn and every id already on the canvas. */
export function nextStrokeId(ops: Readonly<Record<string, Op>>, used: number): number {
  let max = used;
  for (const op of Object.values(ops)) if (op.stroke + 1 > max) max = op.stroke + 1;
  return Math.min(max, 65535);
}

/** Undo removes the newest stroke: locally, the newest local one (if any) goes too. */
export const dropNewest = (locals: readonly LocalStroke[]): LocalStroke[] => locals.slice(0, -1);
