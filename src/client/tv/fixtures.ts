// Fixture TV views for building and screenshotting the TV without a room (`/tv.html?fixture=drawing`,
// only when the page has no #boot payload, so the Worker-served page never reaches this) and for tests.
import { CANVAS } from "../../config";
import type { FeedEntry, Op, Seat, TvView } from "../../shared/protocol";

export const FIXTURE_NAMES = [
  "lobby-empty",
  "lobby",
  "lobby-teams",
  "lobby-crowd",
  "picking",
  "drawing",
  "drawing-urgent",
  "drawing-teams",
  "drawing-crowd",
  "reveal",
  "scoreboard",
  "scoreboard-teams",
  "podium",
  "podium-teams",
] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];

export const isFixtureName = (s: string): s is FixtureName => FIXTURE_NAMES.some((n) => n === s);

const NAMES = ["Ana", "Ben", "Cy", "Dee", "Eli", "Fran", "Gus", "Hana", "Ivo", "Jun", "Kai", "Lou", "Mo", "Nia", "Oli", "Pat", "Quin", "Rae", "Sol", "Tess"];

function seat(i: number, extra: Partial<Seat> = {}): Seat {
  const base = NAMES[i % NAMES.length] ?? "Player";
  const name = i < NAMES.length ? base : `${base} ${Math.floor(i / NAMES.length) + 1}`;
  return { id: `p${i}`, name, avatar: "", hue: i % 12, score: 0, team: "", connected: true, guessed: false, ...extra };
}

function players(n: number, f: (i: number) => Partial<Seat> = () => ({})): Seat[] {
  return Array.from({ length: n }, (_, i) => seat(i, f(i)));
}

/** A little lighthouse on the sea, drawn as chunked strokes in CANVAS units. */
export function lighthouseOps(): Record<string, Op> {
  const strokes: { color: number; size: number; pts: number[]; kind?: "line" | "fill" }[] = [
    // sea
    { color: 6, size: 1, pts: [40, 760, 160, 730, 280, 770, 400, 735, 520, 772, 640, 738, 760, 770, 880, 734, 1000, 768, 1160, 740] },
    { color: 11, size: 1, pts: [80, 830, 200, 805, 320, 838, 440, 808, 560, 840, 680, 810, 800, 836, 920, 806, 1060, 834] },
    // tower
    { color: 0, size: 1, pts: [520, 730, 560, 300, 640, 300, 680, 730, 520, 730] },
    { color: 2, size: 2, pts: [534, 600, 666, 600] },
    { color: 2, size: 2, pts: [548, 460, 652, 460] },
    // lamp room
    { color: 0, size: 1, pts: [550, 300, 550, 220, 650, 220, 650, 300] },
    { color: 4, size: 2, pts: [575, 260, 625, 260] },
    { color: 0, size: 1, pts: [530, 220, 600, 160, 670, 220, 530, 220] },
    // beams
    { color: 4, size: 0, pts: [660, 250, 1100, 150] },
    { color: 4, size: 0, pts: [660, 270, 1120, 330] },
    { color: 4, size: 0, pts: [540, 250, 120, 150] },
    { color: 4, size: 0, pts: [540, 270, 100, 340] },
    // gull
    { color: 0, size: 0, pts: [880, 420, 910, 400, 940, 420, 970, 400, 1000, 420] },
  ];
  const ops: Record<string, Op> = {};
  let seq = 0;
  strokes.forEach((s, stroke) => {
    seq += 1;
    ops[String(seq).padStart(6, "0")] = { seq, stroke, kind: s.kind ?? "line", color: s.color, size: s.size, pts: s.pts.map((v) => Math.min(Math.max(0, v), Math.max(CANVAS.w, CANVAS.h))) };
  });
  return ops;
}

const settings = { mode: "classic", rounds: 3, drawSeconds: 80, difficulty: "mixed", hints: true, teamCount: 2 } satisfies TvView["settings"];

function base(): TvView {
  return {
    code: "K7QX",
    phase: "lobby",
    settings,
    hostId: "p0",
    players: [],
    teams: [],
    round: 1,
    turn: 0,
    drawerId: "",
    drawingTeam: "",
    mask: "",
    endsAt: 0,
    startedAt: 0,
    lastTurn: null,
    feed: [],
    seq: 1,
    canvasTurn: 0,
    ops: {},
  };
}

