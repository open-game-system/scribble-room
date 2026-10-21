// Pure helpers that turn the room's TV view into what the TV shows. No DOM, no React: unit-tested.
import { TEAMS } from "../../config";
import type { Settings, Seat, Team, TurnResult, TvView } from "../../shared/protocol";

// ---------------------------------------------------------------- hint mask

export type MaskCell = { kind: "hidden" } | { kind: "letter"; ch: string } | { kind: "fixed"; ch: string };

/** The mask split into words (spaces separate words; a word never wraps inside). */
export function maskWords(mask: string): MaskCell[][] {
  if (!mask) return [];
  return mask
    .split(" ")
    .filter((w) => w.length > 0)
    .map((w) =>
      [...w].map((ch): MaskCell => {
        if (ch === "_") return { kind: "hidden" };
        if (ch === "-" || ch === "'") return { kind: "fixed", ch };
        return { kind: "letter", ch };
      }),
    );
}

/** Letters per word, the "(5, 4)" a guesser counts against. */
export function letterCounts(mask: string): number[] {
  return maskWords(mask).map((w) => w.filter((c) => c.kind !== "fixed").length);
}

/** How many hint letters show (revealed letters, not spaces or punctuation). */
export function revealedCount(mask: string): number {
  return maskWords(mask).reduce((n, w) => n + w.filter((c) => c.kind === "letter").length, 0);
}

/** A letter box plus its gap, and the gap between words, in box widths (matches tv.css). */
const BOX_UNIT = 1.14;
const WORD_GAP = 0.6;

/** Box scale (0..1) so the whole mask fits `maxBoxes` box widths on one line. */
export function maskScale(mask: string, maxBoxes = 13): number {
  const words = maskWords(mask);
  if (words.length === 0) return 1;
  const boxes = words.reduce((n, w) => n + w.length * BOX_UNIT, 0) + (words.length - 1) * WORD_GAP;
  return Math.min(1, maxBoxes / boxes);
}

// ---------------------------------------------------------------- standings

export type Standing = { seat: Seat; rank: number };

/** Sorted by score (high first); ties keep join order and share a rank (1, 2, 2, 4). */
export function standings(players: readonly Seat[], scoreOf: (s: Seat) => number = (s) => s.score): Standing[] {
  const sorted = players.map((seat, i) => ({ seat, i, score: scoreOf(seat) })).sort((a, b) => b.score - a.score || a.i - b.i);
  const out: Standing[] = [];
  sorted.forEach((row, idx) => {
    const prev = out[idx - 1];
    const prevScore = idx > 0 ? sorted[idx - 1]?.score : undefined;
    out.push({ seat: row.seat, rank: prev && prevScore === row.score ? prev.rank : idx + 1 });
  });
  return out;
}

export type BoardRow = { seat: Seat; rank: number; gain: number; /** Row index before this turn's gains. */ from: number; /** Row index now. */ to: number };

/** The scoreboard after a turn: each row's gain and where it sat before (for the rank-change slide). */
export function boardRows(players: readonly Seat[], gains: Readonly<Record<string, number>>): BoardRow[] {
  const gainOf = (s: Seat) => gains[s.id] ?? 0;
  const before = standings(players, (s) => Math.max(0, s.score - gainOf(s)));
  const fromIndex = new Map(before.map((r, i) => [r.seat.id, i]));
  return standings(players).map((r, to) => ({ seat: r.seat, rank: r.rank, gain: gainOf(r.seat), from: fromIndex.get(r.seat.id) ?? to, to }));
}

export type TeamRow = { team: Team; color: number; members: Seat[]; gain: number; rank: number; drawing: boolean };

/** Team colour index (TEAMS order) for a team id; 0 when unknown. */
export function teamIndex(id: string): number {
  const i = TEAMS.findIndex((t) => t.id === id);
  return i < 0 ? 0 : i;
}

export function teamRows(view: Pick<TvView, "teams" | "players" | "drawingTeam">, teamGains: Readonly<Record<string, number>> = {}): TeamRow[] {
  const ranked = [...view.teams].map((team, i) => ({ team, i })).sort((a, b) => b.team.score - a.team.score || a.i - b.i);
  const rows: TeamRow[] = [];
  ranked.forEach(({ team }, idx) => {
    const prev = rows[idx - 1];
    rows.push({
      team,
      color: teamIndex(team.id),
      members: view.players.filter((p) => p.team === team.id),
      gain: teamGains[team.id] ?? 0,
      rank: prev && prev.team.score === team.score ? prev.rank : idx + 1,
      drawing: view.drawingTeam === team.id,
    });
  });
  return rows;
}

// ---------------------------------------------------------------- captions

export function nameOf(players: readonly Seat[], id: string): string {
  return players.find((p) => p.id === id)?.name ?? "Someone";
}

