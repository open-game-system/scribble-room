import { describe, expect, it } from "vitest";
import type { Seat, TurnResult } from "../../shared/protocol";
import {
  boardRows,
  gainRows,
  guessProgress,
  isUrgent,
  letterCounts,
  lobbyCaption,
  maskScale,
  maskWords,
  nameOf,
  podiumPlayers,
  revealCaption,
  revealedCount,
  roundLabel,
  settingsSummary,
  sittingLabel,
  standings,
  teamIndex,
  teamMvp,
  teamRows,
  timerFraction,
} from "./derive";
import { FIXTURE_NAMES, fixture, isFixtureName } from "./fixtures";

const seat = (id: string, score: number, extra: Partial<Seat> = {}): Seat => ({
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

describe("hint mask", () => {
  it("splits words on spaces and marks hidden, revealed and fixed cells", () => {
    expect(maskWords("i__ c__-m")).toEqual([
      [{ kind: "letter", ch: "i" }, { kind: "hidden" }, { kind: "hidden" }],
      [{ kind: "letter", ch: "c" }, { kind: "hidden" }, { kind: "hidden" }, { kind: "fixed", ch: "-" }, { kind: "letter", ch: "m" }],
    ]);
    expect(maskWords("")).toEqual([]);
  });

  it("counts letters per word without punctuation, and the revealed hints", () => {
    expect(letterCounts("___ _'_ __-__")).toEqual([3, 2, 4]);
    expect(revealedCount("l___t_____")).toBe(2);
    expect(revealedCount("__________")).toBe(0);
  });

  it("shrinks boxes only for masks wider than the line", () => {
    expect(maskScale("_____")).toBe(1);
    expect(maskScale("")).toBe(1);
    expect(maskScale("__________")).toBe(1);
    expect(maskScale("______________________")).toBeCloseTo(13.5 / (22 * 1.14));
    expect(maskScale("____ ____", 8)).toBeCloseTo(8 / (8 * 1.14 + 0.6));
  });
});

describe("standings", () => {
  it("sorts by score and shares ranks on ties, keeping join order", () => {
    const rows = standings([seat("a", 100), seat("b", 300), seat("c", 100), seat("d", 50)]);
    expect(rows.map((r) => [r.seat.id, r.rank])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 2],
      ["d", 4],
    ]);
  });

  it("knows where each row sat before this turn's gains", () => {
    const rows = boardRows([seat("a", 500), seat("b", 400), seat("c", 450)], { c: 200, b: 0 });
    // before: a 500, b 400, c 250 -> a, b, c; after: a 500, c 450, b 400.
    expect(rows.map((r) => [r.seat.id, r.from, r.to, r.gain])).toEqual([
      ["a", 0, 0, 0],
      ["c", 2, 1, 200],
      ["b", 1, 2, 0],
    ]);
  });

  it("never goes below zero when reconstructing the old score", () => {
    const rows = boardRows([seat("a", 10)], { a: 50 });
    expect(rows[0]?.from).toBe(0);
  });

  it("ranks teams, colours them by TEAMS order and marks the drawing team", () => {
    const rows = teamRows(
      {
        teams: [
          { id: "t0", name: "Tangerine", score: 100 },
          { id: "t2", name: "Plum", score: 300 },
        ],
        players: [seat("a", 0, { team: "t0" }), seat("b", 0, { team: "t2" }), seat("c", 0, { team: "t2" })],
        drawingTeam: "t0",
      },
      { t2: 80 },
    );
    expect(rows.map((r) => [r.team.id, r.rank, r.color, r.members.length, r.gain, r.drawing])).toEqual([
      ["t2", 1, 2, 2, 80, false],
      ["t0", 2, 0, 1, 0, true],
    ]);
    expect(teamIndex("nope")).toBe(0);
  });

  it("shares a team rank on a tie", () => {
    const rows = teamRows({ teams: [{ id: "t0", name: "A", score: 5 }, { id: "t1", name: "B", score: 5 }], players: [], drawingTeam: "" });
    expect(rows.map((r) => r.rank)).toEqual([1, 1]);
  });
});

