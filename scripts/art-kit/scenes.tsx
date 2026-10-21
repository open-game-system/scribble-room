// The OGS art kit scenes for Scribble Room, drawn in SVG/CSS with the brand components
// (docs/art-style.md, "Marker & Tape"). render.ts turns each into an image with Playwright.
import type { CSSProperties, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PALETTE } from "../../src/config";
import { Avatar, BRAND, Doodle, Logo, type DoodleKind } from "../../src/client/brand";

const [INK, , RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE, PINK, BROWN, , SKY] = PALETTE;

/** A player's in-progress drawing, in CANVAS units (1200x900), as marker strokes and bucket fills. */
export function BalloonDrawing({ partial = false }: { partial?: boolean }) {
  const stroke = { stroke: INK, strokeWidth: 16, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 1200 900" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="900" fill="#ffffff" />
      {/* sun */}
      <circle cx="1030" cy="160" r="70" fill={YELLOW} {...stroke} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={1030 + Math.cos(a) * 100}
            y1={160 + Math.sin(a) * 100}
            x2={1030 + Math.cos(a) * 140}
            y2={160 + Math.sin(a) * 140}
            stroke={ORANGE}
            strokeWidth={16}
            strokeLinecap="round"
          />
        );
      })}
      {/* clouds */}
      <path d="M120 230 q 0 -60 60 -60 q 20 -50 80 -40 q 50 -20 80 30 q 60 0 55 60 z" fill="#ffffff" stroke={SKY} strokeWidth={16} strokeLinejoin="round" />
      <path d="M760 420 q 0 -45 45 -45 q 18 -40 62 -30 q 40 -15 62 25 q 46 0 42 50 z" fill="#ffffff" stroke={SKY} strokeWidth={14} strokeLinejoin="round" />
      {/* balloon envelope with fill-bucket stripes */}
      <path d="M600 90 C 790 90 860 260 790 400 C 740 500 660 560 640 600 L 560 600 C 540 560 460 500 410 400 C 340 260 410 90 600 90 Z" fill={RED} />
      <path d="M600 90 C 660 140 680 300 640 600 L 560 600 C 520 300 540 140 600 90 Z" fill={YELLOW} />
      <path d="M600 90 C 500 110 450 250 470 380 C 480 450 520 520 560 600 L 530 600 C 470 520 420 460 410 400 C 360 280 410 120 600 90 Z" fill={BLUE} />
      {!partial && (
        <path d="M600 90 C 700 110 750 250 730 380 C 720 450 680 520 640 600 L 670 600 C 730 520 780 460 790 400 C 840 280 790 120 600 90 Z" fill={BLUE} />
      )}
      <path d="M600 90 C 790 90 860 260 790 400 C 740 500 660 560 640 600 L 560 600 C 540 560 460 500 410 400 C 340 260 410 90 600 90 Z" fill="none" {...stroke} />
      <path d="M600 90 C 660 140 680 300 640 600 M600 90 C 540 140 520 300 560 600" fill="none" {...stroke} strokeWidth={10} />
      {/* ropes and basket */}
      <path d="M565 605 L 560 690 M635 605 L 640 690" stroke={INK} strokeWidth={8} strokeLinecap="round" />
      <path d="M545 690 L 655 690 L 645 780 L 555 780 Z" fill={BROWN} {...stroke} />
      <path d="M560 735 L 640 735" stroke={INK} strokeWidth={8} strokeLinecap="round" />
      {/* birds (simple marker v's) */}
      <path d="M250 420 q 25 -30 50 0 q 25 -30 50 0" fill="none" stroke={INK} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M320 520 q 18 -22 36 0 q 18 -22 36 0" fill="none" stroke={INK} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      {/* hills */}
      {partial ? (
        <path d="M0 830 C 180 760 330 770 480 820" fill="none" stroke={GREEN} strokeWidth={36} strokeLinecap="round" />
      ) : (
        <>
          <path d="M0 830 C 180 760 330 770 480 820 C 640 870 820 760 1000 790 C 1080 800 1150 820 1200 830 L 1200 900 L 0 900 Z" fill={GREEN} />
          <path d="M0 830 C 180 760 330 770 480 820 C 640 870 820 760 1000 790 C 1080 800 1150 820 1200 830" fill="none" stroke={INK} strokeWidth={16} strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** CSS custom properties for a style prop. */
function cssVars(vars: Record<`--${string}`, string>): CSSProperties {
  return vars;
}

/** A felt-tip marker lying on the table, cap off. */
function Marker({ color, x, y, rot, scale = 1 }: { color: string; x: number; y: number; rot: number; scale?: number }) {
  return (
    <svg
      style={{ position: "absolute", left: x, top: y, transform: `rotate(${rot}deg) scale(${scale})`, transformOrigin: "center", overflow: "visible" }}
      width="360"
      height="70"
      viewBox="0 0 360 70"
    >
      <g stroke={INK} strokeWidth={5} strokeLinejoin="round">
        <rect x="8" y="12" width="250" height="46" rx="16" fill={color} />
        <rect x="160" y="12" width="26" height="46" fill="#ffffff" />
        <path d="M258 18 L 300 24 L 300 46 L 258 52 Z" fill="#e9e3d6" />
        <path d="M300 26 L 340 32 Q 348 35 340 38 L 300 44 Z" fill={color} />
      </g>
      <rect x="14" y="58" width="246" height="9" rx="4" fill={INK} opacity="0.85" />
    </svg>
  );
}

function Pos({ x, y, children, rot = 0, style }: { x: number; y: number; children: ReactNode; rot?: number; style?: CSSProperties }) {
  return <div style={{ position: "absolute", left: x, top: y, transform: `rotate(${rot}deg)`, ...style }}>{children}</div>;
}

function D({ kind, x, y, size, rot = 0, fill, color }: { kind: DoodleKind; x: number; y: number; size: number; rot?: number; fill?: string; color?: string }) {
  return (
    <Pos x={x} y={y} rot={rot}>
      <Doodle kind={kind} size={size} strokeWidth={size > 120 ? 5 : 6} {...(fill ? { fill } : {})} {...(color ? { color } : {})} />
    </Pos>
  );
}

/** The taped drawing sheet, absolutely placed. */
function Sheet({ x, y, w, rot = 0, partial = false, line = 8 }: { x: number; y: number; w: number; rot?: number; partial?: boolean; line?: number }) {
  const h = (w * 3) / 4;
  return (
    <div
      className="sheet taped"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        transform: `rotate(${rot}deg)`,
        borderWidth: line,
        boxShadow: `${line + 6}px ${line + 6}px 0 ${INK}`,
        ...cssVars({ "--gap": `${Math.round(w / 40)}px` }),
      }}
    >
      <BalloonDrawing partial={partial} />
    </div>
  );
}

