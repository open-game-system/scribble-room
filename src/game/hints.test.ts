import { describe, expect, it } from "vitest";
import { hintCount, hintOrder, hintTimes, letterPositions, maskOf, planHints } from "./hints";
import { seeded } from "./rng";

describe("hints", () => {
  it("spaces, hyphens and apostrophes always show", () => {
    expect(maskOf("ice cream", [])).toBe("___ _____");
    expect(maskOf("jack-o'-lantern", [])).toBe("____-_'-_______");
    expect(letterPositions("a b")).toEqual([0, 2]);
  });

  it("revealed letters show in the mask", () => {
    expect(maskOf("cat", [1])).toBe("_a_");
    expect(maskOf("ice cream", [4, 0])).toBe("i__ c____");
  });

  it("the count is 35% of the letters, between 1 and 4, none under 3 letters", () => {
    expect(hintCount(2)).toBe(0);
    expect(hintCount(3)).toBe(1);
    expect(hintCount(5)).toBe(1);
    expect(hintCount(6)).toBe(2);
    expect(hintCount(9)).toBe(3);
    expect(hintCount(12)).toBe(4);
    expect(hintCount(30)).toBe(4);
  });

  it("hints are evenly spaced from 35% to 85% of the draw time", () => {
    expect(hintTimes(1000, 100_000, 1)).toEqual([36_000]);
    expect(hintTimes(0, 100_000, 2)).toEqual([35_000, 85_000]);
    expect(hintTimes(0, 100_000, 3)).toEqual([35_000, 60_000, 85_000]);
  });

  it("picks distinct letters, never a space, and never the last hidden letter", () => {
    for (let seed = 1; seed < 40; seed++) {
      const word = "ice cream cone";
      const order = hintOrder(word, hintCount(letterPositions(word).length), seeded(seed));
      expect(new Set(order).size).toBe(order.length);
      for (const i of order) expect(word[i]).not.toBe(" ");
      expect(maskOf(word, order)).toContain("_");
    }
    expect(maskOf("cat", hintOrder("cat", hintCount(3), seeded(3)))).toMatch(/_/);
  });

  it("is repeatable for a seed", () => {
    expect(hintOrder("elephant", 2, seeded(7))).toEqual(hintOrder("elephant", 2, seeded(7)));
  });

  it("hints off: no plan, the mask stays all underscores", () => {
    expect(planHints("elephant", 0, 80_000, false, seeded(1))).toEqual({ hintIdx: [], hintAt: [] });
    const on = planHints("elephant", 0, 80_000, true, seeded(1));
    expect(on.hintIdx).toHaveLength(2);
    expect(on.hintAt).toEqual([28_000, 68_000]);
  });
});
