// After a turn (reveal: the word, my gain, my place) and after the game (podium, Play again).
import type { CanvasView, PlayerView } from "../../shared/protocol";
import { TEAMS } from "../../config";
import { TEAM_COLORS } from "../brand";
import type { OutMsg } from "../net";
import { FitWord } from "./FitWord";
import { Mirror } from "./Sheet";
import { gainOf, ordinal, placeOf, rank, reasonLine, teamWinner } from "./standings";
import { Btn, Chip } from "./ui";

type Props = { view: PlayerView; send: (m: OutMsg) => void };

export function Reveal({ view, canvas }: Props & { canvas: CanvasView }) {
  const t = view.lastTurn;
  const gain = gainOf(t, view.me.id);
  const place = placeOf(view.players, view.me.id);
  const me = view.players.find((p) => p.id === view.me.id);
  const drewIt = t?.drawerId === view.me.id;
  return (
    <main className="screen reveal" data-screen="reveal">
      <p className="label">The word was</p>
      <FitWord className="reveal-word display drop-in" testId="reveal-word" text={t?.word ?? ""} base={56} min={18} />
      <p className="hint reason">{reasonLine(t?.reason ?? "")}</p>
      <Mirror canvas={canvas} className="reveal-mirror" />
      <div className="reveal-stats">
        <div className={`stat card tilt-l${gain > 0 ? " gained" : ""}`} data-testid="my-gain">
          <span className="label">{drewIt ? "For your drawing" : "You got"}</span>
          <span className="stat-num display">{gain > 0 ? `+${gain}` : "0"}</span>
        </div>
        <div className="stat card tilt-r" data-testid="my-rank">
          <span className="label">You're</span>
          <span className="stat-num display">{place ? ordinal(place) : "–"}</span>
          <span className="stat-sub">
            of {view.players.length} · {me?.score ?? 0} pts
          </span>
        </div>
      </div>
    </main>
  );
}

export function Podium({ view, send }: Props) {
  const ranked = rank(view.players);
  const place = placeOf(view.players, view.me.id);
  const host = view.players.find((p) => p.id === view.hostId);
  const isTeams = view.settings.mode === "teams";
  const win = isTeams ? teamWinner(view.teams, view.players) : null;
  const winIdx = win ? TEAMS.findIndex((t) => t.id === win.team.id) : -1;
  const winCol = TEAM_COLORS[winIdx] ?? null;
  const mine = view.players.find((p) => p.id === view.me.id)?.team;
  return (
    <main className="screen podium" data-screen="podium">
      {win ? (
        <section className="team-win card" style={winCol ? { "--team": winCol.bg, "--team-text": winCol.text } : undefined} data-testid="team-winner">
          <p className="label">Winning team</p>
          <p className="headline stamp">{win.team.name}</p>
          <p className="stat-sub">{win.team.score} pts{win.mvp ? ` · MVP ${win.mvp.name}` : ""}</p>
          <p className="you-place">{mine === win.team.id ? "That's your team!" : "Good game!"}</p>
        </section>
      ) : (
        <section className="my-place" data-testid="my-place">
          <p className="label">You came</p>
          <p className="place-num display stamp">{place ? ordinal(place) : "–"}</p>
        </section>
      )}
      <ol className="top3">
        {ranked.slice(0, 3).map((r) => (
          <li key={r.item.id} className={`place place-${r.place}`}>
            <span className="place-badge display">{r.place}</span>
            <Chip seat={r.item} score me={r.item.id === view.me.id} />
          </li>
        ))}
      </ol>
      {view.me.isHost ? (
        <Btn className="primary big" testId="play-again" onPress={() => send({ type: "PLAY_AGAIN" })}>
          Play again
        </Btn>
      ) : (
        <p className="hint" data-testid="waiting-host">
          Waiting for {host?.name ?? "the host"} to play again…
        </p>
      )}
    </main>
  );
}
