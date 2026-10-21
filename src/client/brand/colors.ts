// Brand colours for code (docs/art-style.md, "Marker & Tape"). CSS uses the same values from
// public/css/tokens.css; this file is for SVG, canvas and inline styles.

export const INK = "#1b1a1f";
export const WHITE = "#ffffff";

export const BRAND = {
  paper: "#fff3dc",
  paperDeep: "#f6e2bc",
  sheet: "#ffffff",
  ink: INK,
  inkSoft: "#4d4855",
  rule: "#b9cceb",
  tape: "#f1dfa6",
  hiYellow: "#ffd400",
  hiGreen: "#3ddc84",
  markerGreen: "#12a150",
  markerRed: "#e8262f",
  markerBlue: "#1e6fe8",
  markerPink: "#ff4fa3",
  markerOrange: "#ff7a00",
  markerPurple: "#8a3ffc",
} as const;

export type TeamColor = { bg: string; text: string };

/** One hue per team, in TEAMS order (t0..t7): Tangerine, Teal, Plum, Lime, Coral, Indigo, Gold, Rose. */
export const TEAM_COLORS: readonly TeamColor[] = [
  { bg: "#ff7a00", text: INK }, // Tangerine
  { bg: "#00a99d", text: INK }, // Teal
  { bg: "#8e3b8f", text: WHITE }, // Plum
  { bg: "#8cd23c", text: INK }, // Lime
  { bg: "#ff6b5e", text: INK }, // Coral
  { bg: "#4b4fd6", text: WHITE }, // Indigo
  { bg: "#f5b800", text: INK }, // Gold
  { bg: "#e6457a", text: INK }, // Rose
];

/** Light marker tints for player chips; ink initials read on every one. */
export const CHIP_HUES: readonly string[] = [
  "#ffb3c7",
  "#ffd27a",
  "#fff07a",
  "#b8f28c",
  "#8ce8c8",
  "#8fd8ff",
  "#a9b8ff",
  "#d2a9ff",
  "#ffa98f",
  "#e9c79b",
  "#c9f0ff",
  "#ffc2f0",
];

/** Deterministic chip hue for a player id (FNV-1a over UTF-16 code units). */
export function playerHue(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return CHIP_HUES[h % CHIP_HUES.length] ?? CHIP_HUES[0] ?? BRAND.hiYellow;
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m || m[1] === undefined) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = ch;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** Ink or white, whichever reads better on `bg`. */
export function readableOn(bg: string): string {
  return contrast(bg, INK) >= contrast(bg, WHITE) ? INK : WHITE;
}

/** Up to two initials from a display name ("Ana Ruiz" -> "AR", "ben" -> "BE"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1] ?? "") : "";
  const pick = last ? [...first].slice(0, 1).concat([...last].slice(0, 1)) : [...first].slice(0, 2);
  return pick.join("").toUpperCase();
}
