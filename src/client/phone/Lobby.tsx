// The lobby: who's here, the host's settings and Start, the team picker in teams mode.
import { DIFFICULTIES, type PlayerView } from "../../shared/protocol";
import { ROOM, TEAMS } from "../../config";
import { TEAM_COLORS } from "../brand";
import type { OutMsg } from "../net";
import { DRAW_TIMES, ROUND_CHOICES, maxTeamsFor, settingsLine, startBlock, stepIn, teamsOffered } from "./lobby-rules";
import { Btn, Chip } from "./ui";

type Props = { view: PlayerView; send: (m: OutMsg) => void; tvUrl: string | null };

export function Lobby({ view, send, tvUrl }: Props) {
  const host = view.players.find((p) => p.id === view.hostId);
  const isTeams = view.settings.mode === "teams";
  return (
    <main className="screen lobby" data-screen="lobby">
      <header className="lobby-head">
        <p className="label">Room</p>
        <p className="room-code display" data-testid="room-code">
          {view.code}
        </p>
      </header>
      <section className="lobby-players" aria-label="Players">
        <p className="label">
          {view.players.length} player{view.players.length === 1 ? "" : "s"} here
        </p>
        {isTeams ? (
          <TeamPicker view={view} send={send} />
        ) : (
          <div className="chips" data-testid="players">
            {view.players.map((p) => (
              <Chip key={p.id} seat={p} me={p.id === view.me.id} />
            ))}
          </div>
        )}
      </section>
      {view.me.isHost ? (
        <HostControls view={view} send={send} />
      ) : (
        <section className="card waiting" data-testid="waiting-host">
          <p className="headline">Waiting for {host?.name ?? "the host"}…</p>
          <p className="settings-line">{settingsLine(view.settings)}</p>
        </section>
      )}
      {tvUrl ? (
        <p className="tv-hint" data-testid="tv-hint">
          No TV yet? Open <a href={tvUrl}>{tvUrl.replace(/^https?:\/\//, "").replace(/\?.*$/, "")}</a> on a big screen.
        </p>
      ) : null}
    </main>
  );
}

function TeamPicker({ view, send }: { view: PlayerView; send: (m: OutMsg) => void }) {
  const mine = view.players.find((p) => p.id === view.me.id)?.team ?? "";
  return (
    <div className="teams" data-testid="team-picker">
      {TEAMS.slice(0, view.settings.teamCount).map((t, i) => {
        const col = TEAM_COLORS[i] ?? { bg: "#ffd400", text: "#1b1a1f" };
        const members = view.players.filter((p) => p.team === t.id);
        return (
          <div key={t.id} className={`team${mine === t.id ? " is-mine" : ""}`} style={{ "--team": col.bg, "--team-text": col.text }}>
            <Btn className="team-join" testId={`team-${t.id}`} label={`Join team ${t.name}`} selected={mine === t.id} onPress={() => send({ type: "JOIN_TEAM", team: t.id })}>
              {t.name}
              <span className="team-count">{members.length}</span>
            </Btn>
            <div className="chips">
              {members.map((p) => (
                <Chip key={p.id} seat={p} me={p.id === view.me.id} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stepper({ label, value, onDown, onUp, testId, downOff, upOff }: { label: string; value: string; onDown: () => void; onUp: () => void; testId: string; downOff: boolean; upOff: boolean }) {
  return (
    <div className="setting" data-testid={testId}>
      <span className="setting-label">{label}</span>
      <div className="stepper">
        <Btn className="icon step" label={`Less ${label.toLowerCase()}`} testId={`${testId}-down`} disabled={downOff} onPress={onDown}>
          −
        </Btn>
        <span className="step-value display">{value}</span>
        <Btn className="icon step" label={`More ${label.toLowerCase()}`} testId={`${testId}-up`} disabled={upOff} onPress={onUp}>
          +
        </Btn>
      </div>
    </div>
  );
}

function HostControls({ view, send }: { view: PlayerView; send: (m: OutMsg) => void }) {
  const s = view.settings;
  const block = startBlock(view.players, s);
  const offerTeams = teamsOffered(view.players);
  const maxTeams = maxTeamsFor(view.players.length);
  const lastRound = ROUND_CHOICES[ROUND_CHOICES.length - 1] ?? ROOM.maxRounds;
  return (
    <section className="card host" data-testid="host-controls">
      <p className="label">You're the host</p>
      <div className="setting">
        <span className="setting-label">Mode</span>
        <div className="seg" role="radiogroup" aria-label="Mode">
          <Btn className="seg-btn" testId="mode-classic" selected={s.mode === "classic"} onPress={() => send({ type: "SETTINGS", mode: "classic" })}>
            Classic
          </Btn>
          <Btn className="seg-btn" testId="mode-teams" selected={s.mode === "teams"} disabled={!offerTeams && s.mode !== "teams"} onPress={() => send({ type: "SETTINGS", mode: "teams" })}>
            Teams
          </Btn>
        </div>
      </div>
      {!offerTeams && s.mode !== "teams" ? <p className="hint">Teams from {ROOM.teamMinPlayers} players.</p> : null}
      {s.mode === "teams" ? (
        <>
          <Stepper
            label="Teams"
            testId="set-teams"
            value={String(s.teamCount)}
            downOff={s.teamCount <= 2}
            upOff={s.teamCount >= maxTeams}
            onDown={() => send({ type: "SETTINGS", teamCount: s.teamCount - 1 })}
            onUp={() => send({ type: "SETTINGS", teamCount: s.teamCount + 1 })}
          />
          <Btn className="secondary shuffle" testId="shuffle-teams" onPress={() => send({ type: "SHUFFLE_TEAMS" })}>
            Shuffle teams
          </Btn>
        </>
      ) : null}
      <Stepper
        label="Rounds"
        testId="set-rounds"
        value={String(s.rounds)}
        downOff={s.rounds <= 1}
        upOff={s.rounds >= lastRound}
        onDown={() => send({ type: "SETTINGS", rounds: s.rounds - 1 })}
        onUp={() => send({ type: "SETTINGS", rounds: s.rounds + 1 })}
      />
      <Stepper
        label="Draw time"
        testId="set-time"
        value={`${s.drawSeconds}s`}
        downOff={s.drawSeconds <= (DRAW_TIMES[0] ?? 40)}
        upOff={s.drawSeconds >= (DRAW_TIMES[DRAW_TIMES.length - 1] ?? 180)}
        onDown={() => send({ type: "SETTINGS", drawSeconds: stepIn(DRAW_TIMES, s.drawSeconds, -1) })}
        onUp={() => send({ type: "SETTINGS", drawSeconds: stepIn(DRAW_TIMES, s.drawSeconds, 1) })}
      />
      <div className="setting column">
        <span className="setting-label">Words</span>
        <div className="seg four" role="radiogroup" aria-label="Word difficulty">
          {DIFFICULTIES.map((d) => (
            <Btn key={d} className="seg-btn" testId={`difficulty-${d}`} selected={s.difficulty === d} onPress={() => send({ type: "SETTINGS", difficulty: d })}>
              {d[0]?.toUpperCase()}
              {d.slice(1)}
            </Btn>
          ))}
        </div>
      </div>
      <div className="setting">
        <span className="setting-label">Hints</span>
        <div className="seg" role="radiogroup" aria-label="Hints">
          <Btn className="seg-btn" testId="hints-on" selected={s.hints} onPress={() => send({ type: "SETTINGS", hints: true })}>
            On
          </Btn>
          <Btn className="seg-btn" testId="hints-off" selected={!s.hints} onPress={() => send({ type: "SETTINGS", hints: false })}>
            Off
          </Btn>
        </div>
      </div>
      <Btn className="primary big start" testId="start" disabled={block !== null} onPress={() => send({ type: "START" })}>
        Start
      </Btn>
      {block ? (
        <p className="hint start-why" data-testid="start-reason">
          {block}
        </p>
      ) : null}
    </section>
  );
}
