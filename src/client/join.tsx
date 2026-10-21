// The phone page: join (OGS profile or a typed name), then two sockets — the player view and the shared
// canvas mirror — and the screens in ./phone. A page opened without a boot payload and with
// ?fixture=<name> shows that screen with fixture data (dev only).
import { isOGSCastAvailable } from "@open-game-system/cast-kit-core";
import { CastProvider, useCastViewUrl } from "@open-game-system/cast-kit-react";
import { reportOgsSitting } from "@open-game-system/profile-kit";
import { useOgsProfile } from "@open-game-system/profile-kit/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as z from "zod/mini";
import { GAME } from "../config";
import { JoinBootZ, JoinResponseZ, type JoinBoot } from "../shared/boot";
import { type CanvasView, CanvasViewSchema, type PlayerView, PlayerViewSchema, socketPath } from "../shared/protocol";
import { initAudio } from "./audio";
import { Logo } from "./brand";
import { type OutMsg, connect, setServerNow, useConnectionState, useView } from "./net";
import { fixture, isFixture } from "./phone/fixtures";
import { sittingLabel } from "./phone/lobby-rules";
import { Phone } from "./phone/Phone";
import { Btn } from "./phone/ui";

/** The Worker also returns the canvas socket's first snapshot; read it when it is there. */
const JoinZ = z.extend(JoinResponseZ, {
  canvas: z.object({ id: z.string(), sig: z.string(), snapshot: z.optional(z.unknown()) }),
});
type Creds = z.infer<typeof JoinZ>;

const EMPTY_CANVAS: CanvasView = { phase: "lobby", drawerId: "", canvasTurn: 0, ops: {} };
const NAME_KEY = `${GAME.storagePrefix}:name`;
const seatKey = (code: string) => `${GAME.storagePrefix}:seat:${code}`;

function readBoot(): JoinBoot | null {
  const el = document.getElementById("boot");
  if (!el?.textContent) return null;
  return JoinBootZ.parse(JSON.parse(el.textContent));
}

