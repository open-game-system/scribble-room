// The wire contract between the room (src/room.ts) and the pages (src/client/*). Browser-safe.
// View schemas are actor-kit binary schemas (also Standard Schemas: `TvViewSchema.parse(json)` validates a
// boot snapshot). Message payloads are Zod, parsed at the room's boundary.
//
// Owner: the room/game-core owner. Changing a field here changes three surfaces (room, TV, phone):
// add fields rather than rename them, and tell the TV and phone owners.

import { array, boolean, enumOf, float64, nullable, record, schema, string, uint8, uint16, uint32, type Infer } from "@actor-kit/core";

// ---------- Shared pieces ----------

export const PHASES = ["lobby", "picking", "drawing", "reveal", "podium"] as const;
export type Phase = (typeof PHASES)[number];
export const MODES = ["classic", "teams"] as const;
export type Mode = (typeof MODES)[number];
export const DIFFICULTIES = ["mixed", "easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const SeatSchema = schema({
  id: string,
  name: string,
  /** OGS avatar URL, or "" for a guest. */
  avatar: string,
  /** Stable colour index into PALETTE for this player's chip (assigned at join). */
  hue: uint8,
  score: uint32,
  /** Team id from config TEAMS, or "" in classic mode. */
  team: string,
  connected: boolean,
  /** Has guessed the current word (always false outside drawing/reveal). */
  guessed: boolean,
});
export type Seat = Infer<typeof SeatSchema>;

export const TeamSchema = schema({ id: string, name: string, score: uint32 });
export type Team = Infer<typeof TeamSchema>;

/**
 * The public guess feed. Correct guesses never carry the text. A close guess is never in the feed
 * (it is a private notice to its guesser). Wrong guesses show their text.
 */
export const FeedSchema = schema({
  seq: uint32,
  kind: enumOf(["guess", "correct", "join", "leave", "skip", "system"]),
  playerId: string,
  name: string,
  /** The guess text for "guess"; points for "correct" as a string ("+240"); a message for "system". */
  text: string,
});
export type FeedEntry = Infer<typeof FeedSchema>;

/** One turn's result, shown during reveal and kept for the podium recap. */
export const TurnResultSchema = schema({
  turn: uint16,
  word: string,
  drawerId: string,
  /** Points gained this turn, by player id (drawer included). */
  gains: record(uint32),
  /** Points gained this turn, by team id (teams mode). */
  teamGains: record(uint32),
  /** "all-guessed" | "time" | "skipped" | "drawer-left" */
  reason: string,
});
export type TurnResult = Infer<typeof TurnResultSchema>;

export const SettingsSchema = schema({
  mode: enumOf(MODES),
  rounds: uint8,
  drawSeconds: uint16,
  difficulty: enumOf(DIFFICULTIES),
  hints: boolean,
  /** Teams mode: how many teams (2..ROOM.maxTeams). */
  teamCount: uint8,
});
export type Settings = Infer<typeof SettingsSchema>;

/** Everything every screen may know. No secret words here. */
const publicShape = {
  code: string,
  phase: enumOf(PHASES),
  settings: SettingsSchema,
  hostId: string,
  players: array(SeatSchema),
  teams: array(TeamSchema),
  /** 1-based round and the round count; turn number counts every turn of the game. */
  round: uint8,
  turn: uint16,
  drawerId: string,
  /** Teams mode: the drawing team's id. */
  drawingTeam: string,
  /**
   * The word as guessers see it: one char per letter, "_" for hidden letters, real chars for revealed
   * hints and for spaces/hyphens/apostrophes. "" outside drawing. Its length is the word's length.
   */
  mask: string,
  /** Epoch ms (server clock) when the current phase's clock runs out; 0 when there is none. */
  endsAt: float64,
  /** Epoch ms (server clock) when the current phase's clock started; 0 when there is none. */
  startedAt: float64,
  /** The last finished turn (word revealed). null before the first reveal. */
  lastTurn: nullable(TurnResultSchema),
  feed: array(FeedSchema),
  /** Bumped by every accepted event: a cheap "something happened" for animations. */
  seq: uint32,
};

/**
 * The canvas: an ordered record of ops keyed by zero-padded seq ("000042"). Render in key order.
 * Each draw op continues its stroke (`stroke`), so a stroke's chunks join up. A delta carries only the
 * added/removed keys; an undo removes a stroke's keys; a clear empties the record.
 */
export const OpSchema = schema({
  seq: uint32,
  stroke: uint16,
  /** "line" points are interleaved x,y in CANVAS units; "fill" has one point (the seed). */
  kind: enumOf(["line", "fill"]),
  /** PALETTE index; 255 = eraser (paints the canvas background). */
  color: uint8,
  /** BRUSHES index. */
  size: uint8,
  pts: array(uint16),
});
export type Op = Infer<typeof OpSchema>;
export const ERASER = 255;

const canvasShape = {
  /** The turn these ops belong to; a new turn starts an empty canvas. */
  canvasTurn: uint16,
  ops: record(OpSchema),
};

export const TvViewSchema = schema({ ...publicShape, ...canvasShape });
export type TvView = Infer<typeof TvViewSchema>;

/** A second socket per phone (role "canvas"): the live drawing only, shared by every viewer. */
export const CanvasViewSchema = schema({ phase: enumOf(PHASES), drawerId: string, ...canvasShape });
export type CanvasView = Infer<typeof CanvasViewSchema>;

export const PlayerViewSchema = schema({
  ...publicShape,
  me: schema({
    id: string,
    isHost: boolean,
    isDrawer: boolean,
    /** The drawer, or a player who already guessed, sees the word; "" otherwise. */
    word: string,
    /** The drawer's three choices while picking; [] otherwise. */
    choices: array(schema({ word: string, difficulty: enumOf(["easy", "medium", "hard"]) })),
    guessed: boolean,
    /** Private nudges: "close" (your guess was close), "not-your-turn", "too-fast"…; seq to replay. */
    notice: nullable(schema({ kind: string, text: string, seq: uint32 })),
  }),
});
export type PlayerView = Infer<typeof PlayerViewSchema>;

export const socketPath = (code: string, id: string, sig: string) => `/api/${code}/ws?id=${encodeURIComponent(id)}&sig=${encodeURIComponent(sig)}`;

// Messages (Zod) are in ./messages.ts and boot payloads (zod/mini) in ./boot.ts, so this module stays
// zod-free for the browser bundle.
