// Game over: the top three on podium blocks (or the top teams, with the winning team's players and its
// MVP), marker doodle confetti falling in the margins only, and what happens next. Blocks rise inside a
// clipped stage whose bottom edge is the ground line, so nothing ever overlaps the lines below.
import type { CSSProperties } from "react";
import { DOODLE_KINDS, Doodle, type DoodleKind, TEAM_COLORS } from "../brand";
import { BRAND } from "../brand";
import type { TvView } from "../../shared/protocol";
import { PlayerAvatar } from "./bits";
import { podiumOrder, podiumPlayers, standings, teamRoster, teamRows } from "./derive";

const CONFETTI_KINDS: readonly DoodleKind[] = DOODLE_KINDS.filter((k) => k === "star" || k === "squiggle" || k === "spiral" || k === "swirl" || k === "burst");
const CONFETTI_COLORS = [BRAND.markerPink, BRAND.markerBlue, BRAND.hiYellow, BRAND.markerGreen, BRAND.markerOrange, BRAND.markerPurple];

/** Doodles falling in the left and right margins (never over the podium). Deterministic layout. */
export function Confetti() {
  return (
    <div className="tv-confetti" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => {
        const left = i % 2 === 0;
        const x = (i * 53) % 260;
        const kind = CONFETTI_KINDS[i % CONFETTI_KINDS.length] ?? "star";
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? BRAND.markerPink;
        const style: CSSProperties = {
          left: left ? `${20 + x}px` : undefined,
          right: left ? undefined : `${20 + x}px`,
          animationDelay: `${(i % 7) * 0.35 + Math.floor(i / 7) * 0.2}s`,
          animationDuration: `${2.6 + (i % 5) * 0.3}s`,
        };
        const filled = kind === "star" || kind === "burst";
        return (
          <span key={i} className="tv-confetti-bit" style={style}>
            <Doodle kind={kind} size={54 + (i % 3) * 14} color={filled ? BRAND.ink : color} fill={color} strokeWidth={filled ? 5 : 8} rotate={(i * 47) % 360} />
          </span>
        );
      })}
    </div>
  );
}

type Spot = { place: 1 | 2 | 3; key: string; title: string; score: number; avatar: { id: string; name: string; avatar: string } | null; bg: string; text: string };

/** Names shrink to fit their 340px block (Gluten 900 is about 0.74 em per letter). */
function nameSize(name: string, place: 1 | 2 | 3): number {
  const max = place === 1 ? 72 : 56;
  return Math.max(36, Math.min(max, Math.floor(330 / (Math.max(1, name.length) * 0.74))));
}

function Blocks({ spots }: { spots: Spot[] }) {
  const order = podiumOrder(spots.length);
  const style: CSSProperties = { gridTemplateColumns: `repeat(${order.length}, 360px)` };
  return (
    <div className="tv-podium-stage">
      <div className="tv-podium-blocks" style={style}>
        {order.map((place) => {
          const s = spots.find((x) => x.place === place);
          if (!s) return null;
          return (
            <div key={s.key} className={`tv-podium-col place-${place}`}>
              <div className="tv-podium-who">
                {s.avatar ? <PlayerAvatar seat={s.avatar} size={place === 1 ? 140 : 104} /> : null}
                <span className="tv-podium-name" style={{ fontSize: `${nameSize(s.title, place)}px` }}>
                  {s.title}
                </span>
              </div>
              <div className="tv-podium-block" style={{ background: s.bg, color: s.text }}>
                <span className="tv-podium-place display">{place}</span>
                <span className="tv-podium-score tabular">{s.score}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PLACE_BG = { 1: BRAND.hiYellow, 2: "#8fd8ff", 3: "#ffb3c7" } as const;
const ROSTER_MAX = 14;

/** The winning team's players as chips, best first; the first is the MVP. */
function Roster({ view, teamId, color }: { view: TvView; teamId: string; color: { bg: string; text: string } }) {
  const roster = teamRoster(view.players, teamId);
  const shown = roster.slice(0, ROSTER_MAX);
  return (
    <ul className="tv-podium-roster" aria-label="The winning team">
      {shown.map((p, i) => (
        <li key={p.id} className={i === 0 ? "chip tv-roster-chip is-mvp" : "chip tv-roster-chip"} style={{ animationDelay: `${1500 + i * 70}ms` }}>
          <PlayerAvatar seat={p} size={i === 0 ? 64 : 48} />
          <span className="chip-name">{p.name}</span>
          {i === 0 ? (
            <span className="tv-mvp-tag" style={{ background: color.bg, color: color.text }}>
              MVP {p.score}
            </span>
          ) : null}
        </li>
      ))}
      {roster.length > ROSTER_MAX ? <li className="tv-score-more">+{roster.length - ROSTER_MAX} more</li> : null}
    </ul>
  );
}

export function Podium({ view }: { view: TvView }) {
  const teams = view.settings.mode === "teams" && view.teams.length > 0;
  let spots: Spot[];
  let headline: string;
  let sub = "";
  let roster = null;
  if (teams) {
    const rows = teamRows(view).slice(0, 3);
    spots = rows.map((r, i) => {
      const c = TEAM_COLORS[r.color] ?? TEAM_COLORS[0];
      const place = ([1, 2, 3] as const)[i] ?? 3;
      return { place, key: r.team.id, title: r.team.name, score: r.team.score, avatar: null, bg: c?.bg ?? BRAND.hiYellow, text: c?.text ?? BRAND.ink };
    });
    const winner = rows[0];
    headline = winner ? `${winner.team.name} wins!` : "Game over";
    const c = winner ? TEAM_COLORS[winner.color] : undefined;
    if (winner && c) roster = <Roster view={view} teamId={winner.team.id} color={c} />;
  } else {
    spots = podiumPlayers(view.players).map((p) => ({ place: p.place, key: p.id, title: p.name, score: p.score, avatar: p, bg: PLACE_BG[p.place], text: BRAND.ink }));
    const top = spots[0];
    headline = top ? `${top.title} wins!` : "Game over";
    const rest = standings(view.players).slice(3, 8);
    if (rest.length > 0) sub = rest.map((r) => `${r.rank}. ${r.seat.name} ${r.seat.score}`).join("   ");
  }
  return (
    <div className={teams ? "tv-podium is-teams" : "tv-podium"} data-focal="podium">
      <Confetti />
      <h1 className="tv-podium-title display drop-in">{headline}</h1>
      {roster}
      <Blocks spots={spots} />
      {sub ? <p className="tv-podium-sub">{sub}</p> : null}
      <p className="tv-podium-next">
        <span className="highlight">Host: press Play again on your phone</span>
      </p>
    </div>
  );
}
