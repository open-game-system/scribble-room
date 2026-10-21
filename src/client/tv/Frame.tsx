// The play frame (picking, drawing, and the reveal's first beat): top bar (round, mask or word, timer),
// left column (drawer + scores / team strip, or the gains), the sheet, the feed (or who got it).
// The sheet keeps its place and size across all three: the drawing never moves.
import { TEAM_COLORS } from "../brand";
import { Logo } from "../brand";
import type { TvView } from "../../shared/protocol";
import { CountUp, Mask, PlayerAvatar, TimerRing } from "./bits";
import { gainRows, guessProgress, isUrgent, nameOf, revealCaption, roundLabel, standings, teamRows } from "./derive";
import { Feed } from "./Feed";
import { Sheet } from "./Sheet";

const SCORE_ROWS = 9;

function ScoreList({ view }: { view: TvView }) {
  const rows = standings(view.players);
  const shown = rows.slice(0, SCORE_ROWS);
  const more = rows.length - shown.length;
  return (
    <ol className="tv-scores">
      {shown.map(({ seat, rank }) => {
        const cls = ["tv-score-row", seat.id === view.drawerId ? "is-drawing" : "", seat.guessed ? "is-correct pop" : "", seat.connected ? "" : "is-away"].join(" ");
        return (
          <li key={seat.id} className={cls}>
            <span className="tv-rank">{rank}</span>
            <span className="tv-score-name">{seat.name}</span>
            <span className="tv-score-pts tabular">{seat.score}</span>
          </li>
        );
      })}
      {more > 0 ? <li className="tv-score-more">+{more} more</li> : null}
    </ol>
  );
}

function TeamStrip({ view }: { view: TvView }) {
  const rows = teamRows(view);
  const top = Math.max(1, ...rows.map((r) => r.team.score));
  return (
    <ol className="tv-teamstrip">
      {rows.map((r) => {
        const c = TEAM_COLORS[r.color] ?? TEAM_COLORS[0];
        const got = r.members.filter((m) => m.guessed).length;
        return (
          <li key={r.team.id} className={r.drawing ? "tv-team is-drawing" : "tv-team"} style={{ background: c?.bg, color: c?.text }}>
            <span className="tv-team-name">{r.team.name}</span>
            <span className="tv-team-pts tabular">{r.team.score}</span>
            <span className="tv-team-bar" style={{ width: `${Math.round((r.team.score / top) * 100)}%` }} />
            <span className="tv-team-sub">{r.drawing ? "Drawing now" : `${got} of ${r.members.length} got it`}</span>
          </li>
        );
      })}
    </ol>
  );
}

function DrawerCard({ view }: { view: TvView }) {
  const drawer = view.players.find((p) => p.id === view.drawerId);
  const name = drawer?.name ?? "Someone";
  const team = view.settings.mode === "teams" ? view.teams.find((t) => t.id === view.drawingTeam) : undefined;
  return (
    <div className="card tilt-l tv-drawer">
      {drawer ? <PlayerAvatar seat={drawer} size={72} /> : null}
      <div>
        <div className="tv-drawer-name">{name}</div>
        <div className="tv-drawer-sub">{view.phase === "picking" ? "is picking" : "is drawing"}{team ? ` for ${team.name}` : ""}</div>
      </div>
    </div>
  );
}

