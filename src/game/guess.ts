// Guess judging: case/space/punctuation/accent-insensitive. See docs/scribble-room-spec.md "Close guesses".

export type Verdict = "correct" | "close" | "wrong";

/** Longest guess we judge; anything longer is cut (chat input is far shorter in practice). */
const MAX_GUESS = 512;

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['‘’ʼ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripArticle(s: string): string {
  const m = /^(?:a|an|the) (.+)$/.exec(s);
  return m?.[1] ?? s;
}

const compact = (s: string): string => s.replace(/ /g, "");

function isPluralPair(a: string, b: string): boolean {
  const pluralOf = (x: string, y: string) =>
    y === `${x}s` || y === `${x}es` || (x.endsWith("y") && y === `${x.slice(0, -1)}ies`);
  return pluralOf(a, b) || pluralOf(b, a);
}

/** Levenshtein distance, bailing out early once it must exceed `max`. */
function withinDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return false;
    prev = row;
  }
  return (prev[b.length] ?? max + 1) <= max;
}

/** True when some run of whole guess tokens (but not all of them) spells the word or its singular/plural. */
function containsWord(tokens: readonly string[], target: string): boolean {
  if (tokens.length < 2) return false;
  for (let i = 0; i < tokens.length; i++) {
    let run = "";
    for (let j = i; j < tokens.length; j++) {
      run += tokens[j] ?? "";
      if (run.length > target.length + 3) break;
      if (j - i + 1 === tokens.length) break;
      if (run === target || isPluralPair(run, target)) return true;
    }
  }
  return false;
}

export function judgeGuess(guess: string, word: string): Verdict {
  const target = compact(normalize(word));
  const g = stripArticle(normalize(guess.slice(0, MAX_GUESS)));
  const attempt = compact(g);
  if (target === "" || attempt === "") return "wrong";
  if (attempt === target) return "correct";
  if (isPluralPair(attempt, target)) return "close";
  const maxEdits = target.length >= 8 ? 2 : target.length >= 4 ? 1 : 0;
  if (maxEdits > 0 && withinDistance(attempt, target, maxEdits)) return "close";
  if (containsWord(g.split(" "), target)) return "close";
  return "wrong";
}
