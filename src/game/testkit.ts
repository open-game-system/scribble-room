// Test fixtures for the pure rules: a tiny word list, a simple judge, a seeded clock-and-dice.
import { seeded } from "./rng";
import { apply, type GameEvent } from "./rules";
import { connected } from "./clock";
import { createGame } from "./state";
import type { Deps, GameState, Verdict, WordEntry } from "./types";

export const FIXTURE_WORDS: WordEntry[] = [
  { word: "cat", difficulty: "easy" },
  { word: "rainbow", difficulty: "medium" },
  { word: "ice cream", difficulty: "hard" },
  { word: "dog", difficulty: "easy" },
  { word: "volcano", difficulty: "medium" },
  { word: "lighthouse", difficulty: "hard" },
  { word: "sun", difficulty: "easy" },
  { word: "pirate", difficulty: "medium" },
  { word: "skateboard", difficulty: "hard" },
];

/** One easy, one medium, one hard not yet used (cycles when the list runs out). */
export function fixtureChoices(opts: { used: ReadonlySet<string> }): [WordEntry, WordEntry, WordEntry] {
  const fresh = FIXTURE_WORDS.filter((w) => !opts.used.has(w.word));
  const pool = fresh.length >= 3 ? fresh : FIXTURE_WORDS;
  const of = (d: WordEntry["difficulty"]): WordEntry => pool.find((w) => w.difficulty === d) ?? { word: "cat", difficulty: d };
  return [of("easy"), of("medium"), of("hard")];
}

/** Exact (case-insensitive) is correct; the word plus or minus a trailing "s" is close. */
export function fixtureJudge(guess: string, word: string): Verdict {
  const g = guess.trim().toLowerCase();
  if (g === word) return "correct";
  if (g === `${word}s` || `${g}s` === word) return "close";
  return "wrong";
}

export const T0 = Date.UTC(2026, 9, 20, 20, 0, 0);

export function deps(now: number, seed = 1): Deps {
  return { now, rand: seeded(seed), pickChoices: fixtureChoices, judge: fixtureJudge };
}

/** Applies events and throws on a refusal (tests read better). */
export function must(s: GameState, caller: string, e: GameEvent, now = T0): GameState {
  const r = apply(s, caller, e, deps(now));
  if (!r.ok) throw new Error(`${e.type} by ${caller} refused: ${r.error}`);
  return r.state;
}

/** A lobby with these players admitted and connected (the first one hosts). */
export function lobby(ids: readonly string[]): GameState {
  let s = createGame("ABCD");
  for (const id of ids) {
    s = must(s, "worker", { type: "ADMIT", id, name: id.toUpperCase(), avatar: "" });
    s = connected(s, id);
  }
  return s;
}

export const drawerOf = (s: GameState): string => s.current?.drawerId ?? "";
