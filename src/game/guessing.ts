// Guesses while drawing (spec step 6). Correct guesses never go public with their text; close guesses
// are a private notice; wrong guesses show in the feed. Pure.
import { TIMING } from "../config";
import { guesserPoints } from "./scoring";
import { bump, drawMs, nameOf, notify, playerOf, pushFeed } from "./state";
import { endTurn, guessersOf } from "./turn";
import { type Deps, type GameState, type RuleResult, ok, refuse } from "./types";

const hasGuessed = (s: GameState, id: string): boolean => s.current?.guessed.some((g) => g.id === id) ?? false;

/** Everyone here who guesses has it (at least one guesser). */
export function allGuessed(s: GameState): boolean {
  const cur = s.current;
  if (!cur || s.phase !== "drawing") return false;
  const here = s.players.filter((p) => p.id !== cur.drawerId && p.connected);
  return here.length > 0 && here.every((p) => hasGuessed(s, p.id));
}

/** Teams: once 80% of guessers have it, the clock drops to at most 10 s. */
function hurry(s: GameState, now: number): GameState {
  const cur = s.current;
  if (!cur || s.settings.mode !== "teams") return s;
  const guessers = guessersOf(s).length;
  if (guessers === 0 || cur.guessed.length < TIMING.teamHurryShare * guessers) return s;
  return { ...s, endsAt: Math.min(s.endsAt, now + TIMING.teamHurrySeconds * 1000) };
}

/** After anything that changes who's guessing: end the turn when everyone has it, or hurry teams. */
export function settleGuesses(s: GameState, deps: Deps): GameState {
  if (allGuessed(s)) return endTurn(s, "all-guessed", deps);
  return hurry(s, deps.now);
}

function correct(s: GameState, caller: string, deps: Deps): GameState {
  const cur = s.current;
  if (!cur) return s;
  const points = guesserPoints(s.endsAt - deps.now, drawMs(s), cur.guessed.length === 0);
  const withGuess: GameState = { ...s, current: { ...cur, guessed: [...cur.guessed, { id: caller, points }] } };
  const fed = pushFeed(withGuess, { kind: "correct", playerId: caller, name: nameOf(s, caller), text: `+${points}` });
  return settleGuesses(bump(notify(fed, caller, "correct", `You got it! +${points}`)), deps);
}

export function guess(s: GameState, caller: string, text: string, deps: Deps): RuleResult {
  const cur = s.current;
  if (s.phase !== "drawing" || !cur) return refuse("not-drawing");
  if (!playerOf(s, caller)) return refuse("not-player");
  if (cur.drawerId === caller) return refuse("drawer-cant-guess");
  if (hasGuessed(s, caller)) return refuse("already-guessed");
  const verdict = deps.judge(text, cur.word);
  if (verdict === "correct") return ok(correct(s, caller, deps));
  if (verdict === "close") return ok(bump(notify(s, caller, "close", "So close!")));
  return ok(bump(pushFeed(s, { kind: "guess", playerId: caller, name: nameOf(s, caller), text })));
}
