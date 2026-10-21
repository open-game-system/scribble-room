# Scribble Room — status

**State: committed, pushed, preview deployed. Not verified on a real device** (iPad, phone, Chromecast) and not in the OGS catalogue.

- Preview: https://scribble-room-preview.jonathanrmumm.workers.dev (Worker `scribble-room-preview`, its own rooms; `pnpm deploy:preview`). QR: `media/preview-qr.png`.
  Open it on a TV/laptop/iPad: it makes a room and shows the join code + QR for the phones.
- Gameplay video: `media/gameplay.mp4` (TV + 4 phones, classic game then a teams game). Re-record: `pnpm record` (game-rig).
- Production (`scribble-room.jonathanrmumm.workers.dev`, `pnpm run deploy`) is **not** deployed: needs Jon's yes, with the catalogue entry below.

## What works
- **Rooms**: TV opens `/` → room code + QR; phones join `/join/CODE` with a typed name, or as their OGS profile inside the OGS app (`/host`, `?ogsRoom=`), token verified on the Worker. Refresh keeps your seat and score.
- **Classic mode**: drawer picks 1 of 3 words (easy/medium/hard), draws on the phone; strokes stream live to the TV and every phone's mini mirror. Guesses scored by speed (+ first-guess bonus), drawer scores by share of correct guessers, private "So close!", correct guesses never public, hint letters over time, all-guessed early end, reveal + scoreboard each turn, podium, Play again.
- **Teams mode** (default from 10 players, 2–8 teams): each team draws in turn with a rotating drawer, everyone else guesses, individual + team scores, team leaderboard, 80%-guessed hurry (clock drops to 10 s), late joiners onto the smallest team.
- **Host controls**: mode, rounds 1–5, draw time 40–180 s, word difficulty, hints, team count/shuffle, Start, **Skip drawing** (moderation hook), Play again. Host hands over if the host's phone drops.
- **Drawing tools**: 12 colours, 3 brush sizes, eraser, bucket fill, undo, clear. Smooth strokes (quadratic through midpoints), points batched every ~50 ms (≤ 64 points per chunk), integer coords on a 1200×900 canvas.
- **Words**: 412 family-safe words (150 easy / 160 medium / 102 hard) in a pack structure (`src/game/words/packs/`); close-guess judging (typos, plurals, spacing).
- **TV**: "Marker & Tape" look (light paper, fat marker ink; no faces, no emoji), huge type, captions-first, canvas never covered, 5% safe area, phase music + synthesized SFX, OGS launcher pause/resume silences audio, no code/QR on an OGS TV.
- **Phone**: big thumb targets, drawer canvas + tools, guesser input + mirror (stays above the iOS keyboard via visualViewport — unverified on a real iPhone).
- **OGS art kit** (rendered from SVG/CSS, no paid generation): `assets/ogs-art/scribble-room/` icon.png, cover.jpg, logo.png, hero-clean.jpg, tv.jpg, theme.mp3, KIT-SHEET.jpg.

## Tests
- `pnpm test`: 297 unit + actor tests (rules, scoring, hints, rotation, teams, canvas ops, views never leak the word, timers on the actor-kit simulator, words, guess judging, canvas renderer, TV/phone view logic, audio).
- `pnpm test:seam`: 24 seam tests over real WebSockets and real pages against wrangler dev: a whole classic game, teams (rotation, hurry, leaderboard, late joiner, drawer grace, host hand-over), reconnects (drawer/guesser/TV refresh, undo/clear convergence, host skip), OGS phone token/guest/seat theft, OGS TV in a stand-in launcher (pause/resume audio), OGS WebView bridge (cast view URL), one turn through the real TV + 3 phone pages.
- `pnpm test:load`: one room, TV + 40 phones and TV + 60 phones, teams of 6, streamed strokes + guesses. 60 phones locally: guess → TV feed p95 160 ms, stroke → TV op p95 44 ms, join p95 299 ms, no drops.
- `pnpm typecheck`: clean.

## What's next
1. **Play it on the real devices** (iPad, phones, Chromecast through the OGS app): keyboard behaviour on iPhone, drawing feel on the iPad, TV readability at bar distance.
2. **Bandwidth at 60 phones**: each phone's player socket gets ~400 KB per turn, because the players and feed arrays are resent whole on every guess. Make them records keyed by id/seq (delta sends only changes).
3. **Guess-text moderation**: wrong guesses show publicly in the TV feed; there's no profanity filter yet (only the host's Skip drawing). Decide: filter, or hide wrong guesses in bars.
4. More word packs (holidays, animals-only for little kids, a harder "pub" pack), and a pack picker in the lobby.
5. Production deploy + OGS catalogue entry (below) + art kit into `open-game-system/apps/tv/public/art/scribble-room/` — needs Jon's yes.
6. Spectator TVs in big rooms (a second TV for the far end of a bar).

## OGS catalogue entry (ready to add; not added)
Test first in `~/src/open-game-system` (`services/api/test/catalogue.test.ts`: add `"scribble-room"` to the expected ordered list), then add to `SEED` in `services/api/src/catalogue.ts`, and copy `assets/ogs-art/scribble-room/*` to `apps/tv/public/art/scribble-room/`:

```ts
  {
    appId: "scribble-room",
    name: "Scribble Room",
    tagline: "One draws, everyone guesses. Draw on your phone; the whole room shouts at the TV.",
    shape: "couch",
    tv: "required",
    startUrl: workers("scribble-room"),
    roles: [
      { id: "drawer", label: "Drawer", audience: "grownup" },
      { id: "guesser", label: "Guesser", audience: "grownup" },
    ],
    art: {
      icon: "/art/scribble-room/icon.png",
      cover: "/art/scribble-room/cover.jpg",
      logo: "/art/scribble-room/logo.png",
      heroClean: "/art/scribble-room/hero-clean.jpg",
      theme: "/art/scribble-room/theme.mp3",
      tile: "/art/scribble-room/tv.jpg",
      hero: "/art/scribble-room/tv.jpg",
    },
    shop: { ages: "6+", minutes: [10, 30], players: "2-60" },
  },
```
`startUrl` assumes the production Worker name `scribble-room`; the preview is a separate Worker.
