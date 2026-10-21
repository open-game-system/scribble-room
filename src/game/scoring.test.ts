import { describe, expect, it } from "vitest";
import { drawerPoints, guesserPoints, round5 } from "./scoring";

describe("scoring", () => {
  it("rounds to the nearest 5", () => {
    expect(round5(242)).toBe(240);
    expect(round5(243)).toBe(245);
    expect(round5(0)).toBe(0);
  });

  it("a guesser earns 100 to 300 by time left, the first one +50", () => {
    expect(guesserPoints(80_000, 80_000, false)).toBe(300);
    expect(guesserPoints(0, 80_000, false)).toBe(100);
    expect(guesserPoints(40_000, 80_000, false)).toBe(200);
    expect(guesserPoints(40_000, 80_000, true)).toBe(250);
    expect(guesserPoints(56_000, 80_000, false)).toBe(240); // 100 + 140
    expect(guesserPoints(57_000, 80_000, false)).toBe(245); // 100 + 142.5→143 → 245
  });

  it("time left is clamped to the draw time", () => {
    expect(guesserPoints(-5, 80_000, false)).toBe(100);
    expect(guesserPoints(99_000, 80_000, false)).toBe(300);
    expect(guesserPoints(1000, 0, false)).toBe(100);
  });

  it("the drawer earns by the share who got it, nothing when nobody did", () => {
    expect(drawerPoints(3, 3)).toBe(300);
    expect(drawerPoints(1, 3)).toBe(100);
    expect(drawerPoints(2, 3)).toBe(200);
    expect(drawerPoints(1, 7)).toBe(45); // 42.86 → 43 → 45
    expect(drawerPoints(0, 3)).toBe(0);
    expect(drawerPoints(2, 0)).toBe(0);
    expect(drawerPoints(5, 3)).toBe(300);
  });
});
