// Ranks, places and the lines the reveal and podium screens say. Pure.
import type { Seat, Team, TurnResult } from "../../shared/protocol";
import { type Ranked, leader, placeOf as placeIn, rank as rankBy } from "../../shared/standings";

export type { Ranked } from "../../shared/standings";

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Sorted by score (desc, then name), ties share a place (1, 2, 2, 4). */
export function rank<T extends { score: number; name: string }>(items: readonly T[]): Ranked<T>[] {
  return rankBy(items, "name");
}

export function placeOf(players: readonly Seat[], id: string): number | null {
  return placeIn(players, id, "name");
}

/** "Everyone got it!" etc. for a finished turn. */
export function reasonLine(reason: string): string {
  switch (reason) {
    case "all-guessed":
      return "Everyone got it!";
    case "time":
      return "Time's up!";
    case "skipped":
      return "The host skipped this one.";
    case "drawer-left":
      return "The drawer left.";
    default:
      return "";
  }
}

/** What I gained this turn (0 when nothing). */
export const gainOf = (t: TurnResult | null, id: string): number => t?.gains[id] ?? 0;

/** Who guessed it (drawer excluded), by name, in the order of the players list. */
export function guessersOf(t: TurnResult | null, players: readonly Seat[]): Seat[] {
  if (!t) return [];
  return players.filter((p) => p.id !== t.drawerId && (t.gains[p.id] ?? 0) > 0);
}

/** Teams mode podium: the winning team(s) and its best scorer. */
export function teamWinner(teams: readonly Team[], players: readonly Seat[]): { team: Team; mvp: Seat | null } | null {
  const team = leader(teams, "name");
  if (!team) return null;
  return { team, mvp: leader(players.filter((p) => p.team === team.id), "name") };
}
