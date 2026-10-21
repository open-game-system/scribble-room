// Ranks, places and the lines the reveal and podium screens say. Pure.
import type { Seat, Team, TurnResult } from "../../shared/protocol";

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

export type Ranked<T> = { item: T; place: number };

/** Sorted by score (desc, then name), ties share a place (1, 2, 2, 4). */
export function rank<T extends { score: number; name: string }>(items: readonly T[]): Ranked<T>[] {
  const sorted = [...items].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const out: Ranked<T>[] = [];
  sorted.forEach((item, i) => {
    const prev = out[i - 1];
    const place = prev && prev.item.score === item.score ? prev.place : i + 1;
    out.push({ item, place });
  });
  return out;
}

export function placeOf(players: readonly Seat[], id: string): number | null {
  return rank(players).find((r) => r.item.id === id)?.place ?? null;
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
  const top = rank(teams)[0];
  if (!top) return null;
  const mvp = rank(players.filter((p) => p.team === top.item.id))[0]?.item ?? null;
  return { team: top.item, mvp };
}
