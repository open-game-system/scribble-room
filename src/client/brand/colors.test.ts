import { describe, expect, it } from "vitest";
import { PALETTE, TEAMS } from "../../config";
import { CHIP_HUES, INK, TEAM_COLORS, contrast, initials, playerHue, readableOn } from "./colors";

describe("brand colours", () => {
  it("has one colour per team, each with readable text (>= 3:1, large text)", () => {
    expect(TEAM_COLORS).toHaveLength(TEAMS.length);
    for (const t of TEAM_COLORS) expect(contrast(t.bg, t.text)).toBeGreaterThanOrEqual(3);
  });

  it("keeps ink initials readable on every chip hue (>= 7:1)", () => {
    for (const h of CHIP_HUES) expect(contrast(h, INK)).toBeGreaterThanOrEqual(7);
  });

  it("keeps the drawing palette at 12 distinct colours, ink first and white second", () => {
    expect(PALETTE).toHaveLength(12);
    expect(new Set(PALETTE).size).toBe(12);
    expect(PALETTE[1]).toBe("#ffffff");
    expect(contrast(PALETTE[0], "#ffffff")).toBeGreaterThan(15);
  });

  it("picks a stable chip hue per id", () => {
    expect(playerHue("abc")).toBe(playerHue("abc"));
    expect(CHIP_HUES).toContain(playerHue("p-42"));
    const spread = new Set(Array.from({ length: 60 }, (_, i) => playerHue(`player-${i}`)));
    expect(spread.size).toBeGreaterThan(8);
  });

  it("picks ink on light and white on dark", () => {
    expect(readableOn("#ffd400")).toBe(INK);
    expect(readableOn("#1e1b4b")).toBe("#ffffff");
  });

  it("makes initials", () => {
    expect(initials("Ana Ruiz")).toBe("AR");
    expect(initials("  ben ")).toBe("BE");
    expect(initials("Mary Jo Smith")).toBe("MS");
    expect(initials("")).toBe("?");
  });
});
