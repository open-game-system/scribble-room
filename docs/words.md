# Words

Owner: words/guess owner. Code: `src/game/words/` (packs, `pickChoices`) and `src/game/guess.ts` (`normalize`, `judgeGuess`).

## Pack structure

- `src/game/words/types.ts` — `WordEntry { word, difficulty: "easy" | "medium" | "hard" }`, `Pack { id, name, words }`.
- `src/game/words/packs/<id>.ts` — one file per pack, exporting a `Pack`.
- `src/game/words/index.ts` — `PACKS` (keyed by pack id), `DEFAULT_PACK = "classic"`, and
  `pickChoices({ pack?, difficulty, used, rand })`:
  - `mixed` → one easy, one medium, one hard (in that order); otherwise three distinct words of that difficulty.
  - Never returns a word in `used`. An exhausted difficulty falls back to the nearest other difficulty;
    only when the whole pack is used are words reused (still three distinct).
  - Unknown pack id → the default pack. Deterministic for a given `rand`.

## Adding a pack

1. Create `src/game/words/packs/<id>.ts` exporting `{ id: "<id>", name, words }`.
2. Register it in `PACKS` in `index.ts`.
3. Run `pnpm exec vitest run src/game/words` — every registered pack gets the uniqueness, character,
   length and blocklist checks automatically. Aim for ≥ 40 words per difficulty so a long game doesn't repeat.

## Safety rules (every word, every pack)

The game is played with kids (5 and 3) and in a bar, so a word must work for both:

- Concrete and drawable: nouns, simple verbs, scenes, drawable idioms. No abstract words.
- Lowercase a–z, single spaces, hyphens, apostrophes; 2–20 characters; no duplicates across difficulties.
- None of: violence, weapons, fighting, death, drugs, alcohol, smoking, body parts beyond the basic
  (hand, nose, eye, ear, foot, tooth), gross-out, underwear/nudity, religion, the occult, politics, police/prison,
  brands or trademarks (no "frisbee", "popsicle", "hula hoop"), celebrities or fictional characters.
- No innocent words that invite crude drawings (banana, cucumber, eggplant, hot dog, sausage…).
- Difficulty: easy = a 5-year-old can draw and guess it; medium = one clear object/animal/place; hard = a
  scene, compound idea or idiom.
- The blocklist test in `words.test.ts` catches the obvious cases; it's a backstop, not the review. Read new
  words aloud with both audiences in mind. Innocent words containing a banned substring ("shell") go in
  `SUBSTRING_ALLOW` there.

## Guess judging

`normalize`: strip accents, lowercase, drop apostrophes, every other non-alphanumeric run → one space, trim.
`judgeGuess(guess, word)` compares with spaces removed, after dropping a leading "a"/"an"/"the" from the guess:

- `correct` — exact match ("hotdog" = "hot dog", "tshirt" = "t-shirt", "the cat" = "cat").
- `close` — singular/plural (s, es, y↔ies); Levenshtein 1 for words of ≥ 4 letters, 2 for ≥ 8 (never for
  < 4); or the guess contains the whole word plus other words ("big volcano").
- `wrong` — everything else, including guesses that are empty after normalising. Guesses are cut to 512 chars.
