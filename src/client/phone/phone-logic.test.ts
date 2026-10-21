import { describe, expect, it } from "vitest";
import { CANVAS } from "../../config";
import type { Op, Seat, Settings, TurnResult } from "../../shared/protocol";
import { fitSheet, fitSize, toCanvas, toCanvasInt } from "./geometry";
import { DRAW_TIMES, maxTeamsFor, settingsLine, sittingLabel, startBlock, stepIn, teamsOffered } from "./lobby-rules";
import { isFresh, noticeText, pointsIn, toneOf } from "./notices";
import { canSkip, screenFor } from "./route";
import { gainOf, guessersOf, ordinal, placeOf, rank, reasonLine, teamWinner } from "./standings";
import { ECHO_GRACE_MS, type LocalStroke, dropNewest, nextStrokeId, opsPerStroke, settle } from "./strokes";

const seat = (id: string, score = 0, extra: Partial<Seat> = {}): Seat => ({
  id,
  name: id.toUpperCase(),
  avatar: "",
  hue: 0,
  score,
  team: "",
  connected: true,
  guessed: false,
  ...extra,
});
const settings = (s: Partial<Settings> = {}): Settings => ({ mode: "classic", rounds: 2, drawSeconds: 80, difficulty: "mixed", hints: true, teamCount: 2, ...s });
const op = (seq: number, stroke: number): Op => ({ seq, stroke, kind: "line", color: 0, size: 0, pts: [0, 0, 1, 1] });
const opsOf = (...list: Op[]): Record<string, Op> => Object.fromEntries(list.map((o) => [String(o.seq).padStart(6, "0"), o]));
const local = (id: number, chunks: number, endedAt: number | null): LocalStroke => ({ id, color: 0, size: 0, pts: [1, 1], chunks, endedAt });

describe("screenFor", () => {
  it("routes every phase by role", () => {
    expect(screenFor({ phase: "lobby", me: { isDrawer: false } })).toBe("lobby");
    expect(screenFor({ phase: "picking", me: { isDrawer: true } })).toBe("pick");
    expect(screenFor({ phase: "picking", me: { isDrawer: false } })).toBe("choosing");
    expect(screenFor({ phase: "drawing", me: { isDrawer: true } })).toBe("draw");
    expect(screenFor({ phase: "drawing", me: { isDrawer: false } })).toBe("guess");
    expect(screenFor({ phase: "reveal", me: { isDrawer: true } })).toBe("reveal");
    expect(screenFor({ phase: "podium", me: { isDrawer: false } })).toBe("podium");
  });
  it("offers Skip drawing only to the host, only while a word is picked or drawn", () => {
    expect(canSkip({ phase: "drawing", me: { isHost: true } })).toBe(true);
    expect(canSkip({ phase: "picking", me: { isHost: true } })).toBe(true);
    expect(canSkip({ phase: "drawing", me: { isHost: false } })).toBe(false);
    expect(canSkip({ phase: "lobby", me: { isHost: true } })).toBe(false);
    expect(canSkip({ phase: "reveal", me: { isHost: true } })).toBe(false);
    expect(canSkip({ phase: "podium", me: { isHost: true } })).toBe(false);
  });
});

describe("notices", () => {
  it("is fresh only when the seq changed", () => {
    expect(isFresh(3, null)).toBe(false);
    expect(isFresh(3, { kind: "close", text: "So close!", seq: 3 })).toBe(false);
    expect(isFresh(3, { kind: "close", text: "So close!", seq: 4 })).toBe(true);
    expect(isFresh(-1, { kind: "close", text: "", seq: 0 })).toBe(true);
  });
  it("tones: close is yellow, correct is green, the rest info", () => {
    expect(toneOf("close")).toBe("close");
    expect(toneOf("correct")).toBe("correct");
    expect(toneOf("not-host")).toBe("info");
  });
  it("reads refusal codes as sentences and keeps the room's correct text", () => {
    expect(noticeText({ kind: "correct", text: "You got it! +240", seq: 1 })).toBe("You got it! +240");
    expect(noticeText({ kind: "correct", text: "", seq: 1 })).toBe("You got it!");
    expect(noticeText({ kind: "close", text: "So close!", seq: 1 })).toBe("So close!");
    expect(noticeText({ kind: "not-host", text: "not-host", seq: 1 })).toBe("Only the host can do that.");
    expect(noticeText({ kind: "x", text: "A real sentence here", seq: 1 })).toBe("A real sentence here");
    expect(noticeText({ kind: "weird-code", text: "weird-code", seq: 1 })).toBe("That didn't work. Try again.");
  });
  it("pulls the points out of the correct notice", () => {
    expect(pointsIn("You got it! +240")).toBe(240);
    expect(pointsIn("You got it!")).toBeNull();
  });
});

