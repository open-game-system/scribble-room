// Private notices from the room (me.notice): which ones are new, and how they read. Pure.

export type Notice = { kind: string; text: string; seq: number };
export type Tone = "close" | "correct" | "info";

/** A notice is new when its seq differs from the last one this phone has shown (seq replays). */
export const isFresh = (seen: number, n: Notice | null): n is Notice => n !== null && n.seq !== seen;

export function toneOf(kind: string): Tone {
  if (kind === "close") return "close";
  if (kind === "correct") return "correct";
  return "info";
}

const FRIENDLY: Readonly<Record<string, string>> = {
  close: "So close!",
  "not-enough-players": "You need at least 2 players to start.",
  "not-host": "Only the host can do that.",
  "not-drawer": "It's not your turn to draw.",
  "not-your-turn": "It's not your turn.",
  "too-fast": "Slow down a little.",
  "already-guessed": "You already got it!",
  "canvas-full": "The page is full. Undo or clear to keep drawing.",
};

/** What the phone shows for a notice: the room's text when it reads as a sentence, else a friendly line. */
export function noticeText(n: Notice): string {
  const known = FRIENDLY[n.kind];
  if (n.kind === "correct") return n.text || "You got it!";
  if (known) return known;
  if (/\s/.test(n.text)) return n.text;
  return "That didn't work. Try again.";
}

/** Points in a "correct" notice ("You got it! +240" → 240), or null. */
export function pointsIn(text: string): number | null {
  const m = /\+(\d+)/.exec(text);
  return m?.[1] ? Number(m[1]) : null;
}
