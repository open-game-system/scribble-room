// Decorative marker doodles for margins (docs/art-style.md). Never faces, never creatures, never over the canvas.
import type { CSSProperties, ReactNode } from "react";
import { BRAND } from "./colors";

export const DOODLE_KINDS = [
  "star",
  "squiggle",
  "arrow",
  "paperclip",
  "pencil",
  "spiral",
  "burst",
  "swirl",
  "heart",
  "scribble",
] as const;
export type DoodleKind = (typeof DOODLE_KINDS)[number];

export type DoodleProps = {
  kind: DoodleKind;
  /** Rendered size in px (square). */
  size?: number;
  /** Stroke colour (default ink). */
  color?: string;
  /** Fill for closed shapes (star, burst, heart, pencil body). */
  fill?: string;
  strokeWidth?: number;
  rotate?: number;
  className?: string;
  style?: CSSProperties;
};

function polar(cx: number, cy: number, r: number, a: number): string {
  return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
}

function starD(points: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 44 : 44 * inner;
    // A slight hand wobble on the outer points.
    const wob = i % 2 === 0 ? ((i * 7) % 5) - 2 : 0;
    pts.push(polar(50, 52, r + wob, -Math.PI / 2 + (i * Math.PI) / points));
  }
  return `M${pts.join(" L")} Z`;
}

function spiralD(): string {
  const pts: string[] = [];
  for (let t = 0; t <= Math.PI * 6; t += 0.2) pts.push(polar(50, 50, 2 + t * 2.3, t));
  return `M${pts.join(" L")}`;
}

const STAR = starD(5, 0.46);
const BURST = starD(12, 0.7);
const SPIRAL = spiralD();

function shapes(kind: DoodleKind, color: string, fill: string): ReactNode {
  switch (kind) {
    case "star":
      return <path d={STAR} fill={fill} />;
    case "burst":
      return <path d={BURST} fill={fill} />;
    case "heart":
      return <path d="M50 86 C 16 62, 8 38, 26 26 C 38 18, 49 28, 50 38 C 52 28, 62 18, 74 26 C 92 38, 84 62, 50 86 Z" fill={fill} />;
    case "squiggle":
      return <path d="M6 58 C 14 28, 26 28, 34 52 S 52 80, 62 52 S 82 22, 94 44" fill="none" />;
    case "arrow":
      return (
        <>
          <path d="M10 84 C 26 46, 52 28, 86 22" fill="none" />
          <path d="M66 12 L 88 21 L 74 40" fill="none" />
        </>
      );
    case "paperclip":
      return <path d="M44 34 V 70 A 6 6 0 0 0 56 70 V 24 A 12 12 0 0 0 32 24 V 74 A 18 18 0 0 0 68 74 V 34" fill="none" />;
    case "spiral":
      return <path d={SPIRAL} fill="none" />;
    case "swirl":
      return <path d="M6 64 C 18 60, 28 42, 22 34 S 6 44, 18 54 S 46 50, 50 36 S 40 22, 38 36 S 56 66, 74 58 S 94 38, 86 30" fill="none" />;
    case "scribble":
      return <path d="M12 72 L 30 24 L 30 76 L 52 22 L 50 78 L 72 24 L 70 76 L 90 30" fill="none" />;
    case "pencil":
      return (
        <g transform="rotate(-35 50 50)">
          <rect x="22" y="40" width="50" height="20" fill={fill} />
          <rect x="12" y="40" width="10" height="20" fill={BRAND.markerPink} />
          <rect x="22" y="40" width="7" height="20" fill={BRAND.rule} />
          <path d="M72 40 L 92 50 L 72 60 Z" fill="#f2c89a" />
          <path d="M85 46.5 L 92 50 L 85 53.5 Z" fill={color} />
        </g>
      );
  }
}

export function Doodle({
  kind,
  size = 64,
  color = BRAND.ink,
  fill = BRAND.hiYellow,
  strokeWidth = 6,
  rotate = 0,
  className,
  style,
}: DoodleProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g transform={rotate ? `rotate(${rotate} 50 50)` : undefined}>{shapes(kind, color, fill)}</g>
    </svg>
  );
}
