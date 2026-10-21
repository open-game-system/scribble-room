// Who is ahead: the one ranking rule for players and teams, on the TV, the phones and the OGS label.
// Sorted by score (high first); ties share a place (1, 2, 2, 4). Pure.

/**
 * How ties are ordered: "list" keeps the given order (join order for players, TEAMS order for teams),
 * "name" goes alphabetically. The TV ranks by "list" and the phones by "name" today, so on a tie the
 * two screens can name a different leader.
 */
export type TieBreak = "list" | "name";

export type Ranked<T> = { item: T; place: number };

type Scored = { score: number; name: string };

export function rank<T extends Scored>(items: readonly T[], tie: TieBreak, scoreOf: (t: T) => number = (t) => t.score): Ranked<T>[] {
  const rows = items.map((item, i) => ({ item, i, score: scoreOf(item) }));
  rows.sort((a, b) => b.score - a.score || (tie === "name" ? a.item.name.localeCompare(b.item.name) : a.i - b.i));
  const out: Ranked<T>[] = [];
  rows.forEach((row, idx) => {
    const prev = out[idx - 1];
    out.push({ item: row.item, place: prev && rows[idx - 1]?.score === row.score ? prev.place : idx + 1 });
  });
  return out;
}

export function placeOf<T extends Scored & { id: string }>(items: readonly T[], id: string, tie: TieBreak): number | null {
  return rank(items, tie).find((r) => r.item.id === id)?.place ?? null;
}

/** The top item (a winner, a team's MVP), or null when there is none. */
export function leader<T extends Scored>(items: readonly T[], tie: TieBreak): T | null {
  return rank(items, tie)[0]?.item ?? null;
}
