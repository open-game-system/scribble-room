// The lobby's host controls and what the phone tells OGS about this sitting. Pure.
import { ROOM, TEAMS, TIMING } from "../../config";
import type { Phase, Seat, Settings } from "../../shared/protocol";

/** Draw-time choices the host steps through (seconds). */
export const DRAW_TIMES = [40, 60, 80, 100, 120, 150, 180].filter((s) => s >= TIMING.minDrawSeconds && s <= TIMING.maxDrawSeconds);

/** The next value in `list` from `cur` in direction `dir`, clamped; a value off the list snaps to its neighbour. */
export function stepIn(list: readonly number[], cur: number, dir: 1 | -1): number {
  const first = list[0] ?? cur;
  const last = list[list.length - 1] ?? cur;
  if (dir > 0) return list.find((v) => v > cur) ?? last;
  return [...list].reverse().find((v) => v < cur) ?? first;
}

export const ROUND_CHOICES = Array.from({ length: ROOM.maxRounds }, (_, i) => i + 1);

export const connectedCount = (players: readonly Seat[]): number => players.filter((p) => p.connected).length;

/** Why Start is disabled, or null when the host can start. */
export function startBlock(players: readonly Seat[], settings: Settings): string | null {
  const n = connectedCount(players);
  if (n < ROOM.minPlayers) return `Need at least ${ROOM.minPlayers} players (${n} here). Ask someone to join!`;
  if (settings.mode === "teams") {
    const teamIds = TEAMS.slice(0, settings.teamCount).map((t) => t.id);
    const empty = teamIds.filter((id) => !players.some((p) => p.connected && p.team === id)).length;
    if (empty > 0) return "Every team needs a player. Shuffle teams or pick fewer teams.";
  }
  return null;
}

/** Teams are offered from ROOM.teamMinPlayers players. */
export const teamsOffered = (players: readonly Seat[]): boolean => players.length >= ROOM.teamMinPlayers;

/** Most teams that still give everyone a teammate: 2..ROOM.maxTeams. */
export const maxTeamsFor = (players: number): number => Math.max(2, Math.min(ROOM.maxTeams, Math.floor(players / 2)));

/** The label OGS shows for this sitting. */
export function sittingLabel(v: { code: string; phase: Phase; round: number; settings: { rounds: number } }): {
  status: "lobby" | "active" | "completed";
  title: string;
} {
  if (v.phase === "lobby") return { status: "lobby", title: `Room ${v.code} · in the lobby` };
  if (v.phase === "podium") return { status: "completed", title: `Room ${v.code} · game over` };
  return { status: "active", title: `Room ${v.code} · round ${v.round} of ${v.settings.rounds}` };
}

/** A short line about the room's settings ("Classic · 2 rounds · 80 s"). */
export function settingsLine(s: Settings): string {
  const mode = s.mode === "teams" ? `${s.teamCount} teams` : "Classic";
  const rounds = `${s.rounds} round${s.rounds === 1 ? "" : "s"}`;
  return `${mode} · ${rounds} · ${s.drawSeconds} s · ${s.difficulty}${s.hints ? "" : " · no hints"}`;
}
