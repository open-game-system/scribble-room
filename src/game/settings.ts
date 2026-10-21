// Lobby settings and teams. Pure.
import { TIMING } from "../config";
import type { Settings } from "../shared/protocol";
import { isHost } from "./players";
import { bump, updatePlayer } from "./state";
import { clearTeams, dealTeams, rebalance, shuffleTeams, teamIds } from "./teams";
import { type GameState, type RuleResult, ok, refuse } from "./types";

export type SettingsChange = Partial<Settings>;

const defaultDraw = (mode: Settings["mode"]): number => (mode === "teams" ? TIMING.teamDrawSeconds : TIMING.drawSeconds);

/** Switching mode moves the draw time to that mode's default unless the host set one. */
function withMode(s: GameState, next: Settings, change: SettingsChange): GameState {
  const prev = s.settings.mode;
  if (next.mode === prev) return { ...s, settings: next };
  const drawSeconds = change.drawSeconds ?? (s.settings.drawSeconds === defaultDraw(prev) ? defaultDraw(next.mode) : s.settings.drawSeconds);
  const players = next.mode === "teams" ? dealTeams(s.players, s.players.map((p) => p.id), next.teamCount) : clearTeams(s.players);
  return { ...s, settings: { ...next, drawSeconds }, players };
}

export function changeSettings(s: GameState, caller: string, change: SettingsChange): RuleResult {
  if (!isHost(s, caller)) return refuse("not-host");
  if (s.phase !== "lobby") return refuse("not-lobby");
  const next: Settings = { ...s.settings, ...change };
  let out = withMode(s, next, change);
  if (change.mode !== undefined) out = { ...out, modeTouched: true };
  if (out.settings.mode === "teams" && change.teamCount !== undefined) out = { ...out, players: rebalance(out.players, out.settings.teamCount) };
  return ok(bump(out));
}

export function joinTeam(s: GameState, caller: string, team: string): RuleResult {
  if (s.phase !== "lobby") return refuse("not-lobby");
  if (s.settings.mode !== "teams") return refuse("not-teams");
  if (!teamIds(s.settings.teamCount).includes(team)) return refuse("bad-team");
  return ok(bump(updatePlayer(s, caller, (p) => ({ ...p, team }))));
}

export function shuffle(s: GameState, caller: string, rand: () => number): RuleResult {
  if (!isHost(s, caller)) return refuse("not-host");
  if (s.phase !== "lobby") return refuse("not-lobby");
  if (s.settings.mode !== "teams") return refuse("not-teams");
  return ok(bump(shuffleTeams(s, rand)));
}
