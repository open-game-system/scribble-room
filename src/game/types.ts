// The room's game state and the pure rules' inputs. Browser-safe, no actor-kit runtime.
import type { Difficulty, FeedEntry, Op, Phase, Settings, TurnResult } from "../shared/protocol";

export type WordEntry = { word: string; difficulty: "easy" | "medium" | "hard" };
export type Verdict = "correct" | "close" | "wrong";

/** What the rules need from the outside: the clock, randomness and the word list / guess judge. */
export type Deps = {
  now: number;
  rand: () => number;
  pickChoices: (opts: { difficulty: Difficulty; used: ReadonlySet<string>; rand: () => number }) => readonly [WordEntry, WordEntry, WordEntry];
  judge: (guess: string, word: string) => Verdict;
};

export type Player = {
  id: string;
  name: string;
  avatar: string;
  hue: number;
  /** Committed score (gains are added when a turn ends). */
  score: number;
  /** Team id in teams mode, "" in classic. */
  team: string;
  connected: boolean;
};

export type CorrectGuess = { id: string; points: number };

/** The turn in play (picking, drawing and its reveal). */
export type Turn = {
  drawerId: string;
  choices: WordEntry[];
  /** "" until picked. */
  word: string;
  /** Letter positions to reveal, in order, and when (epoch ms). */
  hintIdx: number[];
  hintAt: number[];
  shown: number;
  guessed: CorrectGuess[];
  /** Epoch ms when an absent drawer's turn is given up; 0 while the drawer is here. */
  graceUntil: number;
};

export type Notice = { kind: string; text: string; seq: number };

export type GameState = {
  code: string;
  phase: Phase;
  settings: Settings;
  /** The host chose a mode: stop switching it automatically. */
  modeTouched: boolean;
  /** The first player to join. The effective host is computed (see players.ts). */
  hostId: string;
  /** In join order. Players are never removed: a dropped phone keeps its seat. */
  players: Player[];
  round: number;
  turn: number;
  /** Who is still to draw this round: player ids (classic) or team ids (teams). */
  queue: string[];
  /** Teams: index of the next member to draw, per team. */
  rotation: Record<string, number>;
  current: Turn | null;
  startedAt: number;
  endsAt: number;
  /** Words already drawn in this room (no repeats). */
  used: string[];
  ops: Record<string, Op>;
  opSeq: number;
  canvasTurn: number;
  lastTurn: TurnResult | null;
  feed: FeedEntry[];
  feedSeq: number;
  notices: Record<string, Notice>;
  seq: number;
};

export type RuleError =
  | "not-host"
  | "not-lobby"
  | "not-teams"
  | "bad-team"
  | "not-enough-players"
  | "not-drawer"
  | "not-picking"
  | "not-drawing"
  | "not-player"
  | "drawer-cant-guess"
  | "already-guessed"
  | "canvas-full"
  | "bad-points"
  | "nothing-to-skip"
  | "not-podium"
  | "room-full";

export type RuleResult = { ok: true; state: GameState } | { ok: false; error: RuleError };

export const ok = (state: GameState): RuleResult => ({ ok: true, state });
export const refuse = (error: RuleError): RuleResult => ({ ok: false, error });
