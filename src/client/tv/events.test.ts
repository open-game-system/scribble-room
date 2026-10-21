import { describe, expect, it } from "vitest";
import type { TvView } from "../../shared/protocol";
import { diffEvents, soundFor, tickFor } from "./events";
import { fixture } from "./fixtures";

const NOW = 1_000_000;
const drawing = fixture("drawing", NOW);

const withFeed = (v: TvView, extra: TvView["feed"]): TvView => ({ ...v, feed: [...v.feed, ...extra] });

describe("diffEvents", () => {
  it("says nothing on the first view (a refresh never replays history)", () => {
    expect(diffEvents(null, drawing)).toEqual([]);
  });

  it("says nothing when nothing changed", () => {
    expect(diffEvents(drawing, { ...drawing })).toEqual([]);
  });

  it("reports a new correct guess with its points, never the word", () => {
    const next = withFeed(drawing, [{ seq: 40, kind: "correct", playerId: "p4", name: "Eli", text: "+150" }]);
    expect(diffEvents(drawing, next)).toEqual([{ type: "correct", seq: 40, playerId: "p4", name: "Eli", points: "+150" }]);
  });

  it("reports wrong guesses, and ignores info rows", () => {
    const next = withFeed(drawing, [
      { seq: 41, kind: "guess", playerId: "p4", name: "Eli", text: "boat" },
      { seq: 42, kind: "system", playerId: "", name: "", text: "Round 3" },
      { seq: 43, kind: "skip", playerId: "", name: "", text: "" },
    ]);
    expect(diffEvents(drawing, next)).toEqual([{ type: "wrong", seq: 41 }]);
  });

  it("only reports feed rows newer than any it saw, even after old rows scroll out", () => {
    const prev = { ...drawing, feed: drawing.feed.slice(-2) };
    const next = { ...drawing, feed: drawing.feed.slice(-1) };
    expect(diffEvents(prev, next)).toEqual([]);
  });

  it("reports a phase change", () => {
    expect(diffEvents(fixture("picking", NOW), { ...fixture("picking", NOW), phase: "drawing" })).toEqual([{ type: "phase", from: "picking", to: "drawing" }]);
  });

  it("reports joins", () => {
    const prev = fixture("lobby", NOW);
    const next = { ...prev, players: [...prev.players, { ...prev.players[0]!, id: "new", name: "Zed" }] };
    expect(diffEvents(prev, next)).toEqual([{ type: "join", playerId: "new" }]);
  });

  it("reports a hint letter within the same turn only", () => {
    const more = { ...drawing, mask: "l___t___s_" };
    expect(diffEvents(drawing, more)).toEqual([{ type: "hint" }]);
    expect(diffEvents(drawing, { ...more, turn: drawing.turn + 1 })).toEqual([]);
    expect(diffEvents({ ...drawing, phase: "picking" }, more)).toEqual([{ type: "phase", from: "picking", to: "drawing" }]);
  });
});

describe("soundFor", () => {
  it("maps events to the art agent's named SFX", () => {
    expect(soundFor({ type: "correct", seq: 1, playerId: "a", name: "A", points: "+1" }, null)).toBe("correct");
    expect(soundFor({ type: "join", playerId: "a" }, null)).toBe("join");
    expect(soundFor({ type: "hint" }, null)).toBe("pick");
    expect(soundFor({ type: "wrong", seq: 1 }, null)).toBeNull();
    expect(soundFor({ type: "phase", from: "picking", to: "drawing" }, null)).toBe("roundStart");
    expect(soundFor({ type: "phase", from: "drawing", to: "reveal" }, "all-guessed")).toBe("allGuessed");
    expect(soundFor({ type: "phase", from: "drawing", to: "reveal" }, "time")).toBe("timeUp");
    expect(soundFor({ type: "phase", from: "drawing", to: "reveal" }, "skipped")).toBe("reveal");
    expect(soundFor({ type: "phase", from: "reveal", to: "podium" }, null)).toBe("podium");
    expect(soundFor({ type: "phase", from: "reveal", to: "picking" }, null)).toBeNull();
  });
});

describe("tickFor", () => {
  it("ticks once per second in the last 10 s of drawing", () => {
    expect(tickFor("drawing", 11, 10)).toBe(10);
    expect(tickFor("drawing", 10, 10)).toBeNull();
    expect(tickFor("drawing", 4, 3)).toBe(3);
    expect(tickFor("drawing", 12, 11)).toBeNull();
    expect(tickFor("drawing", 1, 0)).toBeNull();
    expect(tickFor("picking", 6, 5)).toBeNull();
  });
});
