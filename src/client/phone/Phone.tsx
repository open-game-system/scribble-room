// The phone after joining: picks the screen for the view, plays private notices and phase sounds,
// keeps the page inside the visible viewport (above the iOS keyboard).
import { type ReactElement, useEffect, useRef, useState } from "react";
import type { CanvasView, PlayerView } from "../../shared/protocol";
import { sfx } from "../audio";
import type { OutMsg } from "../net";
import { Podium, Reveal } from "./End";
import { Lobby } from "./Lobby";
import { type Notice, isFresh, toneOf } from "./notices";
import { type Screen, screenFor } from "./route";
import { Choosing, Draw, Guess, Pick } from "./Turn";
import { NoticeToast } from "./ui";

const NOTICE_MS = 2500;

/** Fresh private notices (seq changed since load), each shown for NOTICE_MS, with its sound. */
export function useNotice(notice: Notice | null, replay = false): Notice | null {
  const seen = useRef(replay ? -1 : (notice?.seq ?? -1));
  const [shown, setShown] = useState<Notice | null>(null);
  useEffect(() => {
    if (!isFresh(seen.current, notice)) return;
    seen.current = notice.seq;
    setShown(notice);
    const tone = toneOf(notice.kind);
    if (tone === "close") sfx.guessClose();
    else if (tone === "correct") sfx.correct();
    else sfx.guessWrong();
    const t = setTimeout(() => setShown((cur) => (cur?.seq === notice.seq ? null : cur)), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);
  return shown;
}

/** Sounds for the moments a phone should mark: my turn to pick, the reveal, the podium. */
function usePhaseSounds(screen: Screen): void {
  const prev = useRef(screen);
  useEffect(() => {
    if (prev.current === screen) return;
    prev.current = screen;
    if (screen === "pick") sfx.roundStart();
    else if (screen === "reveal") sfx.reveal();
    else if (screen === "podium") sfx.podium();
  }, [screen]);
}

/** Pins the app to the visual viewport (the part above the iOS keyboard) via --vvh / --vvt. */
export function useVisualViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const apply = () => {
      const h = vv ? vv.height : window.innerHeight;
      const top = vv ? vv.offsetTop : 0;
      root.style.setProperty("--vvh", `${Math.round(h)}px`);
      root.style.setProperty("--vvt", `${Math.round(top)}px`);
    };
    apply();
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);
}

type Props = {
  view: PlayerView;
  canvas: CanvasView;
  send: (m: OutMsg) => void;
  connected: boolean;
  tvUrl: string | null;
  /** Show the notice already in the first view (fixtures). */
  replayNotice?: boolean;
};

export function Phone({ view, canvas, send, connected, tvUrl, replayNotice = false }: Props) {
  const screen = screenFor(view);
  const notice = useNotice(view.me.notice, replayNotice);
  usePhaseSounds(screen);
  useVisualViewport();

  let body: ReactElement;
  switch (screen) {
    case "lobby":
      body = <Lobby view={view} send={send} tvUrl={tvUrl} />;
      break;
    case "pick":
      body = <Pick view={view} send={send} />;
      break;
    case "choosing":
      body = <Choosing view={view} send={send} />;
      break;
    case "draw":
      body = <Draw view={view} canvas={canvas} send={send} />;
      break;
    case "guess":
      body = <Guess view={view} canvas={canvas} send={send} notice={notice} />;
      break;
    case "reveal":
      body = <Reveal view={view} canvas={canvas} send={send} />;
      break;
    case "podium":
      body = <Podium view={view} send={send} />;
      break;
  }
  return (
    <div className={`phone-app screen-${screen}`} data-screen-name={screen}>
      {connected ? null : (
        <div className="reconnecting" role="status" data-testid="reconnecting">
          Reconnecting…
        </div>
      )}
      {body}
      {screen !== "guess" && notice && toneOf(notice.kind) === "info" ? (
        <div className="float-notice">
          <NoticeToast notice={notice} />
        </div>
      ) : null}
    </div>
  );
}
