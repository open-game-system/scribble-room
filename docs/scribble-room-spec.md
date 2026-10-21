# Scribble Room — spec

A drawing and guessing party game in the Drawasaurus / skribbl.io family, built for OGS: one TV everyone
watches, every player on a phone. **Audience: mixed rooms, from families with kids to a bar of adults.**
The default word list is clean and family-safe. Name is final ("Scribble Room"); it lives in `src/config.ts` only.

## Roles

| Screen | Who | Shows | Does |
|---|---|---|---|
| TV | the room | Room code + QR (plain browser only), the live drawing huge, the hint mask, timer, guess feed with correct-guess toasts, reveal, scoreboard, team leaderboard, podium | Nothing: nobody touches it |
| Drawer phone | the player whose turn it is | 3 word choices, then canvas + tools (colours, 3 brushes, eraser, fill, undo, clear) | Picks, draws |
| Guesser phone | everyone else | Hint mask, timer, a mini mirror of the canvas, a guess input with big send | Types guesses |
| Host phone | first player to join (any player phone) | Same as above plus lobby settings, Start, Skip drawing, Play again | Runs the room |

## Flow

1. TV opens `/` → a new room; TV shows code + QR. In the OGS app, the start phone opens `/host`.
2. Phones join `/join/CODE`: OGS profile name/avatar inside the OGS app, a typed name otherwise.
3. Lobby: host picks mode (classic / teams), rounds (1–5), draw time (40–180 s, default 80; 60 in teams),
   word difficulty (mixed / easy / medium / hard) and hints on/off. Teams mode: team count and each player's team.
4. Host presses Start (≥ 2 players).
5. **Picking** (15 s): the drawer sees 3 words (mixed = one easy, one medium, one hard). Time out picks the middle one.
6. **Drawing**: strokes stream live to the TV and every phone's mirror. Guessers type guesses.
   - Correct → private "You got it!", the feed shows "Ana guessed it! +240" (never the word); the guesser now sees the word.
   - Close (one typo, or plural/singular) → a private "So close!" only to that guesser; nothing public.
   - Wrong → shows in the feed (it's half the fun).
   - Hint letters reveal over time (if hints are on).
   - Ends when every guesser has it, the clock runs out, the host skips, or the drawer drops for 15 s.
   - Teams mode: once 80% of guessers have it, the clock drops to at most 10 s.
7. **Reveal** (7 s): the word big on the TV, who got it and points gained, then the scoreboard (team leaderboard in teams mode).
8. Next turn. After the last turn of the last round → **Podium** (top 3, or the winning team then its MVP).
9. Host: Play again → lobby, same people, scores reset.

### Turn order
- **Classic**: every round, each player draws once, in join order. Late joiners are appended to this round's order.
- **Teams**: every round, each team draws once (team order t0, t1, …); the drawer is that team's next member
  in rotation (so different people draw for a team across rounds). Everyone except the drawer guesses, own team included.
- A drawer who isn't connected when their turn comes is skipped.

### Scoring
- Guesser: `100 + round(200 × timeLeft / drawTime)`, rounded to 5; first guesser +50 bonus.
- Drawer: `round(300 × correctGuessers / guessers)` rounded to 5, when at least one guessed.
- Teams: a team's score is the sum of its members' gains (drawing and guessing).
- Host skip: nobody scores that turn.

### Hints
Spaces, hyphens and apostrophes always show. Letters: `h = clamp(floor(letters × 0.35), 1, 4)` hints for
words of ≥ 3 letters, revealed at evenly spaced times between 35% and 85% of the draw time, never the last
hidden letter. Random letter (seeded). Hints off → mask stays all underscores.

### Close guesses
Case/space/punctuation-insensitive. Correct = exact normalised match (accept "a/an/the" prefix, and the word
without spaces). Close = Levenshtein 1 for words ≥ 4 letters (2 for ≥ 8), or singular/plural of the word.

### Reconnects and late joiners
- A refreshed phone keeps its seat (signed id in localStorage) and its score; the room marks it disconnected meanwhile.
- A late joiner joins mid-turn as a guesser of the current word; teams mode puts them on the smallest team.
- The TV refresh rejoins with its `k` token and redraws the canvas from the room.

## Events

| EVENT | who sends it | payload |
|---|---|---|
| ADMIT | Worker (system), after the OGS token / guest name | `{ id, name, avatar }` |
| SETTINGS | host, lobby | partial `{ mode, rounds, drawSeconds, difficulty, hints, teamCount }` |
| JOIN_TEAM | player, lobby, teams mode | `{ team }` |
| SHUFFLE_TEAMS | host, lobby | `{}` |
| START | host, lobby | `{}` |
| PICK | drawer, picking | `{ index: 0..2 }` |
| STROKE | drawer, drawing | `{ stroke, color, size, pts: [x,y,…] }` (≤ 64 points, batched ~every 50 ms) |
| FILL | drawer, drawing | `{ stroke, color, x, y }` |
| UNDO / CLEAR | drawer, drawing | `{}` |
| GUESS | guesser, drawing | `{ text }` |
| SKIP | host, picking/drawing | `{}` |
| PLAY_AGAIN | host, podium | `{}` |
| timers | room | pick timeout, hint reveal, draw end, hurry, reveal end, drawer grace |

The wire contract is `src/shared/protocol.ts`. Views: `tv` (shared, includes the canvas ops), `player`
(per caller, no canvas), `canvas` (shared, canvas only: every phone opens a second socket for the mirror,
so 60 phones cost one encode per stroke chunk).

## Screens

- **TV** (1920×1080, readable from across a bar, works with sound off): lobby (logo, code, QR, joined
  players, mode), picking ("Ana is choosing a word…"), drawing (canvas ~60% of the screen, mask huge, timer
  ring, guess feed column, correct-guess toasts, drawer name), reveal (word huge, gains), scoreboard /
  team leaderboard, podium. On an OGS TV: no code, no QR.
- **Phone**: name form (plain browser only), lobby (players, settings for the host), drawer picking,
  drawer canvas + tools (thumb-sized), guesser input + mini mirror, reveal, podium. Big touch targets.

## Decisions and assumptions
- actor-kit-2 (as the newest OGS games); canvas ops in a keyed record so deltas carry only new chunks.
- No moderation in v1 beyond the host's Skip drawing.
- No paid assets: all art is SVG/CSS in code; sound is synthesized Web Audio.
- Free-text guesses are shown in the feed; profanity filtering of guesses is out of scope for v1 (flagged in STATUS.md).