describe("geometry", () => {
  it("fits a 4:3 sheet into a wide or tall box", () => {
    expect(fitSheet({ w: 400, h: 600 })).toEqual({ w: 400, h: 300 });
    expect(fitSheet({ w: 800, h: 300 })).toEqual({ w: 400, h: 300 });
    expect(fitSheet({ w: 0, h: 300 })).toEqual({ w: 0, h: 0 });
    expect(fitSheet({ w: -5, h: 300 })).toEqual({ w: 0, h: 0 });
  });
  it("maps a pointer into canvas units and clamps it to the sheet", () => {
    const rect = { left: 10, top: 20, width: 300, height: 225 };
    expect(toCanvas(rect, 10, 20)).toEqual({ x: 0, y: 0 });
    expect(toCanvas(rect, 310, 245)).toEqual({ x: CANVAS.w, y: CANVAS.h });
    expect(toCanvas(rect, 160, 132.5)).toEqual({ x: CANVAS.w / 2, y: CANVAS.h / 2 });
    expect(toCanvas(rect, -50, 900)).toEqual({ x: 0, y: CANVAS.h });
    expect(toCanvas({ left: 0, top: 0, width: 0, height: 0 }, 5, 5)).toEqual({ x: 0, y: 0 });
  });
  it("rounds fill points to whole canvas units", () => {
    expect(toCanvasInt({ left: 0, top: 0, width: 7, height: 7 }, 1, 1)).toEqual({ x: Math.round(CANVAS.w / 7), y: Math.round(CANVAS.h / 7) });
  });
});

describe("fitSize", () => {
  it("keeps the base size when the word fits", () => {
    expect(fitSize(56, 300, 200, 14)).toBe(56);
    expect(fitSize(56, 300, 300, 14)).toBe(56);
    expect(fitSize(56, 300, 0, 14)).toBe(56);
  });
  it("scales a too-wide word down to fit, with headroom", () => {
    const s = fitSize(56, 300, 400, 14);
    expect(s).toBeLessThan(42);
    expect(s).toBeGreaterThan(40);
    expect((400 * s) / 56).toBeLessThanOrEqual(300);
  });
  it("never goes below the minimum", () => {
    expect(fitSize(56, 100, 2000, 14)).toBe(14);
  });
});

describe("local strokes", () => {
  it("counts ops per stroke", () => {
    expect(opsPerStroke(opsOf(op(1, 0), op(2, 0), op(3, 1)))).toEqual(new Map([[0, 2], [1, 1]]));
  });
  it("keeps a stroke while drawing, drops it once every chunk is echoed", () => {
    const ops = opsOf(op(1, 4), op(2, 4));
    expect(settle([local(4, 2, null)], ops, 0)).toHaveLength(1);
    expect(settle([local(4, 2, 0)], ops, 10)).toHaveLength(0);
    expect(settle([local(4, 3, 0)], ops, 10)).toHaveLength(1);
  });
  it("lets go of an unechoed stroke after the grace period", () => {
    expect(settle([local(9, 1, 100)], {}, 100 + ECHO_GRACE_MS - 1)).toHaveLength(1);
    expect(settle([local(9, 1, 100)], {}, 100 + ECHO_GRACE_MS)).toHaveLength(0);
  });
  it("picks a stroke id above the ones used and the ones on the canvas", () => {
    expect(nextStrokeId({}, 0)).toBe(0);
    expect(nextStrokeId({}, 5)).toBe(5);
    expect(nextStrokeId(opsOf(op(1, 7)), 3)).toBe(8);
    expect(nextStrokeId(opsOf(op(1, 65535)), 3)).toBe(65535);
  });
  it("undo drops the newest local stroke", () => {
    expect(dropNewest([local(1, 1, 0), local(2, 1, 0)]).map((s) => s.id)).toEqual([1]);
    expect(dropNewest([])).toEqual([]);
  });
});

