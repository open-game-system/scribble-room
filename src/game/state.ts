// Creating the game state and small immutable helpers every rule shares.
import { ROOM, TIMING } from "../config";
import type { FeedEntry } from "../shared/protocol";
import type { GameState, Player } from "./types";

export function createGame(code: string): GameState {
  return {
    code,
    phase: "lobby",
    settings: { mode: "classic", rounds: ROOM.defaultRounds, drawSeconds: TIMING.drawSeconds, difficulty: "mixed", hints: true, teamCount: 2 },
    modeTouched: false,
    hostId: "",
    players: [],
    round: 0,
    turn: 0,
    queue: [],
    rotation: {},
    current: null,
    startedAt: 0,
    endsAt: 0,
    used: [],
    ops: {},
    opSeq: 0,
    canvasTurn: 0,
    lastTurn: null,
    feed: [],
    feedSeq: 0,
    notices: {},
    seq: 0,
  };
}

/** Every accepted (non-canvas) event bumps seq. */
export const bump = (s: GameState): GameState => ({ ...s, seq: s.seq + 1 });

export const playerOf = (s: GameState, id: string): Player | undefined => s.players.find((p) => p.id === id);

export const isPlayer = (s: GameState, id: string): boolean => s.players.some((p) => p.id === id);

export function updatePlayer(s: GameState, id: string, change: (p: Player) => Player): GameState {
  return { ...s, players: s.players.map((p) => (p.id === id ? change(p) : p)) };
}

export function pushFeed(s: GameState, entry: Omit<FeedEntry, "seq">): GameState {
  const seq = s.feedSeq + 1;
  return { ...s, feedSeq: seq, feed: [...s.feed, { ...entry, seq }].slice(-ROOM.feedSize) };
}

export function notify(s: GameState, playerId: string, kind: string, text: string): GameState {
  return { ...s, notices: { ...s.notices, [playerId]: { kind, text, seq: s.seq + 1 } } };
}

export const nameOf = (s: GameState, id: string): string => playerOf(s, id)?.name ?? "";

export const drawMs = (s: GameState): number => s.settings.drawSeconds * 1000;
