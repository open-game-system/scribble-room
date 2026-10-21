// Projections of the game state onto the wire views (src/shared/protocol.ts). Pure.
// The public part is computed once per state (cached) and shared by the TV and every phone.
import { TEAMS } from "../config";
import type { CanvasView, PlayerView, Seat, Team, TvView } from "../shared/protocol";
import { maskOf } from "./hints";
import { effectiveHost } from "./players";
import type { GameState } from "./types";

export type PublicView = Omit<TvView, "canvasTurn" | "ops">;

const inTurn = (s: GameState): boolean => s.phase === "picking" || s.phase === "drawing" || s.phase === "reveal";

/** Points a correct guess has earned this turn, shown live until the turn's gains are committed. */
function pendingOf(s: GameState): Map<string, number> {
  const cur = s.current;
  return new Map(s.phase === "drawing" && cur ? cur.guessed.map((g) => [g.id, g.points]) : []);
}

function seats(s: GameState): Seat[] {
  const pending = pendingOf(s);
  const got = new Set(inTurn(s) ? (s.current?.guessed ?? []).map((g) => g.id) : []);
  return s.players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    hue: p.hue,
    score: p.score + (pending.get(p.id) ?? 0),
    team: p.team,
    connected: p.connected,
    guessed: got.has(p.id),
  }));
}

function teams(s: GameState, players: readonly Seat[]): Team[] {
  if (s.settings.mode !== "teams") return [];
  return TEAMS.slice(0, s.settings.teamCount).map((t) => ({
    id: t.id,
    name: t.name,
    score: players.filter((p) => p.team === t.id).reduce((sum, p) => sum + p.score, 0),
  }));
}

export function maskFor(s: GameState): string {
  const cur = s.current;
  if (s.phase !== "drawing" || !cur) return "";
  return maskOf(cur.word, cur.hintIdx.slice(0, cur.shown));
}

const drawerId = (s: GameState): string => (inTurn(s) ? (s.current?.drawerId ?? "") : "");

function computePublic(s: GameState): PublicView {
  const players = seats(s);
  const drawer = drawerId(s);
  return {
    code: s.code,
    phase: s.phase,
    settings: s.settings,
    hostId: effectiveHost(s),
    players,
    teams: teams(s, players),
    round: s.round,
    turn: s.turn,
    drawerId: drawer,
    drawingTeam: s.settings.mode === "teams" ? (players.find((p) => p.id === drawer)?.team ?? "") : "",
    mask: maskFor(s),
    endsAt: s.endsAt,
    startedAt: s.startedAt,
    lastTurn: s.lastTurn,
    feed: s.feed,
    seq: s.seq,
  };
}

const cache = new WeakMap<GameState, PublicView>();

export function publicView(s: GameState): PublicView {
  const hit = cache.get(s);
  if (hit) return hit;
  const v = computePublic(s);
  cache.set(s, v);
  return v;
}

export function tvView(s: GameState): TvView {
  return { ...publicView(s), canvasTurn: s.canvasTurn, ops: s.ops };
}

export function canvasView(s: GameState): CanvasView {
  return { phase: s.phase, drawerId: drawerId(s), canvasTurn: s.canvasTurn, ops: s.ops };
}

function wordFor(s: GameState, caller: string, guessed: boolean): string {
  const cur = s.current;
  if (!cur || (s.phase !== "drawing" && s.phase !== "reveal")) return "";
  return cur.drawerId === caller || guessed ? cur.word : "";
}

export function playerView(s: GameState, caller: string): PlayerView {
  const cur = s.current;
  const isDrawer = inTurn(s) && cur?.drawerId === caller;
  const guessed = inTurn(s) && (cur?.guessed.some((g) => g.id === caller) ?? false);
  return {
    ...publicView(s),
    me: {
      id: caller,
      isHost: effectiveHost(s) === caller,
      isDrawer,
      word: wordFor(s, caller, guessed),
      choices: s.phase === "picking" && isDrawer ? (cur?.choices ?? []) : [],
      guessed,
      notice: s.notices[caller] ?? null,
    },
  };
}
