// Hint letters and the mask (spec "Hints"). Pure; randomness is injected.

/** Spaces, hyphens and apostrophes always show. */
const ALWAYS_SHOWN = new Set([" ", "-", "'"]);

export const isLetter = (ch: string): boolean => !ALWAYS_SHOWN.has(ch);

/** Indexes (in UTF-16 code units of `word`) of the letters to hide. */
export function letterPositions(word: string): number[] {
  return [...word].flatMap((ch, i) => (isLetter(ch) ? [i] : []));
}

/** h = clamp(floor(letters × 0.35), 1, 4) for words of ≥ 3 letters, never all of them. */
export function hintCount(letters: number): number {
  if (letters < 3) return 0;
  return Math.min(Math.max(Math.floor(letters * 0.35), 1), 4, letters - 1);
}

/** Evenly spaced between 35% and 85% of the draw time (one hint: at 35%). */
export function hintTimes(startedAt: number, drawMs: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const share = count === 1 ? 0.35 : 0.35 + (0.5 * i) / (count - 1);
    return startedAt + Math.round(drawMs * share);
  });
}

/** Which letters to reveal, in order: a seeded pick of distinct letter positions. */
export function hintOrder(word: string, count: number, rand: () => number): number[] {
  const pool = letterPositions(word);
  const picked: number[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const at = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
    picked.push(...pool.splice(at, 1));
  }
  return picked;
}

export type HintPlan = { hintIdx: number[]; hintAt: number[] };

export function planHints(word: string, startedAt: number, drawMs: number, enabled: boolean, rand: () => number): HintPlan {
  if (!enabled) return { hintIdx: [], hintAt: [] };
  const count = hintCount(letterPositions(word).length);
  return { hintIdx: hintOrder(word, count, rand), hintAt: hintTimes(startedAt, drawMs, count) };
}

/** The word as guessers see it: "_" for each hidden letter. */
export function maskOf(word: string, revealed: readonly number[]): string {
  const shown = new Set(revealed);
  return [...word].map((ch, i) => (isLetter(ch) && !shown.has(i) ? "_" : ch)).join("");
}
