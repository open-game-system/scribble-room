// The drawing: ops in a record keyed by zero-padded seq. Canvas ops never bump `seq` (the player view
// must not change on every stroke chunk). Pure.
import type { Op } from "../shared/protocol";
import { type GameState, type RuleResult, ok, refuse } from "./types";

/** Caps one turn's drawing (each op ≤ 64 points); the state is persisted whole on every change. */
export const MAX_OPS = 1500;

export const opKey = (seq: number): string => String(seq).padStart(6, "0");

export const canDraw = (s: GameState, caller: string): boolean => s.phase === "drawing" && s.current?.drawerId === caller;

function addOp(s: GameState, op: Omit<Op, "seq">): RuleResult {
  if (Object.keys(s.ops).length >= MAX_OPS) return refuse("canvas-full");
  const seq = s.opSeq + 1;
  return ok({ ...s, opSeq: seq, ops: { ...s.ops, [opKey(seq)]: { ...op, seq } } });
}

export type StrokeChunk = { stroke: number; color: number; size: number; pts: number[] };

export function stroke(s: GameState, caller: string, c: StrokeChunk): RuleResult {
  if (!canDraw(s, caller)) return refuse("not-drawer");
  if (c.pts.length % 2 !== 0 || c.pts.length < 2) return refuse("bad-points");
  return addOp(s, { stroke: c.stroke, kind: "line", color: c.color, size: c.size, pts: c.pts });
}

export function fill(s: GameState, caller: string, f: { stroke: number; color: number; x: number; y: number }): RuleResult {
  if (!canDraw(s, caller)) return refuse("not-drawer");
  return addOp(s, { stroke: f.stroke, kind: "fill", color: f.color, size: 0, pts: [f.x, f.y] });
}

/** Removes the last stroke: the trailing run of ops sharing the newest op's stroke id. */
export function undo(s: GameState, caller: string): RuleResult {
  if (!canDraw(s, caller)) return refuse("not-drawer");
  const keys = Object.keys(s.ops).sort();
  const last = s.ops[keys[keys.length - 1] ?? ""];
  if (!last) return ok(s);
  const ops = { ...s.ops };
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i] ?? "";
    if (ops[k]?.stroke !== last.stroke) break;
    delete ops[k];
  }
  return ok({ ...s, ops });
}

export function clear(s: GameState, caller: string): RuleResult {
  if (!canDraw(s, caller)) return refuse("not-drawer");
  return ok({ ...s, ops: {} });
}
