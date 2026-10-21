// Time-driven changes: pick timeout, hint reveals, draw end, reveal end, drawer grace. The room keeps
// one durable timer per deadline (deadlines()) and every timer runs tick(). Pure.
import { TIMING } from "../config";
import { setConnected } from "./players";
import { bump } from "./state";
import { endTurn, nextTurn, pickWord } from "./turn";
import { settleGuesses } from "./guessing";
import type { Deps, GameState } from "./types";

export const TIMER_NAMES = ["pick", "hint", "draw", "reveal", "grace"] as const;
export type TimerName = (typeof TIMER_NAMES)[number];
export type Deadlines = Partial<Record<TimerName, number>>;

/** When each pending deadline falls (epoch ms). */
export function deadlines(s: GameState): Deadlines {
  const cur = s.current;
  const out: Deadlines = {};
  if (s.phase === "picking") out.pick = s.endsAt;
  if (s.phase === "drawing") out.draw = s.endsAt;
  if (s.phase === "reveal") out.reveal = s.endsAt;
  const nextHint = cur?.hintAt[cur.shown];
  if (s.phase === "drawing" && nextHint !== undefined) out.hint = nextHint;
  if ((s.phase === "picking" || s.phase === "drawing") && cur && cur.graceUntil > 0) out.grace = cur.graceUntil;
  return out;
}

function revealHints(s: GameState, now: number): GameState {
  const cur = s.current;
  if (!cur || s.phase !== "drawing") return s;
  let shown = cur.shown;
  while (shown < cur.hintAt.length && (cur.hintAt[shown] ?? Infinity) <= now) shown++;
  return shown === cur.shown ? s : bump({ ...s, current: { ...cur, shown } });
}

/** One step: the first due deadline, or null when nothing is due. */
function step(s: GameState, deps: Deps): GameState | null {
  const now = deps.now;
  const cur = s.current;
  if ((s.phase === "picking" || s.phase === "drawing") && cur && cur.graceUntil > 0 && cur.graceUntil <= now) return endTurn(s, "drawer-left", deps);
  if (s.phase === "picking" && s.endsAt <= now) return pickWord(s, 1, deps);
  if (s.phase === "drawing" && s.endsAt <= now) return endTurn(s, "time", deps);
  if (s.phase === "reveal" && s.endsAt <= now) return nextTurn(s, deps);
  const hinted = revealHints(s, now);
  return hinted === s ? null : hinted;
}

/** Applies everything that is due at deps.now. */
export function tick(s: GameState, deps: Deps): GameState {
  let state = s;
  for (let i = 0; i < 8; i++) {
    const next = step(state, deps);
    if (!next) break;
    state = next;
  }
  return state;
}

const inTurn = (s: GameState): boolean => s.phase === "picking" || s.phase === "drawing";

/** A socket opened: a player is back (a returning drawer cancels the grace). */
export function connected(s: GameState, id: string): GameState {
  const state = setConnected(s, id, true);
  const cur = state.current;
  if (!cur || cur.drawerId !== id || cur.graceUntil === 0) return state;
  return bump({ ...state, current: { ...cur, graceUntil: 0 } });
}

/** A player's last socket closed: mark them away; a drawer gets the grace period. */
export function disconnected(s: GameState, id: string, deps: Deps): GameState {
  const state = setConnected(s, id, false);
  if (state === s) return s;
  const cur = state.current;
  if (cur && inTurn(state) && cur.drawerId === id) {
    return bump({ ...state, current: { ...cur, graceUntil: deps.now + TIMING.drawerGraceSeconds * 1000 } });
  }
  return settleGuesses(state, deps);
}
