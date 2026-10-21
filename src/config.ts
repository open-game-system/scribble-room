// The one place the game's name and tunable numbers live. Renaming the game = edit GAME here
// (plus the OGS catalogue entry in STATUS.md). Browser-safe: imported by the Worker, the room and the pages.

export const GAME = {
  name: "Scribble Room",
  appId: "scribble-room",
  /** Short prefix for localStorage keys. */
  storagePrefix: "sr",
} as const;

/** The drawing palette. Index on the wire; hex is art direction's (docs/art-style.md). Count is fixed. */
export const PALETTE = [
  "#1b1a1f", // ink
  "#ffffff", // white (also what the eraser paints)
  "#e8262f", // red
  "#ff7a00", // orange
  "#ffd400", // yellow
  "#22b14c", // green
  "#1e6fe8", // blue
  "#8a3ffc", // purple
  "#ff4fa3", // pink
  "#8b5a2b", // brown
  "#9a9aa3", // grey
  "#35c9f0", // sky
] as const;
export const PALETTE_SIZE = 12;
/** Brush widths in canvas units (the canvas is CANVAS.w × CANVAS.h). */
export const BRUSHES = [6, 16, 36] as const;
/** The canvas paper colour (what the eraser paints and what a fill compares against). */
export const CANVAS_BG = "#ffffff";
/** The logical drawing surface every device scales: 4:3, integer coordinates on the wire. */
export const CANVAS = { w: 1200, h: 900 } as const;

export const TIMING = {
  /** Seconds the drawer has to pick a word before the middle one is picked for them. */
  pickSeconds: 15,
  /** Default drawing time; the host can choose 40–180. */
  drawSeconds: 80,
  teamDrawSeconds: 60,
  minDrawSeconds: 40,
  maxDrawSeconds: 180,
  /** The reveal + scoreboard beat after each turn. */
  revealSeconds: 7,
  /** Team mode: once this share of guessers is in, the clock drops to at most `teamHurrySeconds`. */
  teamHurryShare: 0.8,
  teamHurrySeconds: 10,
  /** A drawer whose phone dropped gets this long to come back before the turn is skipped. */
  drawerGraceSeconds: 15,
} as const;

export const ROOM = {
  minPlayers: 2,
  maxPlayers: 64,
  /** Team mode is offered from this many players; it is the default from `teamDefaultFrom`. */
  teamMinPlayers: 4,
  teamDefaultFrom: 10,
  maxTeams: 8,
  defaultRounds: 2,
  maxRounds: 5,
  /** Guess feed entries kept in the view. */
  feedSize: 24,
} as const;

/** Team ids and names, in order. Names are colours/objects, never characters. */
export const TEAMS = [
  { id: "t0", name: "Tangerine" },
  { id: "t1", name: "Teal" },
  { id: "t2", name: "Plum" },
  { id: "t3", name: "Lime" },
  { id: "t4", name: "Coral" },
  { id: "t5", name: "Indigo" },
  { id: "t6", name: "Gold" },
  { id: "t7", name: "Rose" },
] as const;
