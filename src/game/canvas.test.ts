import { describe, expect, it } from "vitest";
import { MAX_OPS, opKey } from "./canvas";
import { apply } from "./rules";
import { T0, deps, drawerOf, lobby, must } from "./testkit";
import type { GameState } from "./types";

const drawing = (): GameState => {
  const s = must(lobby(["a", "b"]), "a", { type: "START" });
  return must(s, drawerOf(s), { type: "PICK", index: 0 });
};
const line = (stroke: number, pts = [1, 2, 3, 4]) => ({ type: "STROKE" as const, stroke, color: 0, size: 1, pts });
const strokesOf = (s: GameState) => Object.keys(s.ops).sort().map((k) => s.ops[k]?.stroke);

describe("canvas", () => {
  it("ops are keyed by zero-padded seq and keep their stroke", () => {
    let s = drawing();
    s = must(s, "a", line(1));
    s = must(s, "a", { type: "FILL", stroke: 2, color: 4, x: 10, y: 20 });
    expect(Object.keys(s.ops)).toEqual([opKey(1), opKey(2)]);
    expect(opKey(42)).toBe("000042");
    expect(s.ops["000002"]).toEqual({ seq: 2, stroke: 2, kind: "fill", color: 4, size: 0, pts: [10, 20] });
  });

  it("canvas ops don't bump the room seq (the player view must not change per chunk)", () => {
    const s = drawing();
    expect(must(s, "a", line(1)).seq).toBe(s.seq);
  });

  it("only the drawer draws, only while drawing; odd point lists are refused", () => {
    const s = drawing();
    expect(apply(s, "b", line(1), deps(T0))).toEqual({ ok: false, error: "not-drawer" });
    expect(apply(s, "a", line(1, [1, 2, 3]), deps(T0))).toEqual({ ok: false, error: "bad-points" });
    const picking = must(lobby(["a", "b"]), "a", { type: "START" });
    expect(apply(picking, "a", line(1), deps(T0))).toEqual({ ok: false, error: "not-drawer" });
  });

  it("undo removes the last stroke's chunks only", () => {
    let s = drawing();
    for (const st of [1, 1, 2, 2, 2]) s = must(s, "a", line(st));
    s = must(s, "a", { type: "UNDO" });
    expect(strokesOf(s)).toEqual([1, 1]);
    s = must(s, "a", { type: "UNDO" });
    expect(strokesOf(s)).toEqual([]);
    expect(must(s, "a", { type: "UNDO" }).ops).toEqual({});
  });

  it("undo after a reused stroke id removes only the trailing run", () => {
    let s = drawing();
    for (const st of [0, 1, 0]) s = must(s, "a", line(st));
    expect(strokesOf(must(s, "a", { type: "UNDO" }))).toEqual([0, 1]);
  });

  it("clear empties the canvas; a new turn starts empty", () => {
    let s = must(drawing(), "a", line(1));
    expect(must(s, "a", { type: "CLEAR" }).ops).toEqual({});
    s = must(s, "a", { type: "SKIP" });
    s = must(s, "a", { type: "SKIP" });
    expect(s.ops).toEqual({});
    expect(s.canvasTurn).toBe(2);
  });

  it("a turn's drawing is capped", () => {
    let s = drawing();
    const ops: GameState["ops"] = {};
    for (let i = 1; i <= MAX_OPS; i++) ops[opKey(i)] = { seq: i, stroke: 1, kind: "line", color: 0, size: 0, pts: [0, 0] };
    s = { ...s, ops, opSeq: MAX_OPS };
    expect(apply(s, "a", line(2), deps(T0))).toEqual({ ok: false, error: "canvas-full" });
  });
});
