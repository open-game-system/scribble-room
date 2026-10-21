// The room's reducer: one event from one caller at deps.now. Pure (randomness and the clock injected).
import { clear, fill, stroke, undo, type StrokeChunk } from "./canvas";
import { guess } from "./guessing";
import { admit, canStart, isHost, type Admission } from "./players";
import { changeSettings, joinTeam, shuffle, type SettingsChange } from "./settings";
import { isPlayer } from "./state";
import { pick, playAgain, skip, startGame } from "./turn";
import { type Deps, type GameState, type RuleResult, ok, refuse } from "./types";

export type GameEvent =
  | ({ type: "ADMIT" } & Admission)
  | ({ type: "SETTINGS" } & SettingsChange)
  | { type: "JOIN_TEAM"; team: string }
  | { type: "SHUFFLE_TEAMS" }
  | { type: "START" }
  | { type: "PICK"; index: number }
  | ({ type: "STROKE" } & StrokeChunk)
  | { type: "FILL"; stroke: number; color: number; x: number; y: number }
  | { type: "UNDO" }
  | { type: "CLEAR" }
  | { type: "GUESS"; text: string }
  | { type: "SKIP" }
  | { type: "PLAY_AGAIN" };

function start(s: GameState, caller: string, deps: Deps): RuleResult {
  if (!isHost(s, caller)) return refuse("not-host");
  if (s.phase !== "lobby") return refuse("not-lobby");
  if (!canStart(s)) return refuse("not-enough-players");
  return ok(startGame(s, deps));
}

function playerEvent(s: GameState, caller: string, e: Exclude<GameEvent, { type: "ADMIT" }>, deps: Deps): RuleResult {
  switch (e.type) {
    case "SETTINGS": {
      const { type: _t, ...change } = e;
      return changeSettings(s, caller, change);
    }
    case "JOIN_TEAM":
      return joinTeam(s, caller, e.team);
    case "SHUFFLE_TEAMS":
      return shuffle(s, caller, deps.rand);
    case "START":
      return start(s, caller, deps);
    case "PICK":
      return pick(s, caller, e.index, deps);
    case "STROKE":
      return stroke(s, caller, e);
    case "FILL":
      return fill(s, caller, e);
    case "UNDO":
      return undo(s, caller);
    case "CLEAR":
      return clear(s, caller);
    case "GUESS":
      return guess(s, caller, e.text, deps);
    case "SKIP":
      return skip(s, caller, deps);
    case "PLAY_AGAIN":
      return playAgain(s, caller);
  }
}

export function apply(s: GameState, caller: string, e: GameEvent, deps: Deps): RuleResult {
  if (e.type === "ADMIT") return admit(s, e);
  if (!isPlayer(s, caller)) return refuse("not-player");
  return playerEvent(s, caller, e, deps);
}
