# Scribble Room — art style: "Marker & Tape"

**Concept.** A sheet of white paper taped to a warm craft table, everything else drawn with fat markers:
6 px ink outlines, flat bright fills, hard offset shadows (no blur, ever), masking-tape strips, hand-wobble
(±1–2° tilts, hand-drawn box corners). Light, loud, friendly, legible from the back of a bar.

**Why this beats the alternatives.**
- *Chalkboard-meets-neon*: dark and glowy sits too close to Trivia Jam's Aurora Glass night, and neon/chalk greys fight the 12 drawing colours.
- *Riso / zine*: overprint grain and halftone read as noise at 4 m and muddy players' drawings; two-ink limits clash with a 12-colour palette.
- *Marker & Tape* is the only one where the frame speaks the same language as the drawing (marker on paper), so the canvas stays the hero and the brand still shouts. It is also the only light-mode OGS game.

**Mood words:** craft table, kid's sketchbook, bold sharpie, sticker, "ta-da". **Not:** glossy, glass, dark, gradient, painted 3D.

## Palette (tokens in `public/css/tokens.css`)

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--paper` | `#FFF3DC` | page background (table) | ink on it 16.4:1 |
| `--paper-deep` | `#F6E2BC` | panels on paper, wells, rule lines | ink 14.0:1 |
| `--sheet` | `#FFFFFF` | the drawing canvas and cards | ink 17.6:1 |
| `--ink` | `#1B1A1F` | outlines, text, hard shadows | — |
| `--ink-soft` | `#4D4855` | secondary text (min 28 px on TV) | 8.4:1 on paper |
| `--rule` | `#B9CCEB` | notebook rule lines, faint dots | decorative only |
| `--tape` | `#F1DFA6` @ 85% | tape strips | decorative only |
| `--hi-yellow` | `#FFD400` | highlighter: "So close!", mask hint letters, focus ring | ink on it 13.2:1 |
| `--hi-green` | `#3DDC84` | correct guess toast, "You got it!" | ink on it 10.6:1 |
| `--marker-green` | `#12A150` | correct accents / borders | — |
| `--marker-red` | `#E8262F` | timer urgency, danger button | white on it 4.6:1 (big text only) |
| `--marker-blue` | `#1E6FE8` | primary button | white on it 4.6:1 (big text only) |
| `--marker-pink` / `-orange` / `-purple` | `#FF4FA3` / `#FF7A00` / `#8A3FFC` | doodles, logo letters, confetti | decorative |

Rule: **text is ink** on paper/sheet/highlighters; white text only on red/blue/purple at ≥ 24 px bold.
Drawing palette = `PALETTE` in `src/config.ts` (12 vivid marker colours; 0 ink, 1 white/eraser).
Team hues = `TEAM_COLORS` in `src/client/brand/colors.ts` (each with its readable text colour).
Player chip hues = `playerHue(id)` (deterministic, 12 light marker tints so ink initials always read).

## Type (Google Fonts, 2 families)

- **Gluten** (700–900): display. Logo, the hint mask, the revealed word, big numbers, toasts, headings.
- **Lexend** (500–800): UI. Names, guess feed, buttons, inputs, labels. Chosen for legibility at distance.

| Role | TV @1920×1080 | Phone |
|---|---|---|
| Revealed word | Gluten 900, 200 px | Gluten 900, 56 px |
| Hint mask letters | Gluten 800, 96 px in 84×108 boxes | Gluten 800, 34 px in 32×42 boxes |
| Timer number | Gluten 900, 88 px | Gluten 900, 30 px |
| Headline ("Ana is choosing…") | Gluten 800, 72 px | Gluten 800, 30 px |
| Room code | Gluten 900, 120 px, letter-spacing .08em | — |
| Names / scores | Lexend 700, 40 px | Lexend 700, 18 px |
| Guess feed | Lexend 600, 34 px | Lexend 600, 16 px |
| Labels / captions | Lexend 600, 28 px (minimum on TV) | Lexend 600, 14 px |
| Buttons / input | — | Lexend 800, 22 px; input 20 px (≥16 stops iOS zoom) |

