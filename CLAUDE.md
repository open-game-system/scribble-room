# Scribble Room

**Project**: a drawing-and-guessing party game (skribbl.io / Drawasaurus style) for OGS: one TV, every
player on a phone. Cloudflare Worker + one actor-kit-2 Durable Object per room; React 19 pages bundled
with esbuild. pnpm only. Name and tunables: `src/config.ts` (the only place the name lives).

## Feedback commands (before every commit)
1. `pnpm typecheck`
2. `pnpm test` — unit + actor tests (vitest)
3. `pnpm test:seam` — real wrangler dev on :8872 (JWKS :8873), WebSocket + browser seam tests
4. `pnpm test:load` — 30+ phones in one room

Dev: `pnpm dev` (:8871). Record the gameplay video: `pnpm record` (game-rig, see `game-rig.config.ts`).

## Knowledge base (load only when relevant)
| Topic | Where |
|---|---|
| Rules, flow, events, scoring, hints | [docs/scribble-room-spec.md](docs/scribble-room-spec.md) |
| Wire contract (views, messages) | [src/shared/protocol.ts](src/shared/protocol.ts) |
| Art direction, tokens, motion | [docs/art-style.md](docs/art-style.md) |
| Word packs and safety rules | [docs/words.md](docs/words.md) |
| What works / what's next | [STATUS.md](STATUS.md) |

## Core principles
- The TV is for across a bar: huge type, captions first, works with sound off; nothing covers the canvas.
- A correct guess is never public: the feed says who got it, never the word. Close guesses are private.
- Canvas ops live only in the `tv` and `canvas` views (shared, one encode per change), never the per-caller player view.
- Parse at the boundary (Zod / actor-kit schemas). No `any`, no `as` casts.
- No paid services: art is SVG/CSS, sound is synthesized.

## Key conventions
- Pure rules in `src/game/*` (injected `now` and seeded RNG); `src/room.ts` is only the wire.
- `src/client/canvas/*` is the one canvas renderer for TV and phones (render in CANVAS units, scale with CSS).
- Words: packs in `src/game/words/packs/*`; family-safe default.

## Keeping docs current
| If you change | Update |
|---|---|
| Rules, timings, scoring | the spec + tests |
| protocol.ts | TV + phone pages, e2e helpers |
| Name | `src/config.ts` and the catalogue entry in STATUS.md |

## Off-limits without Jon's yes
- `~/src/open-game-system` main (catalogue, art kit), production deploys and custom routes.
- Paid generation (fal, Meshy, ElevenLabs).

## Git
`main` on github.com/open-game-system/scribble-room. Commit at every working milestone. Commit messages end
with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