function load(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

const SeatZ = z.object({ id: z.string(), sig: z.string() });
function savedSeat(code: string): { id: string; sig: string } | null {
  const r = SeatZ.safeParse(load(seatKey(code)));
  return r.success ? r.data : null;
}
function savedName(): string {
  const v = load(NAME_KEY);
  return typeof v === "string" ? v : "";
}

async function joinRoom(code: string, body: { name?: string; token?: string }): Promise<Creds> {
  const sentAt = Date.now();
  const res = await fetch(`/api/${code}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, ...savedSeat(code) }),
  });
  if (!res.ok) throw new Error(res.status === 404 ? "That room is gone. Check the code on the TV." : "Couldn't join. Try again.");
  const creds = JoinZ.parse(await res.json());
  setServerNow(creds.serverNow, sentAt);
  save(seatKey(code), { id: creds.id, sig: creds.sig });
  return creds;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------- joining

function Join({ boot }: { boot: JoinBoot }) {
  const profile = useOgsProfile();
  const [creds, setCreds] = useState<Creds | null>(null);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(false);
  const [rejoining, setRejoining] = useState(false);

  useEffect(() => {
    if (asked.current || profile === undefined) return;
    if (profile) {
      asked.current = true; // join once per seat: a refreshed token must not join again
      joinRoom(boot.code, { token: profile.token, name: profile.name }).then(setCreds, (e: unknown) => setError(errText(e)));
      return;
    }
    // Plain browser: a refreshed phone with a seat and a name here goes straight back in.
    const name = savedName();
    if (savedSeat(boot.code) && name) {
      asked.current = true;
      setRejoining(true);
      joinRoom(boot.code, { name }).then(setCreds, () => setRejoining(false));
    }
  }, [profile, boot.code]);

  if (creds) return <Connected boot={boot} creds={creds} inOgs={Boolean(profile)} />;
  if (error) return <Splash text={error} />;
  if (profile === undefined || profile || rejoining) return <Splash text="Finding a seat…" />;
  return <NameForm code={boot.code} onJoined={setCreds} />;
}

function Splash({ text }: { text: string }) {
  return (
    <main className="splash paper">
      <Logo width={260} />
      <p className="headline">{text}</p>
    </main>
  );
}

function NameForm({ code, onJoined }: { code: string; onJoined: (c: Creds) => void }) {
  const [name, setName] = useState(savedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    save(NAME_KEY, n);
    joinRoom(code, { name: n }).then(onJoined, (e: unknown) => {
      setBusy(false);
      setError(errText(e));
    });
  };
  return (
    <form
      className="nameform paper"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <Logo width={280} />
      <div className="card tilt-l nameform-card">
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          className="input"
          data-testid="name-input"
          aria-label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          autoComplete="nickname"
          enterKeyHint="go"
        />
        <Btn className="primary big" testId="join" disabled={busy || !name.trim()} onPress={go}>
          {busy ? "Joining…" : `Join room ${code}`}
        </Btn>
        {error ? (
          <p className="toast info" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- connected

function OgsTv({ tvUrl }: { tvUrl: string }) {
  useCastViewUrl(`${tvUrl}&stream=1`);
  return null;
}

function Connected({ boot, creds, inOgs }: { boot: JoinBoot; creds: Creds; inOgs: boolean }) {
  const [player] = useState(() => connect(PlayerViewSchema, socketPath(boot.code, creds.id, creds.sig), PlayerViewSchema.parse(creds.snapshot)));
  const [mirror] = useState(() => {
    const first = creds.canvas.snapshot === undefined ? EMPTY_CANVAS : CanvasViewSchema.parse(creds.canvas.snapshot);
    return connect(CanvasViewSchema, socketPath(boot.code, creds.canvas.id, creds.canvas.sig), first);
  });
  useEffect(
    () => () => {
      player.disconnect();
      mirror.disconnect();
    },
    [player, mirror],
  );
  const view = useView(player);
  const canvas = useView(mirror);
  const state = useConnectionState(player);
  const send = useCallback((m: OutMsg) => player.send(m), [player]);
  const castable = useMemo(() => isOGSCastAvailable(), []);

  useEffect(() => initAudio(), []);
  const label = sittingLabel(view);
  useEffect(() => {
    if (inOgs) reportOgsSitting({ instanceId: `${GAME.storagePrefix}-${view.code}`, appId: GAME.appId, status: label.status, title: label.title });
  }, [inOgs, label.status, label.title, view.code]);

  return (
    <>
      {castable && boot.tvUrl ? (
        <CastProvider>
          <OgsTv tvUrl={boot.tvUrl} />
        </CastProvider>
      ) : null}
      <Phone view={view} canvas={canvas} send={send} connected={state === "connected"} tvUrl={inOgs || castable ? null : boot.tvUrl} />
    </>
  );
}

// ---------------------------------------------------------------- fixtures (dev)

function Fixture({ name }: { name: string }) {
  const f = useMemo(() => (isFixture(name) ? fixture(name) : null), [name]);
  useEffect(() => initAudio(), []);
  const send = useCallback((m: OutMsg) => console.info("send", m), []);
  if (!f) return <Splash text={`No fixture "${name}"`} />;
  return <Phone view={f.view} canvas={f.canvas} send={send} connected tvUrl="https://scribble.example/tv/K7QX?k=x" replayNotice />;
}

// ---------------------------------------------------------------- mount

function App(): React.ReactElement {
  const boot = useMemo(readBoot, []);
  if (boot) return <Join boot={boot} />;
  const name = new URLSearchParams(window.location.search).get("fixture");
  if (name) return <Fixture name={name} />;
  return <Splash text="Join from the room's QR code." />;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
document.documentElement.classList.add("phone");
createRoot(root).render(<App />);
