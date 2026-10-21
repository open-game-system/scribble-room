// A turn: picking → drawing → reveal, then the next turn or the podium. Pure.
import { TIMING } from "../config";
import { planHints } from "./hints";
import { roundQueue, takeDrawer } from "./order";
import { isHost } from "./players";
import { drawerPoints } from "./scoring";
import { bump, drawMs, nameOf, pushFeed } from "./state";
import { type Deps, type GameState, type RuleResult, type Turn, ok, refuse } from "./types";

export type EndReason = "all-guessed" | "time" | "skipped" | "drawer-left";

function beginTurn(s: GameState, drawerId: string, deps: Deps): GameState {
  const choices = deps.pickChoices({ difficulty: s.settings.difficulty, used: new Set(s.used), rand: deps.rand });
  const current: Turn = { drawerId, choices: [...choices], word: "", hintIdx: [], hintAt: [], shown: 0, guessed: [], graceUntil: 0 };
  const turn = s.turn + 1;
  return bump({
    ...s,
    phase: "picking",
    turn,
    current,
    startedAt: deps.now,
    endsAt: deps.now + TIMING.pickSeconds * 1000,
    ops: {},
    canvasTurn: turn,
    notices: {},
  });
}

const toPodium = (s: GameState): GameState => bump({ ...s, phase: "podium", current: null, startedAt: 0, endsAt: 0 });

/** The next turn: the next drawer this round, else the next round, else the podium. */
export function nextTurn(s: GameState, deps: Deps): GameState {
  let state = s;
  for (let guard = 0; guard <= s.settings.rounds; guard++) {
    const taken = takeDrawer(state);
    if (taken) return beginTurn(taken.state, taken.drawerId, deps);
    if (state.round >= state.settings.rounds) break;
    state = { ...state, round: state.round + 1, queue: [] };
    state = { ...state, queue: roundQueue(state) };
  }
  return toPodium(state);
}

/** A new game: scores reset, round 1, first turn. */
export function startGame(s: GameState, deps: Deps): GameState {
  const fresh: GameState = {
    ...s,
    players: s.players.map((p) => ({ ...p, score: 0 })),
    round: 1,
    turn: 0,
    rotation: {},
    lastTurn: null,
    opSeq: 0,
  };
  return nextTurn({ ...fresh, queue: roundQueue(fresh) }, deps);
}

export function pickWord(s: GameState, index: number, deps: Deps): GameState {
  const cur = s.current;
  const choice = cur?.choices[index] ?? cur?.choices[1];
  if (!cur || !choice) return s;
  const plan = planHints(choice.word, deps.now, drawMs(s), s.settings.hints, deps.rand);
  return bump({
    ...s,
    phase: "drawing",
    current: { ...cur, word: choice.word, ...plan, shown: 0 },
    used: [...s.used, choice.word],
    startedAt: deps.now,
    endsAt: deps.now + drawMs(s),
  });
}

export function pick(s: GameState, caller: string, index: number, deps: Deps): RuleResult {
  if (s.phase !== "picking") return refuse("not-picking");
  if (s.current?.drawerId !== caller) return refuse("not-drawer");
  return ok(pickWord(s, index, deps));
}

/** Who guesses this turn: everyone but the drawer who is here (or already got it). */
export function guessersOf(s: GameState): string[] {
  const cur = s.current;
  if (!cur) return [];
  const got = new Set(cur.guessed.map((g) => g.id));
  return s.players.filter((p) => p.id !== cur.drawerId && (p.connected || got.has(p.id))).map((p) => p.id);
}

function gainsOf(s: GameState, reason: EndReason): Record<string, number> {
  const cur = s.current;
  if (!cur || reason === "skipped" || cur.word === "") return {};
  const gains: Record<string, number> = {};
  for (const g of cur.guessed) gains[g.id] = g.points;
  const drawer = drawerPoints(cur.guessed.length, guessersOf(s).length);
  if (drawer > 0) gains[cur.drawerId] = drawer;
  return gains;
}

function teamGainsOf(s: GameState, gains: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  if (s.settings.mode !== "teams") return out;
  for (const p of s.players) {
    const g = gains[p.id];
    if (g && p.team) out[p.team] = (out[p.team] ?? 0) + g;
  }
  return out;
}

function endFeed(s: GameState, reason: EndReason, caller: string): GameState {
  const drawer = s.current?.drawerId ?? "";
  if (reason === "skipped") return pushFeed(s, { kind: "skip", playerId: caller, name: nameOf(s, caller), text: "" });
  if (reason === "drawer-left") return pushFeed(s, { kind: "leave", playerId: drawer, name: nameOf(s, drawer), text: "" });
  return s;
}

/** The turn ends: gains are committed and the reveal starts. */
export function endTurn(s: GameState, reason: EndReason, deps: Deps, caller = ""): GameState {
  const cur = s.current;
  if (!cur) return s;
  const gains = gainsOf(s, reason);
  const scored: GameState = {
    ...s,
    phase: "reveal",
    players: s.players.map((p) => ({ ...p, score: p.score + (gains[p.id] ?? 0) })),
    current: { ...cur, graceUntil: 0 },
    lastTurn: { turn: s.turn, word: cur.word, drawerId: cur.drawerId, gains, teamGains: teamGainsOf(s, gains), reason },
    startedAt: deps.now,
    endsAt: deps.now + TIMING.revealSeconds * 1000,
  };
  return bump(endFeed(scored, reason, caller));
}

/** Host: skip the drawing (nobody scores); during the reveal, go straight to the next turn. */
export function skip(s: GameState, caller: string, deps: Deps): RuleResult {
  if (!isHost(s, caller)) return refuse("not-host");
  if (s.phase === "picking" || s.phase === "drawing") return ok(endTurn(s, "skipped", deps, caller));
  if (s.phase === "reveal") return ok(nextTurn(s, deps));
  return refuse("nothing-to-skip");
}

export function playAgain(s: GameState, caller: string): RuleResult {
  if (!isHost(s, caller)) return refuse("not-host");
  if (s.phase !== "podium") return refuse("not-podium");
  return ok(
    bump({
      ...s,
      phase: "lobby",
      players: s.players.map((p) => ({ ...p, score: 0 })),
      round: 0,
      turn: 0,
      queue: [],
      rotation: {},
      current: null,
      startedAt: 0,
      endsAt: 0,
      ops: {},
      lastTurn: null,
      notices: {},
    }),
  );
}