describe("standings", () => {
  it("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });
  it("ranks by score with shared places for ties", () => {
    const r = rank([seat("a", 10), seat("b", 30), seat("c", 10), seat("d", 5)]);
    expect(r.map((x) => [x.item.id, x.place])).toEqual([["b", 1], ["a", 2], ["c", 2], ["d", 4]]);
    expect(placeOf([seat("a", 10), seat("b", 30)], "a")).toBe(2);
    expect(placeOf([seat("a", 10)], "zz")).toBeNull();
  });
  it("says why a turn ended", () => {
    expect(reasonLine("all-guessed")).toBe("Everyone got it!");
    expect(reasonLine("time")).toBe("Time's up!");
    expect(reasonLine("skipped")).toBe("The host skipped this one.");
    expect(reasonLine("drawer-left")).toBe("The drawer left.");
    expect(reasonLine("?")).toBe("");
  });
  it("reads my gain and who guessed it", () => {
    const t: TurnResult = { turn: 1, word: "cat", drawerId: "a", gains: { a: 150, b: 240, c: 0 }, teamGains: {}, reason: "time" };
    expect(gainOf(t, "b")).toBe(240);
    expect(gainOf(t, "z")).toBe(0);
    expect(gainOf(null, "b")).toBe(0);
    expect(guessersOf(t, [seat("a"), seat("b"), seat("c")]).map((p) => p.id)).toEqual(["b"]);
    expect(guessersOf(null, [seat("a")])).toEqual([]);
  });
  it("names the winning team and its MVP", () => {
    const teams = [{ id: "t0", name: "Tangerine", score: 100 }, { id: "t1", name: "Teal", score: 300 }];
    const players = [seat("a", 50, { team: "t1" }), seat("b", 250, { team: "t1" }), seat("c", 100, { team: "t0" })];
    expect(teamWinner(teams, players)?.team.id).toBe("t1");
    expect(teamWinner(teams, players)?.mvp?.id).toBe("b");
    expect(teamWinner([], players)).toBeNull();
  });
});

describe("lobby", () => {
  it("steps through draw times and clamps at the ends", () => {
    expect(DRAW_TIMES[0]).toBe(40);
    expect(stepIn(DRAW_TIMES, 80, 1)).toBe(100);
    expect(stepIn(DRAW_TIMES, 80, -1)).toBe(60);
    expect(stepIn(DRAW_TIMES, 180, 1)).toBe(180);
    expect(stepIn(DRAW_TIMES, 40, -1)).toBe(40);
    expect(stepIn(DRAW_TIMES, 85, 1)).toBe(100);
    expect(stepIn(DRAW_TIMES, 85, -1)).toBe(80);
  });
  it("blocks Start under 2 connected players, with the reason", () => {
    expect(startBlock([seat("a")], settings())).toMatch(/at least 2 players \(1 here\)/);
    expect(startBlock([seat("a"), seat("b", 0, { connected: false })], settings())).toMatch(/1 here/);
    expect(startBlock([seat("a"), seat("b")], settings())).toBeNull();
  });
  it("blocks a teams start with an empty team", () => {
    const ps = [seat("a", 0, { team: "t0" }), seat("b", 0, { team: "t0" })];
    expect(startBlock(ps, settings({ mode: "teams" }))).toMatch(/Every team/);
    expect(startBlock([...ps, seat("c", 0, { team: "t1" })], settings({ mode: "teams" }))).toBeNull();
  });
  it("offers teams from 4 players, up to half the room", () => {
    expect(teamsOffered([seat("a"), seat("b"), seat("c")])).toBe(false);
    expect(teamsOffered([seat("a"), seat("b"), seat("c"), seat("d")])).toBe(true);
    expect(maxTeamsFor(3)).toBe(2);
    expect(maxTeamsFor(9)).toBe(4);
    expect(maxTeamsFor(40)).toBe(8);
  });
  it("labels the sitting for OGS", () => {
    expect(sittingLabel({ code: "K7QX", phase: "lobby", round: 0, settings: { rounds: 2 } })).toEqual({ status: "lobby", title: "Room K7QX · in the lobby" });
    expect(sittingLabel({ code: "K7QX", phase: "drawing", round: 1, settings: { rounds: 3 } })).toEqual({ status: "active", title: "Room K7QX · round 1 of 3" });
    expect(sittingLabel({ code: "K7QX", phase: "podium", round: 3, settings: { rounds: 3 } }).status).toBe("completed");
  });
  it("summarises the settings", () => {
    expect(settingsLine(settings())).toBe("Classic · 2 rounds · 80 s · mixed");
    expect(settingsLine(settings({ mode: "teams", teamCount: 3, rounds: 1, hints: false }))).toBe("3 teams · 1 round · 80 s · mixed · no hints");
  });
});
