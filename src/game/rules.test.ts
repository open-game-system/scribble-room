import { describe, expect, it } from "vitest";
import { TIMING } from "../config";
import { connected, deadlines, disconnected, tick } from "./clock";
import { effectiveHost } from "./players";
import { apply } from "./rules";
import { T0, deps, drawerOf, lobby, must } from "./testkit";
import type { GameState } from "./types";

const sec = (n: number) => n * 1000;
const started = (ids = ["a", "b", "c"]) => must(lobby(ids), ids[0] ?? "a", { type: "START" });
const picked = (s: GameState, index = 0, now = T0) => must(s, drawerOf(s), { type: "PICK", index }, now);
const word = (s: GameState) => s.current?.word ?? "";
const refusal = (s: GameState, caller: string, e: Parameters<typeof apply>[2], now = T0) => {
  const r = apply(s, caller, e, deps(now));
  return r.ok ? null : r.error;
};

describe("lobby", () => {
  it("the first player hosts; seats get distinct hues, start disconnected until a socket opens", () => {
    const s = lobby(["a", "b"]);
    expect(s.hostId).toBe("a");
    expect(s.players.map((p) => p.hue)).toEqual([0, 1]);
    const t = must(s, "worker", { type: "ADMIT", id: "c", name: "C", avatar: "" });
    expect(t.players.find((p) => p.id === "c")?.connected).toBe(false);
    expect(t.feed.at(-1)).toMatchObject({ kind: "join", playerId: "c" });
  });

  it("only the host changes settings, only in the lobby", () => {
    const s = lobby(["a", "b"]);
    expect(refusal(s, "b", { type: "SETTINGS", rounds: 3 })).toBe("not-host");
    expect(must(s, "a", { type: "SETTINGS", rounds: 3, hints: false }).settings).toMatchObject({ rounds: 3, hints: false });
    expect(refusal(started(), "a", { type: "SETTINGS", rounds: 3 })).toBe("not-lobby");
  });

  it("teams mode deals everyone onto teams and uses its draw time; back to classic clears teams", () => {
    const s = must(lobby(["a", "b", "c", "d"]), "a", { type: "SETTINGS", mode: "teams" });
    expect(s.settings.drawSeconds).toBe(TIMING.teamDrawSeconds);
    expect(s.players.map((p) => p.team)).toEqual(["t0", "t1", "t0", "t1"]);
    const c = must(s, "a", { type: "SETTINGS", mode: "classic" });
    expect(c.settings.drawSeconds).toBe(TIMING.drawSeconds);
    expect(c.players.every((p) => p.team === "")).toBe(true);
  });

  it("a host-chosen draw time survives a mode switch", () => {
    const s = must(lobby(["a", "b"]), "a", { type: "SETTINGS", drawSeconds: 120 });
    expect(must(s, "a", { type: "SETTINGS", mode: "teams" }).settings.drawSeconds).toBe(120);
  });

  it("fewer teams moves players off removed teams onto the smallest", () => {
    let s = must(lobby(["a", "b", "c", "d", "e", "f"]), "a", { type: "SETTINGS", mode: "teams", teamCount: 3 });
    expect(s.players.map((p) => p.team)).toEqual(["t0", "t1", "t2", "t0", "t1", "t2"]);
    s = must(s, "a", { type: "SETTINGS", teamCount: 2 });
    const counts = ["t0", "t1"].map((t) => s.players.filter((p) => p.team === t).length);
    expect(counts).toEqual([3, 3]);
  });

  it("players pick their own team in teams mode; a late lobby joiner lands on the smallest team", () => {
    let s = must(lobby(["a", "b", "c"]), "a", { type: "SETTINGS", mode: "teams" });
    expect(refusal(s, "b", { type: "JOIN_TEAM", team: "t5" })).toBe("bad-team");
    s = must(s, "b", { type: "JOIN_TEAM", team: "t0" });
    expect(s.players.map((p) => p.team)).toEqual(["t0", "t0", "t0"]);
    s = must(s, "worker", { type: "ADMIT", id: "d", name: "D", avatar: "" });
    expect(s.players.find((p) => p.id === "d")?.team).toBe("t1");
    expect(refusal(lobby(["a", "b"]), "a", { type: "JOIN_TEAM", team: "t0" })).toBe("not-teams");
  });

  it("shuffle deals balanced teams (host only)", () => {
    const s = must(lobby(["a", "b", "c", "d"]), "a", { type: "SETTINGS", mode: "teams" });
    expect(refusal(s, "b", { type: "SHUFFLE_TEAMS" })).toBe("not-host");
    const t = must(s, "a", { type: "SHUFFLE_TEAMS" });
    expect(t.players.filter((p) => p.team === "t0")).toHaveLength(2);
  });

  it("ten players in the lobby make teams the default, unless the host chose a mode", () => {
    const ten = lobby(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
    expect(ten.settings.mode).toBe("teams");
    let s = must(lobby(["a"]), "a", { type: "SETTINGS", mode: "classic" });
    for (const id of ["b", "c", "d", "e", "f", "g", "h", "i", "j"]) s = must(s, "worker", { type: "ADMIT", id, name: id, avatar: "" });
    expect(s.settings.mode).toBe("classic");
  });

  it("start needs two connected players (teams: four, on two teams)", () => {
    expect(refusal(lobby(["a"]), "a", { type: "START" })).toBe("not-enough-players");
    let s = must(lobby(["a"]), "worker", { type: "ADMIT", id: "b", name: "B", avatar: "" });
    expect(refusal(s, "a", { type: "START" })).toBe("not-enough-players");
    s = must(lobby(["a", "b", "c"]), "a", { type: "SETTINGS", mode: "teams" });
    expect(refusal(s, "a", { type: "START" })).toBe("not-enough-players");
    expect(refusal(lobby(["a", "b"]), "b", { type: "START" })).toBe("not-host");
  });

  it("a stranger can't send player events; a refresh keeps the seat and score", () => {
    expect(refusal(lobby(["a"]), "zz", { type: "START" })).toBe("not-player");
    let s = started(["a", "b"]);
    s = { ...s, players: s.players.map((p) => (p.id === "b" ? { ...p, score: 300 } : p)) };
    s = must(s, "worker", { type: "ADMIT", id: "b", name: "Bee", avatar: "x" });
    expect(s.players).toHaveLength(2);
    expect(s.players[1]).toMatchObject({ id: "b", name: "Bee", score: 300 });
  });
});

describe("host", () => {
  it("passes to the next connected player while the host is away, and back when they return", () => {
    let s = lobby(["a", "b", "c"]);
    s = disconnected(s, "a", deps(T0));
    expect(effectiveHost(s)).toBe("b");
    expect(must(s, "b", { type: "SETTINGS", rounds: 4 }).settings.rounds).toBe(4);
    expect(refusal(s, "a", { type: "SETTINGS", rounds: 4 })).toBe("not-host");
    s = connected(s, "a");
    expect(effectiveHost(s)).toBe("a");
  });
});

describe("turns", () => {
  it("start: round 1, the first joiner picks from three words, 15 s", () => {
    const s = started();
    expect(s).toMatchObject({ phase: "picking", round: 1, turn: 1, startedAt: T0, endsAt: T0 + sec(TIMING.pickSeconds) });
    expect(drawerOf(s)).toBe("a");
    expect(s.current?.choices.map((c) => c.difficulty)).toEqual(["easy", "medium", "hard"]);
  });

  it("only the drawer picks, only while picking", () => {
    const s = started();
    expect(refusal(s, "b", { type: "PICK", index: 0 })).toBe("not-drawer");
    const d = picked(s, 2);
    expect(d).toMatchObject({ phase: "drawing", startedAt: T0, endsAt: T0 + sec(80) });
    expect(word(d)).toBe("ice cream");
    expect(d.used).toContain("ice cream");
    expect(refusal(d, "a", { type: "PICK", index: 0 })).toBe("not-picking");
  });

  it("the pick times out to the middle word", () => {
    const s = tick(started(), deps(T0 + sec(15)));
    expect(s.phase).toBe("drawing");
    expect(word(s)).toBe("rainbow");
    expect(s.startedAt).toBe(T0 + sec(15));
  });

  it("classic: everyone draws once per round in join order, then the podium", () => {
    let s = must(lobby(["a", "b", "c"]), "a", { type: "SETTINGS", rounds: 2 });
    s = must(s, "a", { type: "START" });
    const drawers: string[] = [];
    let now = T0;
    while (s.phase !== "podium") {
      if (s.phase === "picking") drawers.push(`${s.round}:${drawerOf(s)}`);
      now += sec(200);
      s = tick(s, deps(now));
    }
    expect(drawers).toEqual(["1:a", "1:b", "1:c", "2:a", "2:b", "2:c"]);
    expect(s.turn).toBe(6);
  });

  it("a drawer who isn't connected when their turn comes is skipped", () => {
    let s = started(["a", "b", "c"]);
    s = disconnected(s, "b", deps(T0));
    s = must(s, "a", { type: "SKIP" });
    s = tick(s, deps(T0 + sec(7)));
    expect(drawerOf(s)).toBe("c");
  });

  it("a late joiner is a guesser now and is appended to this round's order", () => {
    let s = picked(started(["a", "b"]));
    s = must(s, "worker", { type: "ADMIT", id: "z", name: "Zed", avatar: "" });
    s = connected(s, "z");
    expect(s.queue).toEqual(["b", "z"]);
    expect(must(s, "z", { type: "GUESS", text: "nope" }).feed.at(-1)).toMatchObject({ kind: "guess", playerId: "z", text: "nope" });
  });

  it("teams: each team once per round, the drawer rotating through its members", () => {
    let s = must(lobby(["a", "b", "c", "d", "e"]), "a", { type: "SETTINGS", mode: "teams", rounds: 3 });
    // t0: a, c, e   t1: b, d
    s = must(s, "a", { type: "START" });
    const drawers: string[] = [];
    let now = T0;
    while (s.phase !== "podium") {
      if (s.phase === "picking") drawers.push(`${s.round}:${drawerOf(s)}`);
      now += sec(200);
      s = tick(s, deps(now));
    }
    expect(drawers).toEqual(["1:a", "1:b", "2:c", "2:d", "3:e", "3:b"]);
  });

  it("teams: a late joiner mid-game lands on the smallest team", () => {
    let s = must(lobby(["a", "b", "c", "d", "e"]), "a", { type: "SETTINGS", mode: "teams" });
    s = must(s, "a", { type: "START" });
    s = must(s, "worker", { type: "ADMIT", id: "z", name: "Z", avatar: "" });
    expect(s.players.find((p) => p.id === "z")?.team).toBe("t1");
  });
});

describe("guessing and scoring", () => {
  it("a correct guess: private notice, public feed without the word, points by time left; first +50", () => {
    let s = picked(started());
    s = must(s, "b", { type: "GUESS", text: "CAT" }, T0 + sec(24));
    expect(s.feed.at(-1)).toMatchObject({ kind: "correct", playerId: "b", text: "+290" }); // 100+140=240 +50
    expect(JSON.stringify(s.feed)).not.toContain("cat\"");
    expect(s.notices.b).toMatchObject({ kind: "correct" });
    expect(refusal(s, "b", { type: "GUESS", text: "cat" })).toBe("already-guessed");
  });

  it("a close guess is a private notice only; a wrong guess goes in the feed", () => {
    let s = picked(started());
    const feedBefore = s.feed.length;
    s = must(s, "b", { type: "GUESS", text: "cats" });
    expect(s.notices.b).toMatchObject({ kind: "close", text: "So close!" });
    expect(s.feed).toHaveLength(feedBefore);
    s = must(s, "c", { type: "GUESS", text: "a dog" });
    expect(s.feed.at(-1)).toMatchObject({ kind: "guess", playerId: "c", text: "a dog" });
  });

  it("the drawer can't guess; nobody guesses outside drawing", () => {
    const s = picked(started());
    expect(refusal(s, "a", { type: "GUESS", text: "cat" })).toBe("drawer-cant-guess");
    expect(refusal(started(), "b", { type: "GUESS", text: "cat" })).toBe("not-drawing");
  });

  it("everyone guessing ends the turn early: guessers and drawer score, reveal for 7 s", () => {
    let s = picked(started());
    s = must(s, "b", { type: "GUESS", text: "cat" }, T0 + sec(8)); // 100+180=280 +50 = 330
    s = must(s, "c", { type: "GUESS", text: "cat" }, T0 + sec(40)); // 100+100 = 200
    expect(s.phase).toBe("reveal");
    expect(s.lastTurn).toMatchObject({ turn: 1, word: "cat", drawerId: "a", reason: "all-guessed", gains: { b: 330, c: 200, a: 300 } });
    expect(s.players.map((p) => p.score)).toEqual([300, 330, 200]);
    expect(s.endsAt).toBe(T0 + sec(40 + TIMING.revealSeconds));
  });

  it("time out: the drawer earns by the share who got it", () => {
    let s = picked(started(["a", "b", "c", "d"]));
    s = must(s, "b", { type: "GUESS", text: "cat" }, T0 + sec(40));
    s = tick(s, deps(T0 + sec(80)));
    expect(s.lastTurn).toMatchObject({ reason: "time", gains: { b: 250, a: 100 } });
  });

  it("host skip: nobody scores that turn", () => {
    let s = picked(started());
    s = must(s, "b", { type: "GUESS", text: "cat" });
    expect(refusal(s, "b", { type: "SKIP" })).toBe("not-host");
    s = must(s, "a", { type: "SKIP" });
    expect(s.lastTurn).toMatchObject({ reason: "skipped", gains: {} });
    expect(s.players.every((p) => p.score === 0)).toBe(true);
    expect(s.feed.at(-1)).toMatchObject({ kind: "skip" });
  });

  it("host skip during the reveal goes straight to the next turn", () => {
    let s = must(picked(started()), "a", { type: "SKIP" });
    s = must(s, "a", { type: "SKIP" });
    expect(s).toMatchObject({ phase: "picking", turn: 2 });
  });

  it("teams: team gains are the sum of members' gains; 80% guessed drops the clock to 10 s", () => {
    let s = must(lobby(["a", "b", "c", "d", "e", "f"]), "a", { type: "SETTINGS", mode: "teams" });
    // t0: a c e   t1: b d f ; a draws; guessers b c d e f (5): 4 = 80%
    s = picked(must(s, "a", { type: "START" }));
    for (const id of ["b", "c", "d"]) s = must(s, id, { type: "GUESS", text: "cat" }, T0 + sec(6));
    expect(s.endsAt).toBe(T0 + sec(60));
    s = must(s, "e", { type: "GUESS", text: "cat" }, T0 + sec(6));
    expect(s.endsAt).toBe(T0 + sec(16));
    expect(deadlines(s).draw).toBe(T0 + sec(16));
    s = tick(s, deps(T0 + sec(16)));
    expect(s.lastTurn?.reason).toBe("time");
    const g = s.lastTurn?.gains ?? {};
    expect(s.lastTurn?.teamGains).toEqual({ t0: (g.a ?? 0) + (g.c ?? 0) + (g.e ?? 0), t1: (g.b ?? 0) + (g.d ?? 0) });
    expect(g.a).toBe(240); // 4 of 5
  });
});

describe("hints and clock", () => {
  it("hints reveal on schedule and never the last letter", () => {
    let s = picked(started(), 1); // rainbow: 7 letters → 2 hints at 35% and 85%
    expect(s.current?.hintAt).toEqual([T0 + sec(28), T0 + sec(68)]);
    expect(deadlines(s).hint).toBe(T0 + sec(28));
    s = tick(s, deps(T0 + sec(28)));
    expect(s.current?.shown).toBe(1);
    expect(deadlines(s).hint).toBe(T0 + sec(68));
    s = tick(s, deps(T0 + sec(68)));
    expect(s.current?.shown).toBe(2);
    expect(deadlines(s).hint).toBeUndefined();
  });

  it("hints off: none planned", () => {
    const s = picked(must(must(lobby(["a", "b"]), "a", { type: "SETTINGS", hints: false }), "a", { type: "START" }), 1);
    expect(s.current?.hintAt).toEqual([]);
  });

  it("deadlines name every pending clock", () => {
    const p = started();
    expect(deadlines(p)).toEqual({ pick: T0 + sec(15) });
    expect(deadlines(lobby(["a"]))).toEqual({});
  });

  it("a drawer who drops gets 15 s; back in time, the turn goes on; gone, the turn ends", () => {
    let s = picked(started());
    s = disconnected(s, "a", deps(T0 + sec(5)));
    expect(deadlines(s).grace).toBe(T0 + sec(20));
    const back = connected(s, "a");
    expect(deadlines(back).grace).toBeUndefined();
    s = tick(s, deps(T0 + sec(20)));
    expect(s.lastTurn).toMatchObject({ reason: "drawer-left" });
    expect(s.feed.at(-1)).toMatchObject({ kind: "leave", playerId: "a" });
  });

  it("the last guesser who hasn't got it leaving ends the turn as all-guessed", () => {
    let s = picked(started());
    s = must(s, "b", { type: "GUESS", text: "cat" });
    s = disconnected(s, "c", deps(T0 + sec(1)));
    expect(s.lastTurn?.reason).toBe("all-guessed");
  });

  it("the reveal ends into the next turn; the last turn of the last round into the podium", () => {
    let s = must(must(lobby(["a", "b"]), "a", { type: "SETTINGS", rounds: 1 }), "a", { type: "START" });
    s = must(picked(s), "b", { type: "GUESS", text: "cat" });
    s = tick(s, deps(T0 + sec(7)));
    expect(s).toMatchObject({ phase: "picking", turn: 2 });
    expect(drawerOf(s)).toBe("b");
    s = picked(s);
    s = must(s, "a", { type: "GUESS", text: word(s) });
    expect(s.phase).toBe("reveal");
    s = tick(s, deps(T0 + sec(7)));
    expect(s.phase).toBe("podium");
  });
});

describe("play again", () => {
  it("host only, from the podium: back to the lobby, same people, scores reset", () => {
    let s = must(must(lobby(["a", "b"]), "a", { type: "SETTINGS", rounds: 1 }), "a", { type: "START" });
    for (let now = T0; s.phase !== "podium"; now += sec(100)) s = tick(s, deps(now));
    expect(refusal(s, "b", { type: "PLAY_AGAIN" })).toBe("not-host");
    s = { ...s, players: s.players.map((p) => ({ ...p, score: 500 })) };
    s = must(s, "a", { type: "PLAY_AGAIN" });
    expect(s).toMatchObject({ phase: "lobby", round: 0, turn: 0, lastTurn: null });
    expect(s.players.map((p) => p.score)).toEqual([0, 0]);
    expect(refusal(s, "a", { type: "PLAY_AGAIN" })).toBe("not-podium");
  });
});
