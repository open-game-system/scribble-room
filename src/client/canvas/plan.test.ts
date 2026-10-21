import { describe, expect, it } from "vitest";
import { planRender, sortedKeys } from "./plan";

describe("render plan", () => {
  it("sorts op keys numerically even if a key is not padded", () => {
    expect(sortedKeys({ "000010": 1, "000002": 2, "9": 3 })).toEqual(["000002", "9", "000010"]);
  });

  it("draws only the new keys when what is on screen is a prefix", () => {
    expect(planRender({ turn: 3, keys: ["1", "2"] }, 3, ["1", "2", "3", "4"])).toEqual({ reset: false, draw: ["3", "4"] });
  });

  it("redraws everything after an undo or a clear (a drawn key vanished)", () => {
    expect(planRender({ turn: 3, keys: ["1", "2", "3"] }, 3, ["1", "2"])).toEqual({ reset: true, draw: ["1", "2"] });
    expect(planRender({ turn: 3, keys: ["1", "2"] }, 3, [])).toEqual({ reset: true, draw: [] });
  });

  it("starts fresh on a new turn", () => {
    expect(planRender({ turn: 3, keys: ["1"] }, 4, ["1"])).toEqual({ reset: true, draw: ["1"] });
  });

  it("nothing to do when nothing changed", () => {
    expect(planRender({ turn: 3, keys: ["1"] }, 3, ["1"])).toEqual({ reset: false, draw: [] });
  });
});
