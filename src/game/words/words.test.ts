import { describe, expect, it } from "vitest";
import { DEFAULT_PACK, PACKS, pickChoices, type WordEntry } from "./index";

const classic = PACKS[DEFAULT_PACK];

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function wordsOf(entries: readonly WordEntry[]): string[] {
  return entries.map((e) => e.word);
}

describe("PACKS", () => {
  it("has the classic pack as default", () => {
    expect(DEFAULT_PACK).toBe("classic");
    expect(classic?.id).toBe("classic");
    expect(classic?.name.length).toBeGreaterThan(0);
  });

  it("every pack is keyed by its own id", () => {
    for (const [key, pack] of Object.entries(PACKS)) expect(pack.id).toBe(key);
  });

  it("classic has >= 120 easy, >= 120 medium, >= 80 hard, >= 320 total", () => {
    const words = classic?.words ?? [];
    const count = (d: WordEntry["difficulty"]) => words.filter((w) => w.difficulty === d).length;
    expect(count("easy")).toBeGreaterThanOrEqual(120);
    expect(count("medium")).toBeGreaterThanOrEqual(120);
    expect(count("hard")).toBeGreaterThanOrEqual(80);
    expect(words.length).toBeGreaterThanOrEqual(320);
  });

  for (const pack of Object.values(PACKS)) {
    describe(`pack ${pack.id}`, () => {
      it("has no duplicate words (across difficulties)", () => {
        const all = wordsOf(pack.words);
        const dupes = all.filter((w, i) => all.indexOf(w) !== i);
        expect(dupes).toEqual([]);
      });

      it("uses only lowercase a-z, single spaces, hyphens and apostrophes", () => {
        const bad = wordsOf(pack.words).filter((w) => !/^[a-z]+(?:[ '-][a-z]+)*$/.test(w));
        expect(bad).toEqual([]);
      });

      it("keeps words between 2 and 20 chars", () => {
        const bad = wordsOf(pack.words).filter((w) => w.length < 2 || w.length > 20);
        expect(bad).toEqual([]);
      });

      it("contains no blocked words or substrings", () => {
        // Whole-word bans: violence, weapons, drugs, alcohol, crude body parts, religion, politics, gross-out.
        const bannedWords = [
          "gun", "guns", "pistol", "rifle", "bomb", "grenade", "knife", "sword", "dagger", "bullet", "cannon",
          "kill", "murder", "blood", "dead", "death", "corpse", "skull", "grave", "coffin", "army", "battle", "fight",
          "beer", "wine", "vodka", "whiskey", "cocktail", "bar", "drunk", "cigarette", "cigar", "smoke",
          "drug", "drugs", "pill", "syringe", "weed", "joint", "needle",
          "butt", "bum", "boob", "breast", "nipple", "poop", "pee", "fart", "vomit", "snot", "booger", "toilet",
          "bra", "underwear", "naked", "kiss", "bikini", "banana", "eggplant", "cucumber", "hot dog", "sausage",
          "church", "god", "devil", "angel", "cross", "bible", "president", "flag", "police", "prison", "jail",
          "witch", "ghost", "zombie", "vampire", "demon",
        ];
        // Substring bans: anything containing these is out.
        const bannedSubstrings = ["sex", "nude", "porn", "shit", "fuck", "damn", "hell", "ass", "dick", "cock", "tit", "nazi", "gun", "bomb", "blood"];
        const words = wordsOf(pack.words);
        const hits = words.filter((w) => {
          const tokens = w.split(/[ -]/);
          return bannedWords.some((b) => w === b || tokens.includes(b)) ||
            bannedSubstrings.some((s) => w.includes(s) && !SUBSTRING_ALLOW.has(w));
        });
        expect(hits).toEqual([]);
      });
    });
  }
});

// Innocent words that contain a banned substring, reviewed by hand.
const SUBSTRING_ALLOW = new Set<string>(["glass", "grass", "class", "compass", "bass", "shell", "seashell", "hello", "helmet", "jellyfish", "tulip", "kitten", "title", "petition", "mittens", "kite", "kitchen", "hourglass", "grasshopper", "assembly", "eggshell", "turtle shell", "glasses", "sunglasses", "bubble bath", "magnifying glass", "potato", "tortilla", "swimming pass"]);

describe("pickChoices", () => {
  const none: ReadonlySet<string> = new Set();

  it("mixed returns easy, medium, hard in that order", () => {
    const c = pickChoices({ difficulty: "mixed", used: none, rand: seeded(1) });
    expect(c.map((e) => e.difficulty)).toEqual(["easy", "medium", "hard"]);
  });

  for (const d of ["easy", "medium", "hard"] as const) {
    it(`${d} returns 3 distinct ${d} words`, () => {
      const c = pickChoices({ difficulty: d, used: none, rand: seeded(7) });
      expect(c.every((e) => e.difficulty === d)).toBe(true);
      expect(new Set(wordsOf(c)).size).toBe(3);
    });
  }

  it("returns words from the pack", () => {
    const all = new Set(wordsOf(classic?.words ?? []));
    const c = pickChoices({ pack: "classic", difficulty: "mixed", used: none, rand: seeded(3) });
    for (const e of c) expect(all.has(e.word)).toBe(true);
  });

  it("is deterministic for a given rand", () => {
    const a = pickChoices({ difficulty: "mixed", used: none, rand: seeded(42) });
    const b = pickChoices({ difficulty: "mixed", used: none, rand: seeded(42) });
    expect(a).toEqual(b);
  });

  it("varies with rand", () => {
    const seen = new Set<string>();
    for (let s = 0; s < 20; s++) seen.add(wordsOf(pickChoices({ difficulty: "easy", used: none, rand: seeded(s) })).join(","));
    expect(seen.size).toBeGreaterThan(10);
  });

  it("tolerates rand returning 0 and values just below 1", () => {
    expect(new Set(wordsOf(pickChoices({ difficulty: "hard", used: none, rand: () => 0 }))).size).toBe(3);
    expect(new Set(wordsOf(pickChoices({ difficulty: "hard", used: none, rand: () => 0.9999999 }))).size).toBe(3);
  });

  it("never returns a used word", () => {
    const used = new Set<string>();
    const rand = seeded(9);
    for (let i = 0; i < 40; i++) {
      const c = pickChoices({ difficulty: "easy", used, rand });
      for (const e of c) {
        expect(used.has(e.word)).toBe(false);
        used.add(e.word);
      }
    }
  });

  it("falls back to other difficulties when a bucket is exhausted", () => {
    const easy = (classic?.words ?? []).filter((w) => w.difficulty === "easy");
    const used = new Set(wordsOf(easy).slice(1)); // one easy word left
    const c = pickChoices({ difficulty: "easy", used, rand: seeded(5) });
    expect(c.filter((e) => e.difficulty === "easy").map((e) => e.word)).toEqual([easy[0]?.word]);
    expect(new Set(wordsOf(c)).size).toBe(3);
    for (const e of c) expect(used.has(e.word)).toBe(false);
  });

  it("mixed fills an exhausted slot from another difficulty without repeats", () => {
    const hard = (classic?.words ?? []).filter((w) => w.difficulty === "hard");
    const used = new Set(wordsOf(hard));
    const c = pickChoices({ difficulty: "mixed", used, rand: seeded(11) });
    expect(c[0].difficulty).toBe("easy");
    expect(c[1].difficulty).toBe("medium");
    expect(c[2].difficulty).not.toBe("hard");
    expect(new Set(wordsOf(c)).size).toBe(3);
    for (const e of c) expect(used.has(e.word)).toBe(false);
  });

  it("allows reuse only when everything is used, still 3 distinct", () => {
    const all = wordsOf(classic?.words ?? []);
    const used = new Set(all.slice(1)); // one unused word overall
    const c = pickChoices({ difficulty: "medium", used, rand: seeded(2) });
    expect(wordsOf(c)).toContain(all[0]);
    expect(new Set(wordsOf(c)).size).toBe(3);
    const full = new Set(all);
    const d = pickChoices({ difficulty: "mixed", used: full, rand: seeded(2) });
    expect(new Set(wordsOf(d)).size).toBe(3);
  });

  it("unknown pack falls back to the default pack", () => {
    const a = pickChoices({ pack: "nope", difficulty: "easy", used: none, rand: seeded(4) });
    const b = pickChoices({ difficulty: "easy", used: none, rand: seeded(4) });
    expect(a).toEqual(b);
  });
});
