// Seats: admitting phones, presence, and who hosts. Pure.
import { PALETTE_SIZE, ROOM, TIMING } from "../config";
import { bump, isPlayer, playerOf, pushFeed, updatePlayer } from "./state";
import { activeTeams, dealTeams, smallestTeam } from "./teams";
import { type GameState, type Player, type RuleResult, ok, refuse } from "./types";

export type Admission = { id: string; name: string; avatar: string };

/** The host is the first player while connected; otherwise the first connected player (join order). */
export function effectiveHost(s: GameState): string {
  const host = playerOf(s, s.hostId);
  if (host?.connected) return s.hostId;
  return s.players.find((p) => p.connected)?.id ?? s.hostId;
}

export const isHost = (s: GameState, id: string): boolean => id !== "" && effectiveHost(s) === id;

const inGame = (s: GameState): boolean => s.phase === "picking" || s.phase === "drawing" || s.phase === "reveal";

function freeHue(players: readonly Player[]): number {
  const taken = new Set(players.map((p) => p.hue));
  for (let h = 0; h < PALETTE_SIZE; h++) if (!taken.has(h)) return h;
  return players.length % PALETTE_SIZE;
}

/** Ten or more in the lobby and the host hasn't chosen: teams become the default. */
function autoTeams(s: GameState): GameState {
  if (s.phase !== "lobby" || s.modeTouched || s.settings.mode === "teams" || s.players.length < ROOM.teamDefaultFrom) return s;
  return {
    ...s,
    settings: { ...s.settings, mode: "teams", drawSeconds: TIMING.teamDrawSeconds },
    players: dealTeams(s.players, s.players.map((p) => p.id), s.settings.teamCount),
  };
}

function seatNew(s: GameState, a: Admission): GameState {
  const team = s.settings.mode === "teams" ? smallestTeam(s.players, s.settings.teamCount) : "";
  const player: Player = { id: a.id, name: a.name, avatar: a.avatar, hue: freeHue(s.players), score: 0, team, connected: false };
  const seated: GameState = {
    ...s,
    hostId: s.hostId === "" ? a.id : s.hostId,
    players: [...s.players, player],
    // A late joiner in classic draws later this round.
    queue: inGame(s) && s.settings.mode === "classic" ? [...s.queue, a.id] : s.queue,
  };
  return autoTeams(pushFeed(seated, { kind: "join", playerId: a.id, name: a.name, text: "" }));
}

/** The Worker seats a phone. A known id keeps its seat and score (a refresh); the name/avatar update. */
export function admit(s: GameState, a: Admission): RuleResult {
  if (isPlayer(s, a.id)) return ok(bump(updatePlayer(s, a.id, (p) => ({ ...p, name: a.name, avatar: a.avatar }))));
  if (s.players.length >= ROOM.maxPlayers) return refuse("room-full");
  return ok(bump(seatNew(s, a)));
}

export function setConnected(s: GameState, id: string, connected: boolean): GameState {
  const p = playerOf(s, id);
  if (!p || p.connected === connected) return s;
  return bump(updatePlayer(s, id, (q) => ({ ...q, connected })));
}

export const connectedPlayers = (s: GameState): Player[] => s.players.filter((p) => p.connected);

/** Start needs two connected players; teams need ROOM.teamMinPlayers and two teams with someone on them. */
export function canStart(s: GameState): boolean {
  const here = connectedPlayers(s);
  if (here.length < ROOM.minPlayers) return false;
  if (s.settings.mode === "classic") return true;
  const teamsHere = new Set(here.map((p) => p.team));
  return here.length >= ROOM.teamMinPlayers && activeTeams(s).filter((t) => teamsHere.has(t)).length >= 2;
}