function Gains({ view }: { view: TvView }) {
  const turn = view.lastTurn;
  if (!turn) return null;
  const rows = gainRows(turn, view.players).slice(0, 9);
  return (
    <section className="tv-gains" aria-label="Points this turn">
      <span className="label">Points this turn</span>
      {rows.length === 0 ? <p className="tv-gains-none">No points this turn</p> : null}
      <ol>
        {rows.map((r, i) => (
          <li key={r.id} className="tv-gain-row" style={{ animationDelay: `${300 + i * 80}ms` }}>
            <span className="tv-gain-pts">
              <CountUp to={r.gain} prefix="+" delay={300 + i * 80} />
            </span>
            <span className="tv-gain-name">{r.name}</span>
            {r.drawer ? <span className="tv-gain-tag">drew it</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function WhoGotIt({ view }: { view: TvView }) {
  const turn = view.lastTurn;
  if (!turn) return null;
  const { got, of } = guessProgress(view);
  const names = view.players.filter((p) => p.guessed && p.id !== turn.drawerId);
  return (
    <section className="tv-who" aria-label="Who got it">
      <p className="tv-who-caption">{revealCaption(turn, got, of)}</p>
      <ul>
        {names.slice(0, 10).map((p, i) => (
          <li key={p.id} className="chip is-correct pop" style={{ animationDelay: `${200 + i * 90}ms` }}>
            <PlayerAvatar seat={p} size={52} />
            <span className="chip-name">{p.name}</span>
          </li>
        ))}
        {names.length > 10 ? <li className="tv-score-more">+{names.length - 10} more</li> : null}
      </ul>
      <p className="tv-who-drew">Drawn by {nameOf(view.players, turn.drawerId)}</p>
    </section>
  );
}

function wordFontSize(word: string): number {
  return Math.round(Math.min(120, 1020 / Math.max(1, word.length * 0.6)));
}

export function Frame({ view, seconds, fraction }: { view: TvView; seconds: number; fraction: number }) {
  const reveal = view.phase === "reveal" && view.lastTurn !== null;
  const word = view.lastTurn?.word ?? "";
  const drawer = nameOf(view.players, view.drawerId);
  const { got, of } = guessProgress(view);
  const teams = view.settings.mode === "teams";
  return (
    <div className={`tv-frame phase-${view.phase}`}>
      <header className="tv-top">
        <div className="tv-top-left">
          <Logo variant="line" width={300} />
          <span className="tv-round">{roundLabel(view)}</span>
        </div>
        <div className="tv-top-mid">
          {view.phase === "drawing" && view.mask ? <Mask mask={view.mask} /> : null}
          {view.phase === "picking" ? <p className="headline tv-top-headline">Get ready to guess!</p> : null}
          {reveal ? (
            <div className="tv-word" key={`word-${view.lastTurn?.turn ?? 0}`}>
              <span className="tv-word-label">It was:</span>
              <span className="card tv-word-card drop-in" style={{ fontSize: `${wordFontSize(word)}px` }}>
                {[...word.toUpperCase()].map((ch, i) => (
                  <span key={i} className="stamp" style={{ animationDelay: `${420 + i * 60}ms` }}>
                    {ch === " " ? " " : ch}
                  </span>
                ))}
              </span>
            </div>
          ) : null}
        </div>
        <div className="tv-top-right">
          {view.phase === "picking" || view.phase === "drawing" ? (
            <TimerRing seconds={seconds} fraction={fraction} urgent={isUrgent(view.phase, seconds)} label={view.phase === "picking" ? "to pick" : "seconds"} />
          ) : null}
        </div>
      </header>
      <aside className="tv-left">
        {reveal ? (
          <Gains view={view} />
        ) : (
          <>
            <DrawerCard view={view} />
            {teams ? <TeamStrip view={view} /> : <ScoreList view={view} />}
          </>
        )}
      </aside>
      <main className="tv-mid">
        <Sheet
          turn={view.canvasTurn}
          ops={view.ops}
          cover={
            view.phase === "picking" ? (
              <>
                <p className="headline">{drawer} is choosing a word…</p>
                <p className="tv-sheet-sub">Guess on your phone when the drawing starts</p>
              </>
            ) : undefined
          }
        />
      </main>
      <aside className="tv-right">{reveal ? <WhoGotIt view={view} /> : <Feed feed={view.feed} caption={view.phase === "drawing" ? `${got} of ${of} got it` : ""} />}</aside>
    </div>
  );
}
