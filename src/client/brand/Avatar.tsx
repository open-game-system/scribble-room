// Player avatar: the OGS avatar image clipped in a hand-drawn blob, or initials on a hue blob.
import { useId, type CSSProperties } from "react";
import { BRAND, initials, playerHue, readableOn } from "./colors";

export type AvatarProps = {
  name: string;
  /** Player id: picks a stable chip hue when `hue` isn't given. */
  id?: string;
  /** #rrggbb background (e.g. a TEAM_COLORS bg). */
  hue?: string;
  /** OGS avatar URL; falls back to initials when absent. */
  src?: string | null;
  /** Rendered size in px. */
  size?: number;
  className?: string;
  style?: CSSProperties;
};

const BLOB = "M50 5 C 77 3 96 22 95 50 C 94 77 76 96 50 95 C 22 96 5 78 6 50 C 6 23 23 6 50 5 Z";

export function Avatar({ name, id, hue, src, size = 48, className, style }: AvatarProps) {
  const clip = `sr-av-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const bg = hue ?? playerHue(id ?? name);
  return (
    <svg
      role="img"
      aria-label={name}
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id={clip}>
          <path d={BLOB} />
        </clipPath>
      </defs>
      <path d={BLOB} fill={bg} />
      {src ? (
        <image href={src} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
      ) : (
        <text
          x="50"
          y="52"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Gluten, 'Comic Sans MS', sans-serif"
          fontWeight={900}
          fontSize={42}
          fill={readableOn(bg)}
        >
          {initials(name)}
        </text>
      )}
      <path d={BLOB} fill="none" stroke={BRAND.ink} strokeWidth={6} strokeLinejoin="round" />
    </svg>
  );
}
