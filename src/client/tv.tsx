// The TV page: what the whole room watches. Nobody touches it. Framed by the OGS launcher (streamed,
// ?stream) or opened in a plain browser at "/". Boot payload from the Worker (#boot), then one socket.
import { isOGSCastAvailable } from "@open-game-system/cast-kit-core";
import { getOgsSessionSource, onOgsPause, reportOgsRoom, reportOgsSitting } from "@open-game-system/profile-kit";
import { useOgsSession } from "@open-game-system/profile-kit/react";
import { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { GAME } from "../config";
import { TvBootZ } from "../shared/boot";
import { type TvView, TvViewSchema, socketPath } from "../shared/protocol";
import { audioPause, initAudio } from "./audio";
import { type RoomClient, connect, setServerNow, useConnectionState, useView } from "./net";
import { sittingLabel } from "./tv/derive";
import { fixture, isFixtureName } from "./tv/fixtures";
import { TvScreen } from "./tv/Screen";

document.documentElement.classList.add("tv");

// Listen for the launcher from the first moment (it posts ogs:start as soon as the frame loads),
// and go silent whenever it parks the game.
getOgsSessionSource();
onOgsPause((paused) => audioPause.setPaused(paused));

function readBootJson(): unknown {
  const el = document.getElementById("boot");
  return el?.textContent ? JSON.parse(el.textContent) : null;
}

function useOgsReports(view: TvView, instanceId: string | null): void {
  useEffect(() => {
    if (instanceId) reportOgsRoom(view.code);
  }, [instanceId, view.code]);
  const label = sittingLabel(view);
  useEffect(() => {
    if (!instanceId) return;
    reportOgsSitting({ instanceId, appId: GAME.appId, status: label.status, title: label.title });
  }, [instanceId, label.status, label.title]);
}

function useAudioOnMount(): void {
  // ?stream (the cloud TV) starts sound at once; a plain browser unlocks on the first click/key.
  useEffect(() => initAudio(), []);
}

function LiveTv({ client }: { client: RoomClient<TvView> }) {
  const view = useView(client);
  const connection = useConnectionState(client);
  const session = useOgsSession();
  // undefined = still asking the launcher: keep the code hidden until we know it's a plain browser.
  const showJoin = session === null;
  const couch = useMemo(() => (session ? session.players.map((p) => p.name) : []), [session]);
  useOgsReports(view, session ? session.instanceId : null);
  useAudioOnMount();
  return <TvScreen view={view} showJoin={showJoin} couch={couch} connection={connection} />;
}

/** Dev only: `/tv.html?fixture=drawing` renders a fixture view (no #boot, so never on a Worker page). */
function FixtureTv({ name }: { name: string }) {
  const view = useMemo(() => (isFixtureName(name) ? fixture(name, Date.now()) : fixture("lobby", Date.now())), [name]);
  useAudioOnMount();
  return <TvScreen view={view} showJoin={!new URLSearchParams(location.search).has("ogs")} couch={[]} connection="connected" />;
}

function start(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Missing #root");
  const root = createRoot(rootEl);
  const raw = readBootJson();
  const params = new URLSearchParams(location.search);
  if (raw === null) {
    root.render(<FixtureTv name={params.get("fixture") ?? "lobby"} />);
    return;
  }
  const boot = TvBootZ.parse(raw);
  // Inside the OGS app this device is the phone that started the game, not the TV: join this room
  // (the app casts the TV page to the launcher). The streamed TV itself carries ?stream.
  if (isOGSCastAvailable() && !params.has("stream")) {
    location.replace(`/join/${boot.code}?tv=${encodeURIComponent(boot.id)}`);
    return;
  }
  setServerNow(boot.serverNow);
  const snapshot = TvViewSchema.parse(boot.snapshot);
  const client = connect(TvViewSchema, socketPath(boot.code, boot.id, boot.sig), snapshot);
  root.render(<LiveTv client={client} />);
}

start();
