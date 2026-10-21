// Who draws next (spec "Turn order"). Pure.
//  Classic: each round, every player once in join order; late joiners are appended to the round.
//  Teams: each round, every team once (t0, t1, …); the drawer rotates through the team's members.
// A drawer who isn't connected when their turn comes is skipped.
import { activeTeams, membersOf } from "./teams";
import type { GameState } from "./types";

export function roundQueue(s: GameState): string[] {
  return s.settings.mode === "teams" ? activeTeams(s) : s.players.map((p) => p.id);
}

export type Taken = { state: GameState; drawerId: string };

function takeClassic(s: GameState): Taken | null {
  const queue = [...s.queue];
  while (queue.length > 0) {
    const id = queue.shift() ?? "";
    if (s.players.some((p) => p.id === id && p.connected)) return { state: { ...s, queue }, drawerId: id };
  }
  return null;
}

/** The team's next connected member from its rotation pointer; the pointer moves past them. */
function teamDrawer(s: GameState, team: string): Taken | null {
  const members = membersOf(s.players, team);
  const start = s.rotation[team] ?? 0;
  for (let k = 0; k < members.length; k++) {
    const idx = (start + k) % members.length;
    const m = members[idx];
    if (m?.connected) return { state: { ...s, rotation: { ...s.rotation, [team]: (idx + 1) % members.length } }, drawerId: m.id };
  }
  return null;
}

function takeTeams(s: GameState): Taken | null {
  const queue = [...s.queue];
  while (queue.length > 0) {
    const team = queue.shift() ?? "";
    const taken = teamDrawer({ ...s, queue }, team);
    if (taken) return taken;
  }
  return null;
}

/** Takes the next drawer from this round's queue, or null when the round is over. */
export function takeDrawer(s: GameState): Taken | null {
  return s.settings.mode === "teams" ? takeTeams(s) : takeClassic(s);
}
