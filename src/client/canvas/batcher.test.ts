import { describe, expect, it } from "vitest";
import { createBatcher } from "./batcher";

type Sent = { stroke: number; color: number; size: number; pts: number[] };

function rig(opts: { maxPoints?: number; minDist?: number } = {}) {
  const sent: Sent[] = [];
  const b = createBatcher({ send: (c) => sent.push(c), maxPoints: opts.maxPoints ?? 4, minDist: opts.minDist ?? 0 });
  return { b, sent };
}

describe("stroke batcher", () => {
  it("a tap sends one dot (the point twice is not needed: a single x,y pair)", () => {
    const { b, sent } = rig();
    b.begin(1, 0, 2, { x: 10, y: 20 });
    b.end();
    expect(sent).toEqual([{ stroke: 1, color: 0, size: 2, pts: [10, 20] }]);
  });

  it("flushes on maxPoints and the next chunk starts at the previous chunk's last point", () => {
    const { b, sent } = rig({ maxPoints: 3 });
    b.begin(7, 3, 1, { x: 0, y: 0 });
    b.move({ x: 1, y: 1 });
    b.move({ x: 2, y: 2 });
    b.move({ x: 3, y: 3 });
    b.end();
    expect(sent).toEqual([
      { stroke: 7, color: 3, size: 1, pts: [0, 0, 1, 1, 2, 2] },
      { stroke: 7, color: 3, size: 1, pts: [2, 2, 3, 3] },
    ]);
  });

  it("flush() sends what is pending (the timer calls it) and keeps the stroke going", () => {
    const { b, sent } = rig({ maxPoints: 64 });
    b.begin(1, 0, 0, { x: 5, y: 5 });
    b.move({ x: 6, y: 6 });
    b.flush();
    b.move({ x: 7, y: 7 });
    b.end();
    expect(sent.map((s) => s.pts)).toEqual([
      [5, 5, 6, 6],
      [6, 6, 7, 7],
    ]);
  });

  it("flush with nothing new sends nothing", () => {
    const { b, sent } = rig();
    b.begin(1, 0, 0, { x: 5, y: 5 });
    b.flush();
    b.flush();
    expect(sent.map((s) => s.pts)).toEqual([[5, 5]]);
    b.end();
    expect(sent).toHaveLength(1);
  });

  it("drops points closer than minDist to the last kept point, but always keeps the end point", () => {
    const { b, sent } = rig({ maxPoints: 64, minDist: 3 });
    b.begin(1, 0, 0, { x: 0, y: 0 });
    b.move({ x: 1, y: 0 });
    b.move({ x: 4, y: 0 });
    b.move({ x: 5, y: 0 });
    b.end();
    expect(sent[0]?.pts).toEqual([0, 0, 4, 0, 5, 0]);
  });

  it("rounds and clamps coordinates to the canvas", () => {
    const { b, sent } = rig({ maxPoints: 64 });
    b.begin(1, 0, 0, { x: -4.4, y: 2.6 });
    b.move({ x: 99999, y: 10.2 });
    b.end();
    expect(sent[0]?.pts).toEqual([0, 3, 1200, 10]);
  });

  it("moves without a begun stroke are ignored", () => {
    const { b, sent } = rig();
    b.move({ x: 1, y: 1 });
    b.end();
    b.flush();
    expect(sent).toEqual([]);
  });
});
