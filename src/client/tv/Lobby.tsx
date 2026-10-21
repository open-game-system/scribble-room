// The lobby: logo, the join card (code + QR, plain browser only), the settings in words, who's in
// (chips pop in as they join; team columns in teams mode) and what the room is waiting for.
import qrcode from "qrcode-generator";
import { useMemo } from "react";
import { Doodle, Logo, TEAM_COLORS } from "../brand";
import { ROOM } from "../../config";
import type { Seat, TvView } from "../../shared/protocol";
import { PlayerAvatar } from "./bits";
import { lobbyCaption, settingsSummary, teamRows } from "./derive";

function qrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 10, margin: 0, scalable: true });
}

/** A long host wraps at its dots and slashes, never mid-word and never off the screen. */
function breakable(text: string) {
  return text.split(/(?<=[./-])/).map((part, i) => (
    <span key={i}>
      {part}
      <wbr />
    </span>
  ));
}

function JoinCard({ code }: { code: string }) {
  const url = `${location.origin}/join/${code}`;
  const svg = useMemo(() => qrSvg(url), [url]);
  return (
    <div className="tv-join">
      <div className="card tilt-l tv-qr">
        <span className="tape" style={{ top: -18, left: 30 }} />
        <span className="tape" style={{ top: -14, right: 24, transform: "rotate(5deg)" }} />
        <div className="tv-qr-img" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <div className="tv-join-text">
        <span className="tv-join-label">Scan, or go to</span>
        <span className="tv-join-url">{breakable(`${location.host}/join`)}</span>
        <span className="tv-join-label">and enter</span>
        <span className="tv-code display" aria-label={`Room code ${code.split("").join(" ")}`}>
          {code}
        </span>
      </div>
    </div>
  );
}

/** What fits the players panel at crowd size (6 rows); the rest are counted. */
const MAX_CHIPS = 56;

function Chip({ seat, host }: { seat: Seat; host: boolean }) {
  return (
    <li className={seat.connected ? "chip pop tv-chip" : "chip pop tv-chip is-away"}>
      <PlayerAvatar seat={seat} size={56} />
      <span className="chip-name">{seat.name}</span>
      {host ? <span className="tv-host-tag">host</span> : null}
    </li>
  );
}

function Players({ view }: { view: TvView }) {
  if (view.settings.mode === "teams" && view.teams.length > 0) {
    const rows = teamRows(view);
    const ordered = [...rows].sort((a, b) => a.color - b.color);
    return (
      <div className="tv-lobby-teams">
        {ordered.map((r) => {
          const c = TEAM_COLORS[r.color] ?? TEAM_COLORS[0];
          return (
            <section key={r.team.id} className="tv-lobby-team">
              <h3 style={{ background: c?.bg, color: c?.text }}>
                {r.team.name} <span className="tabular">{r.members.length}</span>
              </h3>
              <ul>
                {r.members.map((p) => (
                  <Chip key={p.id} seat={p} host={p.id === view.hostId} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }
  const size = view.players.length > 18 ? " is-crowd" : view.players.length <= 8 ? " is-few" : "";
  return (
    <ul className={`tv-lobby-chips${size}`}>
      {view.players.slice(0, MAX_CHIPS).map((p) => (
        <Chip key={p.id} seat={p} host={p.id === view.hostId} />
      ))}
      {view.players.length > MAX_CHIPS ? <li className="tv-score-more">+{view.players.length - MAX_CHIPS} more</li> : null}
    </ul>
  );
}

export function Lobby({ view, showJoin, couch }: { view: TvView; showJoin: boolean; couch: readonly string[] }) {
  const waitingCouch = couch.filter((name) => !view.players.some((p) => p.name === name));
  const n = view.players.length;
  return (
    <div className="tv-lobby">
      {/* Doodles live in the corners, outside the safe area's text. */}
      <Doodle kind="star" size={84} fill="#ff4fa3" rotate={-12} className="tv-doodle d1" />
      <Doodle kind="spiral" size={84} color="#1e6fe8" className="tv-doodle d2" />
      <Doodle kind="squiggle" size={96} color="#12a150" className="tv-doodle d3" />
      <header className={showJoin ? "tv-lobby-head" : "tv-lobby-head no-join"}>
        <Logo width={showJoin ? 420 : 560} />
        <div className="tv-lobby-intro">
          <p className="headline">One draws. Everyone guesses.</p>
          <ul className="tv-settings">
            {settingsSummary(view.settings).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        {showJoin ? <JoinCard code={view.code} /> : null}
      </header>
      <section className="tv-lobby-players" aria-label="Players">
        <h2 className="label">
          {n === 0 ? "No players yet" : `${n} ${n === 1 ? "player" : "players"} in`}
        </h2>
        <Players view={view} />
        {waitingCouch.length > 0 ? <p className="tv-couch">On the couch: {waitingCouch.join(", ")}</p> : null}
      </section>
      <footer className="tv-lobby-foot">
        <span className="highlight">{lobbyCaption(view, ROOM.minPlayers)}</span>
      </footer>
    </div>
  );
}
