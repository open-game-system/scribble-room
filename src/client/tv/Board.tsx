// The scoreboard after a reveal (classic) or the team leaderboard (teams). Rows start where they sat
// before this turn's gains and slide to their new rank; gains count up beside them.
import type { CSSProperties } from "react";
import { TEAM_COLORS } from "../brand";
import type { TvView } from "../../shared/protocol";
import { CountUp, PlayerAvatar } from "./bits";
import { boardRows, playerBoardLayout, revealFontSize, roundLabel, slotOf, teamBoardLayout, teamRoster, teamRows } from "./derive";

type Vars = CSSProperties & Record<`--${string}`, string>;


function Header({ view }: { view: TvView }) {
  const word = view.lastTurn?.word ?? "";
  return (
    <header className="tv-board-head">
      <h1 className="headline">{view.settings.mode === "teams" ? "Team scores" : "Scores"}</h1>
      <span className="tv-board-round">{roundLabel(view)}</span>
      {word ? (
        <span className="tv-board-word">
          It was: <b style={{ fontSize: `${Math.min(48, revealFontSize(word, 620))}px` }}>{word.toUpperCase()}</b>
        </span>
      ) : null}
    </header>
  );
}

/** Height the score rows may fill (the board is 980px tall, minus its header). */
const PLAYER_AREA = 800;
/** Width of one column of rows (the board is 1480px wide). */
const COL_W = { 1: 1480, 2: 720 } as const;
const COL_GAP = 40;

function PlayerBoard({ view }: { view: TvView }) {
  const rows = boardRows(view.players, view.lastTurn?.gains ?? {});
  const layout = playerBoardLayout(rows.length, PLAYER_AREA);
  const shown = rows.filter((r) => r.to < layout.shown);
  const more = rows.length - shown.length;
  const perCol = Math.ceil(layout.shown / layout.cols);
  const colW = COL_W[layout.cols];
  const pos = (index: number) => {
    const s = slotOf(Math.min(index, layout.shown - 1), layout);
    return { x: s.col * (colW + COL_GAP), y: s.row * layout.rowH };
  };
  const listStyle: Vars = { height: `${perCol * layout.rowH}px`, "--row-font": `${layout.font}px`, "--row-h": `${layout.rowH}px` };
  return (
    <div className="tv-board" data-focal="board">
      <Header view={view} />
      <ol className={layout.cols === 2 ? "tv-board-rows is-two" : "tv-board-rows"} style={listStyle}>
        {shown.map((r) => {
          const to = pos(r.to);
          const from = pos(r.from);
          const style: Vars = {
            top: `${to.y}px`,
            left: `${to.x}px`,
            width: `${colW}px`,
            "--dx": `${from.x - to.x}px`,
            "--dy": `${from.y - to.y}px`,
            animationDelay: `${r.to * 60}ms, ${350 + r.to * 30}ms`,
          };
          return (
            <li key={r.seat.id} className={r.gain > 0 ? "tv-board-row has-gain" : "tv-board-row"} style={style}>
              <span className="tv-rank">{r.rank}</span>
              <PlayerAvatar seat={r.seat} size={Math.round(layout.font * 1.35)} />
              <span className="tv-board-name">{r.seat.name}</span>
              <span className="tv-board-dots" aria-hidden="true" />
              <span className="tv-board-pts tabular">{r.seat.score}</span>
              <span className="tv-board-gain">{r.gain > 0 ? <CountUp to={r.gain} prefix="+" delay={250} /> : null}</span>
            </li>
          );
        })}
      </ol>
      {more > 0 ? <p className="tv-score-more">+{more} more</p> : null}
    </div>
  );
}

/** Height the team rows may fill (the board is 980px tall, minus its header). */
const TEAM_AREA = 800;

function TeamBoard({ view }: { view: TvView }) {
  const rows = teamRows(view, view.lastTurn?.teamGains ?? {});
  const top = Math.max(1, ...rows.map((r) => r.team.score));
  const layout = teamBoardLayout(rows.length, TEAM_AREA);
  return (
    <div className="tv-board" data-focal="board">
      <Header view={view} />
      <ol className="tv-teamboard">
        {rows.map((r, i) => {
          const c = TEAM_COLORS[r.color] ?? TEAM_COLORS[0];
          const best = teamRoster(view.players, r.team.id).slice(0, layout.topPlayers);
          const style: Vars = {
            "--w": `${Math.max(30, Math.round((r.team.score / top) * 100))}%`,
            "--bar-font": `${layout.barFont}px`,
            height: `${layout.rowH}px`,
            animationDelay: `${i * 90}ms`,
          };
          return (
            <li key={r.team.id} className="tv-teambar-row" style={style}>
              <span className="tv-rank">{r.rank}</span>
              <span className="tv-teambar" style={{ background: c?.bg, color: c?.text }}>
                <span className="tv-teambar-name">{r.team.name}</span>
                <span className="tv-teambar-pts tabular">{r.team.score}</span>
              </span>
              <span className="tv-board-gain">{r.gain > 0 ? <CountUp to={r.gain} prefix="+" delay={250} /> : null}</span>
              {best.length > 0 ? (
                <ul className="tv-teambar-best">
                  {best.map((p) => (
                    <li key={p.id}>
                      <PlayerAvatar seat={p} size={Math.max(40, Math.round(layout.barFont * 0.55))} />
                      <span>{p.name}</span>
                      <b className="tabular">{p.score}</b>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Board({ view }: { view: TvView }) {
  return view.settings.mode === "teams" && view.teams.length > 0 ? <TeamBoard view={view} /> : <PlayerBoard view={view} />;
}
