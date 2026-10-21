// Team assignment (teams mode). Pure.
import { TEAMS } from "../config";
import { shuffled } from "./rng";
import type { GameState, Player } from "./types";

export const teamIds = (count: number): string[] => TEAMS.slice(0, count).map((t) => t.id);

export const membersOf = (players: readonly Player[], team: string): Player[] => players.filter((p) => p.team === team);

/** The team with the fewest members (ties: the earliest team). */
export function smallestTeam(players: readonly Player[], count: number): string {
  const ids = teamIds(count);
  let best = ids[0] ?? "";
  for (const id of ids) if (membersOf(players, id).length < membersOf(players, best).length) best = id;
  return best;
}

/** Everyone dealt round-robin onto the teams, in the given order. */
export function dealTeams(players: readonly Player[], order: readonly string[], count: number): Player[] {
  const ids = teamIds(count);
  const teamOf = new Map(order.map((id, i) => [id, ids[i % ids.length] ?? ""]));
  return players.map((p) => ({ ...p, team: teamOf.get(p.id) ?? "" }));
}

/** Teams mode: keep teams that still exist, move the rest onto the smallest teams. */
export function rebalance(players: readonly Player[], count: number): Player[] {
  const valid = new Set(teamIds(count));
  let out = players.map((p) => (valid.has(p.team) ? p : { ...p, team: "" }));
  for (const p of out) {
    if (p.team !== "") continue;
    const team = smallestTeam(out.filter((q) => q.team !== ""), count);
    out = out.map((q) => (q.id === p.id ? { ...q, team } : q));
  }
  return out;
}

export const clearTeams = (players: readonly Player[]): Player[] => players.map((p) => ({ ...p, team: "" }));

export function shuffleTeams(s: GameState, rand: () => number): GameState {
  const order = shuffled(s.players.map((p) => p.id), rand);
  return { ...s, players: dealTeams(s.players, order, s.settings.teamCount) };
}

/** Teams with at least one member, in team order. */
export const activeTeams = (s: GameState): string[] => teamIds(s.settings.teamCount).filter((t) => membersOf(s.players, t).length > 0);