const feedRow = (seq: number, kind: FeedEntry["kind"], i: number, text: string): FeedEntry => ({
  seq,
  kind,
  playerId: `p${i}`,
  name: NAMES[i] ?? "Player",
  text,
});

const GUESS_FEED: FeedEntry[] = [
  feedRow(10, "guess", 1, "candle"),
  feedRow(11, "guess", 2, "tower"),
  feedRow(12, "guess", 4, "rocket"),
  feedRow(13, "correct", 3, "+240"),
  feedRow(14, "guess", 5, "light house?"),
  feedRow(15, "guess", 1, "castle"),
  feedRow(16, "correct", 2, "+185"),
  feedRow(17, "guess", 6, "pencil"),
];

const TEAM_LIST = [
  { id: "t0", name: "Tangerine", score: 1420 },
  { id: "t1", name: "Teal", score: 1655 },
  { id: "t2", name: "Plum", score: 980 },
];

export function fixture(name: FixtureName, now: number): TvView {
  const v = base();
  const scores = [820, 1240, 655, 1100, 430, 905, 300, 560];
  const classic = players(8, (i) => ({ score: scores[i] ?? 0 }));
  const teamPlayers = players(12, (i) => ({ team: `t${i % 3}`, score: 100 + ((i * 137) % 600) }));
  const drawing = (ps: Seat[]): TvView => ({
    ...v,
    phase: "drawing",
    players: ps.map((p) => ({ ...p, guessed: p.id === "p3" || p.id === "p2" })),
    round: 2,
    turn: 5,
    drawerId: "p0",
    mask: "l___t_____",
    startedAt: now - 37_000,
    endsAt: now + 43_000,
    feed: GUESS_FEED,
    canvasTurn: 5,
    ops: lighthouseOps(),
  });
  const lastTurn = {
    turn: 5,
    word: "lighthouse",
    drawerId: "p0",
    gains: { p0: 210, p3: 240, p2: 185, p5: 150 },
    teamGains: { t0: 395, t2: 150, t1: 240 },
    reason: "time",
  };
  switch (name) {
    case "lobby-empty":
      return v;
    case "lobby":
      return { ...v, players: players(5).map((p, i) => ({ ...p, connected: i !== 4 })) };
    case "lobby-teams":
      return { ...v, settings: { ...settings, mode: "teams", teamCount: 3, drawSeconds: 60 }, players: teamPlayers.map((p) => ({ ...p, score: 0 })), teams: TEAM_LIST.map((t) => ({ ...t, score: 0 })) };
    case "lobby-crowd":
      return { ...v, players: players(48) };
    case "picking":
      return { ...v, phase: "picking", players: classic, round: 2, turn: 6, drawerId: "p1", startedAt: now - 4000, endsAt: now + 11_000, feed: GUESS_FEED.slice(0, 3), canvasTurn: 6 };
    case "drawing":
      return drawing(classic);
    case "drawing-urgent":
      return { ...drawing(classic), startedAt: now - 73_000, endsAt: now + 7000, mask: "l__ht_o_se" };
    case "drawing-teams":
      return {
        ...drawing(teamPlayers),
        settings: { ...settings, mode: "teams", teamCount: 3, drawSeconds: 60 },
        teams: TEAM_LIST,
        drawingTeam: "t0",
        startedAt: now - 20_000,
        endsAt: now + 40_000,
      };
    case "drawing-crowd":
      return { ...drawing(players(52, (i) => ({ score: (i * 97) % 1500 }))), mask: "i__ c____ c__e" };
    case "reveal":
      return { ...drawing(classic), phase: "reveal", mask: "", startedAt: now - 500, endsAt: now + 6500, lastTurn };
    case "scoreboard":
      return { ...drawing(classic), phase: "reveal", mask: "", startedAt: now - 4000, endsAt: now + 3000, lastTurn };
    case "scoreboard-teams":
      return {
        ...drawing(teamPlayers),
        phase: "reveal",
        settings: { ...settings, mode: "teams", teamCount: 3, drawSeconds: 60 },
        teams: TEAM_LIST,
        drawingTeam: "t0",
        mask: "",
        startedAt: now - 4000,
        endsAt: now + 3000,
        lastTurn,
      };
    case "podium":
      return { ...v, phase: "podium", players: classic, round: 3, turn: 24, lastTurn };
    case "podium-teams":
      return { ...v, phase: "podium", settings: { ...settings, mode: "teams", teamCount: 3 }, players: teamPlayers, teams: TEAM_LIST, round: 3, turn: 9, lastTurn };
  }
}
