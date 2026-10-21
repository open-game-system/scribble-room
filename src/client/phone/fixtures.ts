// Fixture views for looking at each phone screen without a room: /join.html?fixture=<name>.
// Dev only (the switch is read from the URL when the page has no boot payload).
import type { CanvasView, Op, PlayerView, Seat } from "../../shared/protocol";

export const FIXTURES = ["lobby", "lobby-guest", "lobby-teams", "pick", "choosing", "draw", "guess", "guess-close", "guess-correct", "reveal", "podium", "podium-teams"] as const;
export type FixtureName = (typeof FIXTURES)[number];

export const isFixture = (s: string | null): s is FixtureName => FIXTURES.some((f) => f === s);

const NOW = Date.now();
const seat = (id: string, name: string, score: number, extra: Partial<Seat> = {}): Seat => ({ id, name, avatar: "", hue: 0, score, team: "", connected: true, guessed: false, ...extra });

const PLAYERS = [seat("me", "Juneau", 480), seat("ana", "Ana", 720), seat("ben", "Ben", 390), seat("cy", "Cy", 120, { connected: false })];

function base(over: Partial<PlayerView> = {}, me: Partial<PlayerView["me"]> = {}): PlayerView {
  return {
    code: "K7QX",
    phase: "lobby",
    settings: { mode: "classic", rounds: 2, drawSeconds: 80, difficulty: "mixed", hints: true, teamCount: 2 },
    hostId: "me",
    players: PLAYERS,
    teams: [],
    round: 1,
    turn: 1,
    drawerId: "",
    drawingTeam: "",
    mask: "",
    endsAt: 0,
    startedAt: 0,
    lastTurn: null,
    feed: [],
    seq: 1,
    ...over,
    me: { id: "me", isHost: true, isDrawer: false, word: "", choices: [], guessed: false, notice: null, ...me },
  };
}

function sun(): Record<string, Op> {
  const ops: Op[] = [];
  const circle: number[] = [];
  for (let a = 0; a <= 64; a++) circle.push(Math.round(600 + 160 * Math.cos((a / 64) * Math.PI * 2)), Math.round(420 + 160 * Math.sin((a / 64) * Math.PI * 2)));
  ops.push({ seq: 1, stroke: 0, kind: "line", color: 0, size: 1, pts: circle });
  ops.push({ seq: 2, stroke: 1, kind: "fill", color: 4, size: 0, pts: [600, 420] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ops.push({ seq: 3 + i, stroke: 2 + i, kind: "line", color: 3, size: 1, pts: [Math.round(600 + 200 * Math.cos(a)), Math.round(420 + 200 * Math.sin(a)), Math.round(600 + 290 * Math.cos(a)), Math.round(420 + 290 * Math.sin(a))] });
  }
  ops.push({ seq: 11, stroke: 10, kind: "line", color: 6, size: 2, pts: [80, 860, 400, 820, 800, 870, 1120, 830] });
  return Object.fromEntries(ops.map((o) => [String(o.seq).padStart(6, "0"), o]));
}

const FEED: PlayerView["feed"] = [
  { seq: 1, kind: "guess", playerId: "ben", name: "Ben", text: "moon" },
  { seq: 2, kind: "guess", playerId: "cy", name: "Cy", text: "orange" },
  { seq: 3, kind: "correct", playerId: "ana", name: "Ana", text: "+240" },
  { seq: 4, kind: "guess", playerId: "ben", name: "Ben", text: "flower" },
];

export function fixture(name: FixtureName): { view: PlayerView; canvas: CanvasView } {
  const empty: CanvasView = { phase: "lobby", drawerId: "", canvasTurn: 0, ops: {} };
  const drawing: Partial<PlayerView> = { phase: "drawing", endsAt: NOW + 54_000, startedAt: NOW - 26_000, drawerId: "ana", mask: "_ _ n", feed: FEED };
  const canvas: CanvasView = { phase: "drawing", drawerId: "ana", canvasTurn: 1, ops: sun() };
  switch (name) {
    case "lobby":
      return { view: base(), canvas: empty };
    case "lobby-guest":
      return { view: base({ players: PLAYERS.slice(0, 1).concat(seat("ana", "Ana", 0)) }, { isHost: false, id: "ana" }), canvas: empty };
    case "lobby-teams":
      return {
        view: base({
          settings: { mode: "teams", rounds: 2, drawSeconds: 60, difficulty: "easy", hints: true, teamCount: 2 },
          players: PLAYERS.map((p, i) => ({ ...p, team: i % 2 ? "t1" : "t0" })),
          teams: [{ id: "t0", name: "Tangerine", score: 0 }, { id: "t1", name: "Teal", score: 0 }],
        }),
        canvas: empty,
      };
    case "pick":
      return {
        view: base({ phase: "picking", drawerId: "me", endsAt: NOW + 12_000, startedAt: NOW - 3_000 }, {
          isDrawer: true,
          choices: [
            { word: "cat", difficulty: "easy" },
            { word: "lighthouse", difficulty: "medium" },
            { word: "photosynthesis", difficulty: "hard" },
          ],
        }),
        canvas: empty,
      };
    case "choosing":
      return { view: base({ phase: "picking", drawerId: "ana", endsAt: NOW + 12_000, startedAt: NOW - 3_000 }), canvas: empty };
    case "draw":
      return { view: base({ ...drawing, drawerId: "me", mask: "", players: PLAYERS.map((p) => (p.id === "ana" ? { ...p, guessed: true } : p)) }, { isDrawer: true, word: "sun" }), canvas: { ...canvas, drawerId: "me" } };
    case "guess":
      return { view: base({ ...drawing, hostId: "ana" }, { isHost: false }), canvas };
    case "guess-close":
      return { view: base({ ...drawing, hostId: "ana" }, { isHost: false, notice: { kind: "close", text: "So close!", seq: 9 } }), canvas };
    case "guess-correct":
      return { view: base({ ...drawing, hostId: "ana" }, { isHost: false, guessed: true, word: "sun", notice: { kind: "correct", text: "You got it! +240", seq: 9 } }), canvas };
    case "reveal":
      return {
        view: base({ phase: "reveal", endsAt: NOW + 6_000, startedAt: NOW - 1_000, lastTurn: { turn: 1, word: "sun", drawerId: "ana", gains: { me: 240, ana: 150 }, teamGains: {}, reason: "time" } }),
        canvas: { ...canvas, phase: "reveal" },
      };
    case "podium":
      return { view: base({ phase: "podium" }), canvas: empty };
    case "podium-teams":
      return {
        view: base({
          phase: "podium",
          settings: { mode: "teams", rounds: 2, drawSeconds: 60, difficulty: "mixed", hints: true, teamCount: 2 },
          players: PLAYERS.map((p, i) => ({ ...p, team: i % 2 ? "t1" : "t0" })),
          teams: [{ id: "t0", name: "Tangerine", score: 870 }, { id: "t1", name: "Teal", score: 840 }],
        }),
        canvas: empty,
      };
  }
}
