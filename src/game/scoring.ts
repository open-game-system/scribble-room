// Points (spec "Scoring"). Pure.

export const round5 = (x: number): number => Math.round(x / 5) * 5;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** A correct guess: 100 + round(200 × timeLeft / drawTime), rounded to 5; the first guesser gets +50. */
export function guesserPoints(timeLeftMs: number, drawMs: number, first: boolean): number {
  const share = drawMs > 0 ? clamp01(timeLeftMs / drawMs) : 0;
  return round5(100 + Math.round(200 * share)) + (first ? 50 : 0);
}

/** The drawer: round(300 × correct / guessers), rounded to 5, when at least one guessed. */
export function drawerPoints(correct: number, guessers: number): number {
  if (correct <= 0 || guessers <= 0) return 0;
  return round5(Math.round((300 * Math.min(correct, guessers)) / guessers));
}
