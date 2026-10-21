import { describe, expect, it } from "vitest";
import { judgeGuess, normalize } from "./guess";

describe("normalize", () => {
  it.each([
    ["  Hello   World  ", "hello world"],
    ["T-Shirt!", "t shirt"],
    ["Crème Brûlée", "creme brulee"],
    ["don't", "dont"],
    ["...", ""],
    ["", ""],
    ["\tA\nB ", "a b"],
    ["ÉCLAIR", "eclair"],
    ["abc123", "abc123"],
    ["hot_dog", "hot dog"],
    ["naïve café", "naive cafe"],
    ["🎨 paint", "paint"],
  ])("%j -> %j", (input, out) => {
    expect(normalize(input)).toBe(out);
  });
});

describe("judgeGuess: correct", () => {
  it.each([
    ["cat", "cat"],
    ["CAT", "cat"],
    ["  cat ", "cat"],
    ["cat!", "cat"],
    ["a cat", "cat"],
    ["the cat", "cat"],
    ["an apple", "apple"],
    ["hotdog", "hot dog"],
    ["hot-dog", "hot dog"],
    ["Hot Dog", "hot dog"],
    ["tshirt", "t-shirt"],
    ["t shirt", "t-shirt"],
    ["T-Shirt", "t-shirt"],
    ["jack o lantern", "jack-o'-lantern"],
    ["jackolantern", "jack-o'-lantern"],
    ["the time machine", "time machine"],
    ["timemachine", "time machine"],
    ["piñata", "pinata"],
    ["pinata", "piñata"],
    ["a apple", "apple"],
  ])("%j for %j", (guess, word) => {
    expect(judgeGuess(guess, word)).toBe("correct");
  });

  it("does not strip an article that is part of the word itself", () => {
    expect(judgeGuess("the", "the")).toBe("correct");
    expect(judgeGuess("theater", "theater")).toBe("correct");
    expect(judgeGuess("ater", "theater")).not.toBe("correct");
  });
});

describe("judgeGuess: close", () => {
  it.each([
    ["kat", "kate"],
    ["boat", "goat"],
    ["volcamo", "volcano"],

    ["volcno", "volcano"],
    ["lighthuose", "lighthouse"],
    ["lihthose", "lighthouse"],
    ["cats", "cat"],
    ["cat", "cats"],
    ["dogs", "dog"],
    ["boxes", "box"],
    ["box", "boxes"],
    ["butterflies", "butterfly"],
    ["butterfly", "butterflies"],
    ["big volcano", "volcano"],
    ["volcano erupting", "volcano"],
    ["a big red volcano", "volcano"],
    ["the cats", "cat"],
    ["skate board", "skateboards"],
  ])("%j for %j", (guess, word) => {
    expect(judgeGuess(guess, word)).toBe("close");
  });
});

describe("judgeGuess: wrong", () => {
  it.each([
    ["dog", "cat"],
    ["bat", "cat"], // short word: never close by edit distance
    ["ca", "cat"],
    ["at", "cat"],
    ["sun", "run"],
    ["boot", "goat"], // distance 2, word < 8
    ["vulcamo", "volcano"], // distance 2, word 7 letters
    ["volcnao", "volcano"], // transposition = distance 2, word 7 letters
    ["lhgthuose", "lighthouse"], // distance 3
    ["", "cat"],
    ["   ", "cat"],
    ["!!!", "cat"],
    ["the", "cat"],
    ["a", "apple"],
    ["category", "cat"], // contains letters but not the whole word
    ["concatenate", "cat"],
    ["catdog", "cat"],
    ["xcat", "cat"],
  ])("%j for %j", (guess, word) => {
    expect(judgeGuess(guess, word)).toBe("wrong");
  });

  it("is wrong when the word normalises to empty", () => {
    expect(judgeGuess("anything", "!!!")).toBe("wrong");
  });

  it("handles very long input quickly and as wrong", () => {
    const long = "x".repeat(100_000);
    const t = Date.now();
    expect(judgeGuess(long, "lighthouse")).toBe("wrong");
    expect(Date.now() - t).toBeLessThan(500);
  });

  it("a long guess containing the word is still close", () => {
    expect(judgeGuess(`${"blah ".repeat(50)}volcano`, "volcano")).toBe("close");
  });

  it("4-letter words allow distance 1 but not 2", () => {
    expect(judgeGuess("fush", "fish")).toBe("close");
    expect(judgeGuess("fuss", "fish")).toBe("wrong");
  });

  it("8-letter words allow distance 2 but not 3", () => {
    expect(judgeGuess("skatebord", "skateboard")).toBe("close");
    expect(judgeGuess("elefant", "elephant")).toBe("close");
    expect(judgeGuess("elefent", "elephant")).toBe("wrong");
  });

  it("counts letters, not spaces, for the length thresholds", () => {
    // "ice cream" = 8 letters → distance 2 allowed
    expect(judgeGuess("ise creem", "ice cream")).toBe("close");
    // "red car" = 6 letters → distance 2 not allowed
    expect(judgeGuess("rad cor", "red car")).toBe("wrong");
  });
});