Nothing on the TV smaller than 28 px. Words, not icons: every state has a caption (sound off).

## Shapes, lines, texture

- **Outline:** `--line` 6 px on TV, 3 px on phone, always `--ink`, round joins.
- **Shadow:** hard offset `--shadow` (8 px 8 px 0 ink TV; 4 px 4 px 0 phone). Pressed = translate into the shadow.
- **Corners:** hand-drawn box radius `--wobble` (`255px 15px 225px 15px / 15px 225px 15px 255px`) on chips,
  buttons and toasts; the canvas sheet stays a clean rectangle (the drawing is the hero).
- **Tape:** `.tape` strips on panel corners, max 2 per element, never over the drawing surface.
- **Paper:** `.paper` = warm cream + a faint 28 px dot grid + very light fibre noise (SVG turbulence, 4%).
- **Doodles** (`Doodles.tsx`): star, squiggle, arrow, paper clip, pencil, spiral, burst, swirl, heart, scribble.
  Margins only (lobby, podium, cover). Never on the drawing screen except the feed column header.
  No faces on anything, no creatures, no emoji.
- **Tilt:** cards and chips get a ±1–2° rotation (`--tilt-*`); text blocks the eye must read in a hurry (mask, timer, feed rows) stay straight.

## Motion (tokens `--dur-*`, `--ease-*`)

| What | When | How |
|---|---|---|
| Canvas | always | never moves, scales or shakes. Strokes appear as they arrive. |
| Correct-guess toast | a guesser gets it | feed row slides in from the right 220 ms `--ease-pop`, `--hi-green`, stays 2.5 s then settles into the feed; the player's chip does one 1.15× pop |
| Close (phone only) | private | yellow highlighter swipe behind "So close!" 300 ms, gentle 2× x-wiggle |
| Wrong guess | feed | plain fade-in 120 ms, no colour |
| Timer | ring drains linearly every second; last 10 s | ring and number turn `--marker-red`, number pulses 1 → 1.08 → 1 each second in sync with the tick SFX |
| Hint letter | revealed | letter stamps into its box: scale 1.4 → 1, rotate -8° → 0, 260 ms `--ease-pop`, box flashes `--hi-yellow` |
| Reveal | turn ends | the drawing stays untouched; the word card drops onto the top of the frame (translateY -40 → 0, 420 ms pop) with letters stamping 60 ms apart; gains count up over 600 ms |
| Scoreboard | after reveal | rows slide up 80 ms apart; rank changes animate position 420 ms `--ease-out` |
| Podium | game end | blocks rise 3rd → 2nd → 1st, 400 ms apart, `--ease-pop`; winner name stamps in; doodle confetti (stars, squiggles, spirals) falls 3 s in the margins |
| Buttons | press | translate(4px,4px) + shadow 0, 80 ms; release `--ease-pop` |

`prefers-reduced-motion`: all of the above become 120 ms fades; no confetti, no pulse.

## TV layouts (1920×1080; canvas is the focal area, nothing overlaps it)