function Sticky({ x, y, rot, color, size = 220 }: { x: number; y: number; rot: number; color: string; size?: number }) {
  return (
    <Pos x={x} y={y} rot={rot}>
      <div style={{ width: size, height: size, background: color, border: `5px solid ${INK}`, boxShadow: `8px 8px 0 ${INK}`, position: "relative" }}>
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <path d="M18 34 Q 34 26 50 34 T 82 32 M18 52 Q 40 46 70 52 M18 70 Q 30 64 46 70" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
        </svg>
      </div>
    </Pos>
  );
}

function Stage({ w, h, children, paper = true }: { w: number; h: number; children: ReactNode; paper?: boolean }) {
  return (
    <div className={paper ? "paper" : undefined} style={{ position: "relative", width: w, height: h, overflow: "hidden" }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- scenes

function HeroClean() {
  return (
    <Stage w={1920} h={1080}>
      <Sticky x={60} y={90} rot={-8} color="#fff07a" />
      <Sticky x={1640} y={720} rot={7} color="#ffb3c7" size={200} />
      <Sheet x={430} y={110} w={1060} rot={-1.5} />
      <Marker color={RED} x={70} y={520} rot={-28} />
      <Marker color={BLUE} x={40} y={760} rot={12} />
      <Marker color={GREEN} x={1560} y={230} rot={-62} />
      <Marker color={PURPLE} x={1530} y={470} rot={-18} />
      <Marker color={YELLOW} x={1120} y={940} rot={-4} scale={0.9} />
      <D kind="star" x={300} y={360} size={110} rot={-12} fill={PINK} />
      <D kind="spiral" x={1600} y={70} size={130} />
      <D kind="squiggle" x={240} y={930} size={160} color={ORANGE} />
      <D kind="paperclip" x={1440} y={60} size={120} rot={20} />
      <D kind="burst" x={1730} y={440} size={120} fill={SKY} />
      <D kind="swirl" x={600} y={965} size={140} color={PURPLE} />
      <D kind="pencil" x={330} y={140} size={170} fill={YELLOW} />
      <D kind="heart" x={1460} y={880} size={90} fill={RED} rot={10} />
    </Stage>
  );
}

function Cover() {
  return (
    <Stage w={1000} h={1500}>
      <D kind="star" x={60} y={70} size={110} rot={-14} fill={YELLOW} />
      <D kind="spiral" x={840} y={60} size={110} />
      <Pos x={60} y={140}>
        <Logo width={880} />
      </Pos>
      <Sheet x={90} y={760} w={820} rot={-2} line={7} />
      <Marker color={RED} x={560} y={1360} rot={-14} />
      <Marker color={BLUE} x={-40} y={1380} rot={8} />
      <D kind="squiggle" x={40} y={640} size={140} color={PINK} />
      <D kind="arrow" x={780} y={600} size={150} rot={60} />
      <D kind="burst" x={860} y={1330} size={110} fill={SKY} />
    </Stage>
  );
}

function Icon() {
  return (
    <Stage w={1024} h={1024} paper={false}>
      <div style={{ position: "absolute", inset: 0, background: BRAND.hiYellow }} />
      <svg viewBox="0 0 1024 1024" width="1024" height="1024" style={{ position: "absolute", inset: 0 }}>
        {/* white sheet, hard shadow */}
        <g transform="rotate(-6 512 512)">
          <rect x="190" y="230" width="644" height="560" rx="18" fill={INK} transform="translate(26 26)" />
          <rect x="190" y="230" width="644" height="560" rx="18" fill="#ffffff" stroke={INK} strokeWidth={22} />
          {/* the scribble */}
          <path
            d="M270 640 C 300 450, 380 420, 420 520 S 470 700, 540 560 S 620 330, 700 430 S 720 620, 770 560"
            fill="none"
            stroke={RED}
            strokeWidth={52}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="240" y="196" width="170" height="64" fill={BRAND.tape} opacity={0.95} transform="rotate(-8 325 228)" />
        </g>
        {/* pencil coming in from the bottom right, tip at the end of the scribble */}
        <g transform="translate(770 560) rotate(-130)">
          <g stroke={INK} strokeWidth={20} strokeLinejoin="round">
            <path d="M0 0 L 90 -46 L 90 46 Z" fill="#f2c89a" />
            <rect x="90" y="-46" width="330" height="92" fill={BLUE} />
            <rect x="420" y="-46" width="44" height="92" fill="#c9d1dc" />
            <rect x="464" y="-46" width="70" height="92" rx="16" fill={PINK} />
          </g>
          <path d="M0 0 L 34 -17 L 34 17 Z" fill={INK} />
        </g>
      </svg>
    </Stage>
  );
}

function TvShot() {
  const feed: [string, string, boolean][] = [
    ["Ben", "kite", false],
    ["Cy", "parachute", false],
    ["Dee", "", true],
    ["Ana", "rocket", false],
    ["Eli", "", true],
  ];
  const players: [string, string, number, string][] = [
    ["Mia", "m", 0, "is-drawing"],
    ["Dee", "d", 1240, "is-correct"],
    ["Eli", "e", 1100, "is-correct"],
    ["Ana", "a", 860, ""],
    ["Ben", "b", 720, ""],
    ["Cy", "c", 540, ""],
  ];
  return (
    <Stage w={1920} h={1080}>
      <Pos x={36} y={22}>
        <Logo width={330} variant="line" />
      </Pos>
      <div style={{ position: "absolute", left: 0, right: 0, top: 18, display: "flex", justifyContent: "center" }}>
        <div className="mask">
          {"HOT AIR BALLOON".split("").map((c, i) =>
            c === " " ? (
              <span key={i} className="mask-gap" />
            ) : (
              <span key={i} className={`mask-letter${i === 1 || i === 9 ? " is-revealed" : ""}`}>
                {i === 1 || i === 9 ? c : ""}
              </span>
            ),
          )}
        </div>
      </div>
      <Pos x={1700} y={14}>
        <div className="timer-ring urgent" style={cssVars({ "--p": "0.11" })}>
          <svg viewBox="0 0 100 100">
            <circle className="track" cx="50" cy="50" r="42" />
            <circle className="fill" cx="50" cy="50" r="42" pathLength={100} />
          </svg>
          <span className="timer-num">9</span>
        </div>
      </Pos>
      {/* left column: drawer + players */}
      <div style={{ position: "absolute", left: 30, top: 200, width: 360, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="headline" style={{ fontSize: 56 }}>
          Mia <span className="highlight">draws!</span>
        </div>
        {players.map(([name, id, score, cls]) => (
          <span key={id} className={`chip ${cls}`} style={{ width: 340 }}>
            <Avatar name={name} id={id} size={58} />
            <span className="chip-name">{name}</span>
            <span className="chip-score">{score || ""}</span>
          </span>
        ))}
      </div>
      <Sheet x={420} y={196} w={1050} partial line={6} />
      {/* right column: feed */}
      <div style={{ position: "absolute", left: 1500, top: 196, width: 390, display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="label">Guesses</div>
        {feed.map(([name, text, ok], i) =>
          ok ? (
            <div key={i} className="toast correct">
              {name} got it! <span className="points">+{i === 2 ? 290 : 220}</span>
            </div>
          ) : (
            <div key={i} className="feed-row">
              <b>{name}</b> {text}
            </div>
          ),
        )}
      </div>
      <div style={{ position: "absolute", left: 1500, bottom: 40, width: 390 }} className="label">
        Guess on your phone
      </div>
    </Stage>
  );
}

function LogoOnly() {
  return (
    <div style={{ width: 1400, padding: 40, display: "inline-block" }} id="logo">
      <Logo width={1320} />
    </div>
  );
}

export type Scene = { name: string; w: number; h: number; html: string; format: "png" | "jpg"; transparent?: boolean; selector?: string };

export function scenes(): Scene[] {
  const r = (n: ReactNode) => renderToStaticMarkup(<>{n}</>);
  return [
    { name: "icon", w: 1024, h: 1024, html: r(<Icon />), format: "png" },
    { name: "cover", w: 1000, h: 1500, html: r(<Cover />), format: "jpg" },
    { name: "logo", w: 1400, h: 900, html: r(<LogoOnly />), format: "png", transparent: true, selector: "#logo svg" },
    { name: "hero-clean", w: 1920, h: 1080, html: r(<HeroClean />), format: "jpg" },
    { name: "tv", w: 1920, h: 1080, html: r(<TvShot />), format: "jpg" },
  ];
}
