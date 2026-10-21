// Word packs and the drawer's three choices. Pure and deterministic for a given `rand`.
import { classic } from "./packs/classic";
import type { Pack, WordDifficulty, WordEntry } from "./types";

export type { Pack, WordEntry } from "./types";

export const PACKS: Readonly<Record<string, Pack>> = { [classic.id]: classic };
export const DEFAULT_PACK = "classic";

const LEVELS: readonly WordDifficulty[] = ["easy", "medium", "hard"];

type PickOptions = {
  pack?: string;
  difficulty: "mixed" | WordDifficulty;
  used: ReadonlySet<string>;
  rand: () => number;
};

function pick<T>(items: readonly T[], rand: () => number): T | undefined {
  const i = Math.min(items.length - 1, Math.max(0, Math.floor(rand() * items.length)));
  return items[i];
}

/** Other difficulties to fall back to, nearest first. */
function fallbackOrder(d: WordDifficulty): WordDifficulty[] {
  const at = LEVELS.indexOf(d);
  return [...LEVELS].sort((a, b) => Math.abs(LEVELS.indexOf(a) - at) - Math.abs(LEVELS.indexOf(b) - at));
}

export function pickChoices(opts: PickOptions): [WordEntry, WordEntry, WordEntry] {
  const pack = PACKS[opts.pack ?? DEFAULT_PACK] ?? classic;
  const taken = new Set<string>();
  const slots: [WordDifficulty, WordDifficulty, WordDifficulty] =
    opts.difficulty === "mixed" ? ["easy", "medium", "hard"] : [opts.difficulty, opts.difficulty, opts.difficulty];

  const choose = (want: WordDifficulty): WordEntry => {
    for (const d of fallbackOrder(want)) {
      const free = pack.words.filter((w) => w.difficulty === d && !opts.used.has(w.word) && !taken.has(w.word));
      const hit = pick(free, opts.rand);
      if (hit) return hit;
    }
    // Everything is used: allow reuse, still distinct within this choice.
    const reuse = pack.words.filter((w) => w.difficulty === want && !taken.has(w.word));
    const any = reuse.length > 0 ? reuse : pack.words.filter((w) => !taken.has(w.word));
    const hit = pick(any, opts.rand);
    if (!hit) throw new Error(`pack "${pack.id}" has fewer than 3 words`);
    return hit;
  };

  const take = (want: WordDifficulty): WordEntry => {
    const e = choose(want);
    taken.add(e.word);
    return e;
  };
  return [take(slots[0]), take(slots[1]), take(slots[2])];
}