```
LOBBY                                              DRAWING
+------------------------------------------------+ +------------------------------------------------+
|  [ SCRIBBLE ROOM logo, 420 px wide ]  doodles  | | logo-sm   _ _ A _ _   _ _ _ (mask)    (73) ring|
|                                                | +---------+------------------------+-------------+
|  +------------+   Join at  scribble.room/      | | Ana     |                        | GUESSES     |
|  |    QR      |   ROOM  K7QX   (120 px)        | | draws!  |   white sheet, 4:3     | Ben: cat    |
|  |  (taped)   |                                | |---------|   1040 x 780           | Cy: dog     |
|  +------------+   Classic · 2 rounds · 80 s    | | chips + |   ink border + hard    |[Dee got it! |
|                                                | | scores  |   shadow, tape tabs    |  +240] green|
|  (chip)(chip)(chip)(chip)(chip)(chip) ...      | | (sorted)|   ABOVE the top edge   | ...         |
|  "Waiting for the host to start"               | |         |                        |             |
+------------------------------------------------+ +---------+------------------------+-------------+
                                                     360 px      1080 px                 420 px

PICKING: same frame as DRAWING; sheet blank with "Ana is choosing a word…" (Gluten 72) centred on it.

REVEAL                                             SCOREBOARD (classic) / TEAM LEADERBOARD
+------------------------------------------------+ +------------------------------------------------+
| logo-sm         The word was                   | |   Round 2 of 3                                 |
|          [  ELEPHANT  ] (200 px, card dropped) | |  1 (chip) Dee ......... 1240   +240            |
| +---------+---------------------+------------+ | |  2 (chip) Ana ......... 1100   +180            |
| | gains   | the finished drawing| who got it | | |  3 (chip) Ben ......... 860                    |
| | +240 Dee| (unchanged, 1040 w) | Dee  Ben   | | |  ...  (rows 64 px, 10 visible, then "+12 more")|
| +---------+---------------------+------------+ | |  teams: big bars in TEAM_COLORS, names on bars |
+------------------------------------------------+ +------------------------------------------------+

PODIUM
+------------------------------------------------+
|  doodle confetti (margins)     WINNER          |
|               +------+                          |
|     +------+  |  1   |  +------+                |
|     |  2   |  | Dee  |  |  3   |  (chips on top)|
|     | Ana  |  | 2140 |  | Ben  |                |
|  ---+------+--+------+--+------+---  (ink line) |
|  "Host: Play again on your phone"               |
+------------------------------------------------+
```

## Phone layouts (portrait, thumbs at the bottom)

```
DRAWER                          GUESSER
+------------------------+      +------------------------+
| ELEPHANT        (54)   |      | _ _ A _ _ _ _ _  (54)  |
| +--------------------+ |      | +--------------------+ |
| |                    | |      | |  mini mirror 4:3   | |
| |   canvas 4:3,      | |      | |  (full width,      | |
| |   full width       | |      | |   read-only)       | |
| |                    | |      | +--------------------+ |
| +--------------------+ |      | feed (last 4 rows)     |
| [o][o][o][o][o][o]     |      | "So close!" (yellow)   |
| [o][o][o][o][o][o] 12  |      |                        |
| colours, 48 px min     |      | +--------------+ +----+|
| [ . ][ o ][ O ] brushes|      | | type a guess | |SEND||
| [Erase][Fill][Undo][Clr|      | +--------------+ +----+|
+------------------------+      +------------------------+
Tool targets ≥ 56 px, selected = ink ring + lift.   Input + send ≥ 64 px tall, sticky above keyboard.
```

## Do / Don't

**Do:** ink text on light; one hard shadow per element; captions for every state; tape and doodles in
margins; let the drawing be the only busy thing on screen; keep phone targets ≥ 56 px.

**Don't:** blur shadows or gradients; dark mode; glass; faces on anything (stars, pencils, logo letters
included); emoji; characters (and never one named "Pip"); anything over the drawing surface (toasts live
in the feed column); text under 28 px on the TV; icons without words.

## Art kit and sound

- **OGS art kit:** `pnpm exec tsx scripts/art-kit/render.ts` renders `assets/ogs-art/scribble-room/`
  (icon.png 1024, cover.jpg 1000×1500, logo.png transparent, hero-clean.jpg, tv.jpg, KIT-SHEET.jpg, theme.mp3)
  from the SVG/CSS scenes in `scripts/art-kit/scenes.tsx`. No AI, no paid services.
- **Sound:** `src/client/audio.ts` (engine) + `src/client/audio-notes.ts` (pure note data, unit-tested).
  Everything sits on C major pentatonic so overlapping sounds harmonise. `correct` is the money sound
  (bright rising arpeggio + sparkle); `tick(secondsLeft)` rises in pitch over the last 10 s; `strokeStart`
  is a barely-there pencil hiss (throttled). The TV owns the room's sound; phones play only their own
  private feedback (tap, pick, guessWrong, guessClose, correct, join).