describe("captions", () => {
  const players = [seat("a", 0), seat("b", 0, { connected: false }), seat("c", 0)];

  it("names players, with a fallback", () => {
    expect(nameOf(players, "c")).toBe("C");
    expect(nameOf(players, "zz")).toBe("Someone");
  });

  it("labels the round", () => {
    expect(roundLabel({ round: 2, settings: { mode: "classic", rounds: 3, drawSeconds: 80, difficulty: "mixed", hints: true, teamCount: 2 } })).toBe("Round 2 of 3");
    expect(roundLabel({ round: 0, settings: { mode: "classic", rounds: 1, drawSeconds: 80, difficulty: "mixed", hints: true, teamCount: 2 } })).toBe("Round 1 of 1");
  });

  it("summarises the settings in words", () => {
    expect(settingsSummary({ mode: "classic", rounds: 1, drawSeconds: 80, difficulty: "easy", hints: false, teamCount: 2 })).toEqual([
      "Classic",
      "1 round",
      "80 s to draw",
      "Easy words",
      "No hints",
    ]);
    expect(settingsSummary({ mode: "teams", rounds: 3, drawSeconds: 60, difficulty: "mixed", hints: true, teamCount: 4 })).toEqual([
      "Teams (4)",
      "3 rounds",
      "60 s to draw",
      "Mixed words",
      "Hints on",
    ]);
  });

  it("says what the lobby waits for", () => {
    expect(lobbyCaption({ players: [], hostId: "" }, 2)).toBe("Grab your phone and join");
    expect(lobbyCaption({ players: [seat("a", 0)], hostId: "a" }, 2)).toBe("Waiting for 1 more player");
    expect(lobbyCaption({ players: [seat("a", 0)], hostId: "a" }, 3)).toBe("Waiting for 2 more players");
    expect(lobbyCaption({ players, hostId: "a" }, 2)).toBe("Host: A starts the game");
    expect(lobbyCaption({ players, hostId: "zz" }, 2)).toBe("The host starts the game");
  });

  it("counts guessers (not the drawer, not the gone) and who got it", () => {
    const ps = [seat("d", 0), seat("a", 0, { guessed: true }), seat("b", 0, { connected: false }), seat("c", 0), seat("e", 0, { connected: false, guessed: true })];
    expect(guessProgress({ players: ps, drawerId: "d" })).toEqual({ got: 2, of: 3 });
  });

  it("explains why the turn ended", () => {
    const t = (reason: string): TurnResult => ({ turn: 1, word: "cat", drawerId: "d", gains: {}, teamGains: {}, reason });
    expect(revealCaption(t("all-guessed"), 3, 3)).toBe("Everybody got it!");
    expect(revealCaption(t("skipped"), 0, 3)).toBe("Skipped by the host");
    expect(revealCaption(t("drawer-left"), 0, 3)).toBe("The drawer left");
    expect(revealCaption(t("time"), 0, 3)).toBe("Time's up! Nobody got it");
    expect(revealCaption(t("time"), 2, 5)).toBe("Time's up! 2 of 5 got it");
  });

  it("lists this turn's gains biggest first, drawer marked, zeroes dropped", () => {
    const turn: TurnResult = { turn: 1, word: "cat", drawerId: "a", gains: { a: 100, b: 240, c: 0, d: 240 }, teamGains: {}, reason: "time" };
    expect(gainRows(turn, [seat("a", 0), seat("b", 0), seat("d", 0)])).toEqual([
      { id: "b", name: "B", gain: 240, drawer: false },
      { id: "d", name: "D", gain: 240, drawer: false },
      { id: "a", name: "A", gain: 100, drawer: true },
    ]);
  });
});

describe("timer", () => {
  it("is the share of the phase clock left, clamped", () => {
    expect(timerFraction(2000, 1000, 1500)).toBe(0.5);
    expect(timerFraction(2000, 1000, 500)).toBe(1);
    expect(timerFraction(2000, 1000, 3000)).toBe(0);
    expect(timerFraction(0, 0, 3000)).toBe(0);
  });

  it("is urgent only in the last 10 s of drawing", () => {
    expect(isUrgent("drawing", 10)).toBe(true);
    expect(isUrgent("drawing", 1)).toBe(true);
    expect(isUrgent("drawing", 11)).toBe(false);
    expect(isUrgent("drawing", 0)).toBe(false);
    expect(isUrgent("picking", 5)).toBe(false);
  });
});

describe("podium", () => {
  it("puts the top three in place order", () => {
    const spots = podiumPlayers([seat("a", 10), seat("b", 30), seat("c", 20), seat("d", 5)]);
    expect(spots.map((s) => [s.place, s.id])).toEqual([
      [1, "b"],
      [2, "c"],
      [3, "a"],
    ]);
    expect(podiumPlayers([seat("a", 1)])).toHaveLength(1);
  });

  it("finds a team's MVP", () => {
    const ps = [seat("a", 10, { team: "t0" }), seat("b", 90, { team: "t1" }), seat("c", 40, { team: "t0" })];
    expect(teamMvp(ps, "t0")?.id).toBe("c");
    expect(teamMvp(ps, "t9")).toBeNull();
  });
});

describe("OGS sitting label", () => {
  const now = 1_000_000;
  it("labels every phase", () => {
    expect(sittingLabel(fixture("lobby-empty", now))).toEqual({ status: "lobby", title: "Waiting for players" });
    expect(sittingLabel(fixture("lobby", now))).toEqual({ status: "lobby", title: "Lobby · 5 players" });
    expect(sittingLabel(fixture("drawing", now))).toEqual({ status: "active", title: "Round 2 of 3 · 8 players" });
    expect(sittingLabel(fixture("podium", now))).toEqual({ status: "completed", title: "Ben won" });
    expect(sittingLabel(fixture("podium-teams", now))).toEqual({ status: "completed", title: "Teal won" });
  });
});

describe("fixtures", () => {
  it("builds every named fixture with a matching phase", () => {
    for (const name of FIXTURE_NAMES) {
      const v = fixture(name, 1000);
      expect(name.startsWith(v.phase === "reveal" ? (name.startsWith("score") ? "score" : "reveal") : v.phase)).toBe(true);
    }
    expect(isFixtureName("drawing")).toBe(true);
    expect(isFixtureName("nope")).toBe(false);
  });
});
