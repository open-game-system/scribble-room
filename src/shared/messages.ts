// Phone → room messages, parsed at the room's boundary (server side; keeps classic zod out of the pages).
import { z } from "zod";
import { BRUSHES, CANVAS, PALETTE_SIZE, ROOM, TIMING } from "../config";
import { DIFFICULTIES, MODES } from "./protocol";

const Coord = z.number().int().min(0).max(Math.max(CANVAS.w, CANVAS.h));

export const Msg = {
  /** Host only, lobby only. Partial: only the given fields change. */
  SETTINGS: z.object({
    mode: z.enum(MODES).optional(),
    rounds: z.number().int().min(1).max(ROOM.maxRounds).optional(),
    drawSeconds: z.number().int().min(TIMING.minDrawSeconds).max(TIMING.maxDrawSeconds).optional(),
    difficulty: z.enum(DIFFICULTIES).optional(),
    hints: z.boolean().optional(),
    teamCount: z.number().int().min(2).max(ROOM.maxTeams).optional(),
  }),
  /** Teams mode lobby: move yourself to a team. */
  JOIN_TEAM: z.object({ team: z.string().max(4) }),
  /** Host: shuffle everyone into balanced teams. */
  SHUFFLE_TEAMS: z.object({}),
  /** Host: start the game (needs ROOM.minPlayers connected). */
  START: z.object({}),
  /** Drawer while picking: 0..2. */
  PICK: z.object({ index: z.number().int().min(0).max(2) }),
  /** Drawer while drawing: one chunk of a stroke (points batched on the phone, ≤ 64 points). */
  STROKE: z.object({
    stroke: z.number().int().min(0).max(65535),
    color: z.union([z.number().int().min(0).max(PALETTE_SIZE - 1), z.literal(255)]),
    size: z.number().int().min(0).max(BRUSHES.length - 1),
    pts: z.array(Coord).min(2).max(128),
  }),
  FILL: z.object({
    stroke: z.number().int().min(0).max(65535),
    color: z.number().int().min(0).max(PALETTE_SIZE - 1),
    x: Coord,
    y: Coord,
  }),
  /** Drawer: remove the last stroke (all its chunks). */
  UNDO: z.object({}),
  /** Drawer: wipe the canvas. */
  CLEAR: z.object({}),
  /** Guessers while drawing. */
  GUESS: z.object({ text: z.string().trim().min(1).max(60) }),
  /** Host: skip the current drawing (moderation), any phase of a turn. */
  SKIP: z.object({}),
  /** Host on the podium: back to the lobby with the same people, scores reset. */
  PLAY_AGAIN: z.object({}),
} as const;

export type MsgType = keyof typeof Msg;