export function roundLabel(view: Pick<TvView, "round" | "settings">): string {
  return `Round ${Math.max(1, view.round)} of ${view.settings.rounds}`;
}

const DIFFICULTY_LABEL: Record<Settings["difficulty"], string> = {
  mixed: "Mixed words",
  easy: "Easy words",
  medium: "Medium words",
  hard: "Hard words",
};

export function settingsSummary(s: Settings): string[] {
  return [
    s.mode === "teams" ? `Teams (${s.teamCount})` : "Classic",
    `${s.rounds} ${s.rounds === 1 ? "round" : "rounds"}`,
    `${s.drawSeconds} s to draw`,
    DIFFICULTY_LABEL[s.difficulty],
    s.hints ? "Hints on" : "No hints",
  ];
}

/** The lobby's bottom line: what the room is waiting for. */
export function lobbyCaption(view: Pick<TvView, "players" | "hostId">, minPlayers: number): string {
  const here = view.players.filter((p) => p.connected).length;
  if (here === 0) return "Grab your phone and join";
  if (here < minPlayers) return `Waiting for ${minPlayers - here} more ${minPlayers - here === 1 ? "player" : "players"}`;
  const host = view.players.find((p) => p.id === view.hostId);
  return host ? `Host: ${host.name} starts the game` : "The host starts the game";
}

/** Guessers this turn (everyone connected but the drawer) and how many got it. */
export function guessProgress(view: Pick<TvView, "players" | "drawerId">): { got: number; of: number } {
  const guessers = view.players.filter((p) => p.id !== view.drawerId && (p.connected || p.guessed));
  return { got: guessers.filter((p) => p.guessed).length, of: guessers.length };
}

export function revealCaption(turn: TurnResult, got: number, of: number): string {
  switch (turn.reason) {
    case "all-guessed":
      return "Everybody got it!";
    case "skipped":
      return "Skipped by the host";
    case "drawer-left":
      return "The drawer left";
    default:
      return got === 0 ? "Time's up! Nobody got it" : `Time's up! ${got} of ${of} got it`;
  }
}

/** Gains this turn as rows (biggest first), drawer marked. */
export function gainRows(turn: TurnResult, players: readonly Seat[]): { id: string; name: string; gain: number; drawer: boolean }[] {
  return Object.entries(turn.gains)
    .filter(([, g]) => g > 0)
    .map(([id, gain]) => ({ id, name: nameOf(players, id), gain, drawer: id === turn.drawerId }))
    .sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- timer

/** Fraction of the phase clock left (1 = full), from server epoch ms. */
export function timerFraction(endsAt: number, startedAt: number, now: number): number {
  if (!endsAt || endsAt <= startedAt) return 0;
  return Math.min(1, Math.max(0, (endsAt - now) / (endsAt - startedAt)));
}

export const URGENT_SECONDS = 10;
export const isUrgent = (phase: TvView["phase"], secondsLeft: number): boolean => phase === "drawing" && secondsLeft > 0 && secondsLeft <= URGENT_SECONDS;

// ---------------------------------------------------------------- podium

export type PodiumSpot = { place: 1 | 2 | 3; id: string; name: string; avatar: string; score: number; team: string };

export function podiumPlayers(players: readonly Seat[]): PodiumSpot[] {
  const places = [1, 2, 3] as const;
  return standings(players)
    .slice(0, 3)
    .map((r, i) => ({ place: places[i] ?? 3, id: r.seat.id, name: r.seat.name, avatar: r.seat.avatar, score: r.seat.score, team: r.seat.team }));
}

/** The winning team's best scorer (its MVP), or null when the team has nobody. */
export function teamMvp(players: readonly Seat[], teamId: string): Seat | null {
  return standings(players.filter((p) => p.team === teamId))[0]?.seat ?? null;
}

// ---------------------------------------------------------------- OGS sitting label

export function sittingLabel(view: Pick<TvView, "phase" | "players" | "round" | "settings" | "teams">): { status: "lobby" | "active" | "completed"; title: string } {
  const n = view.players.length;
  if (view.phase === "lobby") return { status: "lobby", title: n === 0 ? "Waiting for players" : `Lobby · ${n} ${n === 1 ? "player" : "players"}` };
  if (view.phase === "podium") {
    if (view.settings.mode === "teams") {
      const top = [...view.teams].sort((a, b) => b.score - a.score)[0];
      return { status: "completed", title: top ? `${top.name} won` : "Game over" };
    }
    const top = standings(view.players)[0];
    return { status: "completed", title: top ? `${top.seat.name} won` : "Game over" };
  }
  return { status: "active", title: `${roundLabel(view)} · ${n} ${n === 1 ? "player" : "players"}` };
}
