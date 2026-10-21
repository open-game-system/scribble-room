// The "Scribble Room" wordmark (docs/art-style.md): marker letters in Gluten 900 with a fat ink outline,
// a hard offset ink shadow and a hand wobble per letter, "Room" on a highlighter swipe.
// Needs the Gluten web font (public/css/tokens.css). Inline SVG, no deps.
import type { CSSProperties } from "react";
import { BRAND } from "./colors";

export type LogoProps = {
  /** Rendered width in px (height follows the aspect ratio). */
  width?: number;
  /** "stacked" (Scribble over Room) or "line" (one row, for headers). */
  variant?: "stacked" | "line";
  className?: string;
  style?: CSSProperties;
};

const FONT = "Gluten, 'Comic Sans MS', 'Chalkboard SE', sans-serif";
const SCRIBBLE = [..."Scribble"];
const LETTER_FILLS = [
  BRAND.markerRed,
  BRAND.markerOrange,
  BRAND.hiYellow,
  BRAND.markerGreen,
  BRAND.markerBlue,
  BRAND.markerPurple,
  BRAND.markerPink,
  BRAND.markerOrange,
];
const WOBBLE = "-5 3 -3 4 -2 5 -4 3";

type Layout = {
  w: number;
  h: number;
  scribble: { x: number; y: number; size: number; len: number };
  room: { x: number; y: number; size: number; len: number };
  swipe: string;
  star: { x: number; y: number; s: number };
};

const LAYOUTS: Record<"stacked" | "line", Layout> = {
  stacked: {
    w: 1000,
    h: 560,
    scribble: { x: 500, y: 250, size: 250, len: 900 },
    room: { x: 520, y: 500, size: 230, len: 560 },
    swipe: "M215 330 C 380 316, 640 312, 840 322 L 832 470 C 640 478, 400 482, 205 470 Z",
    star: { x: 900, y: 360, s: 80 },
  },
  line: {
    w: 1800,
    h: 330,
    scribble: { x: 560, y: 240, size: 250, len: 1020 },
    room: { x: 1440, y: 240, size: 230, len: 600 },
    swipe: "M1120 74 C 1300 64, 1580 62, 1770 72 L 1762 236 C 1560 244, 1320 246, 1112 238 Z",
    star: { x: 1750, y: 50, s: 60 },
  },
};

function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

export function Logo({ width = 480, variant = "stacked", className, style }: LogoProps) {
  const L = LAYOUTS[variant];
  const shadow = 12;
  const scribble = (dx: number, dy: number, shadowLayer: boolean) => (
    <text
      x={L.scribble.x + dx}
      y={L.scribble.y + dy}
      textAnchor="middle"
      fontFamily={FONT}
      fontWeight={900}
      fontSize={L.scribble.size}
      textLength={L.scribble.len}
      lengthAdjust="spacingAndGlyphs"
      rotate={WOBBLE}
      stroke={BRAND.ink}
      strokeWidth={22}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {SCRIBBLE.map((ch, i) => (
        <tspan key={i} fill={shadowLayer ? BRAND.ink : (LETTER_FILLS[i] ?? BRAND.markerRed)}>
          {ch}
        </tspan>
      ))}
    </text>
  );
  const room = (dx: number, dy: number, fill: string, stroke: string) => (
    <text
      x={L.room.x + dx}
      y={L.room.y + dy}
      textAnchor="middle"
      fontFamily={FONT}
      fontWeight={900}
      fontSize={L.room.size}
      textLength={L.room.len}
      lengthAdjust="spacingAndGlyphs"
      rotate="3 -2 2 -3"
      fill={fill}
      stroke={stroke}
      strokeWidth={stroke === "none" ? 0 : 18}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      Room
    </text>
  );
  return (
    <svg
      role="img"
      aria-label="Scribble Room"
      className={className}
      style={style}
      width={width}
      height={Math.round((width * L.h) / L.w)}
      viewBox={`0 0 ${L.w} ${L.h}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={L.swipe} fill={BRAND.hiYellow} transform="rotate(-2 520 400)" />
      {scribble(shadow, shadow, true)}
      {scribble(0, 0, false)}
      {room(shadow * 0.7, shadow * 0.7, BRAND.ink, "none")}
      {room(0, 0, BRAND.sheet, BRAND.ink)}
      <path
        d={starPath(L.star.x, L.star.y, L.star.s / 2)}
        fill={BRAND.markerPink}
        stroke={BRAND.ink}
        strokeWidth={8}
        strokeLinejoin="round"
        transform={`rotate(12 ${L.star.x} ${L.star.y})`}
      />
    </svg>
  );
}
