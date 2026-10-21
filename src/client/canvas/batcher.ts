// Turns a finger's path into compact STROKE chunks: integer canvas coordinates, close points dropped,
// at most `maxPoints` per chunk. Each chunk after the first starts at the previous chunk's last point,
// so the chunks join up when drawn one by one. The page calls flush() on a ~50 ms timer while drawing.
import { CANVAS } from "../../config";

export type Pt = { x: number; y: number };
export type Chunk = { stroke: number; color: number; size: number; pts: number[] };

type Open = { stroke: number; color: number; size: number; pending: Pt[]; last: Pt; carry: Pt | null; tail?: Pt | undefined };

const clampRound = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)));
const snap = (p: Pt): Pt => ({ x: clampRound(p.x, CANVAS.w), y: clampRound(p.y, CANVAS.h) });
const flat = (pts: Pt[]) => pts.flatMap((p) => [p.x, p.y]);

export function createBatcher(opts: { send: (c: Chunk) => void; maxPoints?: number; minDist?: number }) {
  const maxPoints = opts.maxPoints ?? 64;
  const minDist = opts.minDist ?? 2;
  let open: Open | null = null;

  function emit(o: Open) {
    if (o.pending.length === 0) return;
    const pts = o.carry ? [o.carry, ...o.pending] : o.pending;
    opts.send({ stroke: o.stroke, color: o.color, size: o.size, pts: flat(pts) });
    o.carry = o.pending[o.pending.length - 1] ?? o.carry;
    o.pending = [];
  }

  function push(o: Open, p: Pt) {
    o.pending.push(p);
    o.last = p;
    if (o.pending.length + (o.carry ? 1 : 0) >= maxPoints) emit(o);
  }

  return {
    begin(stroke: number, color: number, size: number, at: Pt) {
      const p = snap(at);
      open = { stroke, color, size, pending: [p], last: p, carry: null };
    },
    move(at: Pt) {
      if (!open) return;
      const p = snap(at);
      if (Math.hypot(p.x - open.last.x, p.y - open.last.y) < minDist) {
        open.tail = p;
        return;
      }
      open.tail = undefined;
      push(open, p);
    },
    flush() {
      if (open) emit(open);
    },
    end() {
      if (!open) return;
      if (open.tail) push(open, open.tail);
      emit(open);
      open = null;
    },
  };
}
