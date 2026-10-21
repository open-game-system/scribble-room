// The whole TV: a fixed 1920×1080 stage scaled to the window, one screen per beat with a transition
// between them, sound cues derived from view diffs, and window.__focalRect() for the evidence rig.
import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { ConnectionState } from "@actor-kit/client";
import { playSfx, sfx, startLobbyMusic, stopLobbyMusic } from "../audio";
import { serverNow } from "../net";
import type { TvView } from "../../shared/protocol";
import { Board } from "./Board";
import { timerFraction } from "./derive";
import { diffEvents, soundFor, tickFor } from "./events";
import { Frame } from "./Frame";
import { Lobby } from "./Lobby";
import { Podium } from "./Podium";

export const STAGE = { w: 1920, h: 1080 } as const;
/** How long the reveal shows the word over the drawing before the scoreboard. */
export const REVEAL_WORD_MS = 3400;

/** Server time, re-read every `ms`. */
function useServerClock(ms: number): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Scale the stage to fit the window (letterboxed), so 1280×720 shows the same layout. */
function useStageScale(): number {
  const fit = () => Math.min(window.innerWidth / STAGE.w, window.innerHeight / STAGE.h);
  const [k, setK] = useState(fit);
  useEffect(() => {
    const on = () => setK(fit());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return k;
}

function useTvSounds(view: TvView, seconds: number): void {
  const prev = useRef<TvView | null>(null);
  const prevSeconds = useRef(seconds);
  useEffect(() => {
    const events = diffEvents(prev.current, view);
    prev.current = view;
    const reason = view.lastTurn?.reason ?? null;
    let correctPlayed = false;
    for (const e of events) {
      const name = soundFor(e, reason);
      if (!name) continue;
      // Several correct guesses in one frame: one chime, not a pile-up.
      if (name === "correct") {
        if (correctPlayed) continue;
        correctPlayed = true;
      }
      playSfx(name);
    }
  }, [view]);
  useEffect(() => {
    const s = tickFor(view.phase, prevSeconds.current, seconds);
    prevSeconds.current = seconds;
    if (s !== null) sfx.tick(s);
  }, [view.phase, seconds]);
  useEffect(() => {
    if (view.phase === "lobby") startLobbyMusic();
    else stopLobbyMusic();
  }, [view.phase]);
  useEffect(() => () => stopLobbyMusic(), []);
}

type FocalRect = { x: number; y: number; width: number; height: number } | null;

declare global {
  interface Window {
    __focalRect?: () => FocalRect;
  }
}

function installFocalRect(): void {
  window.__focalRect = () => {
    const el = document.querySelector("[data-focal]");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
}

type ScreenKey = "lobby" | "frame" | "board" | "podium";

function screenFor(view: TvView, now: number): ScreenKey {
  if (view.phase === "lobby") return "lobby";
  if (view.phase === "podium") return "podium";
  if (view.phase === "reveal" && view.lastTurn && now - view.startedAt >= REVEAL_WORD_MS) return "board";
  return "frame";
}

export function TvScreen({ view, showJoin, couch, connection }: { view: TvView; showJoin: boolean; couch: readonly string[]; connection: ConnectionState }) {
  const now = useServerClock(250);
  const seconds = view.endsAt ? Math.max(0, Math.ceil((view.endsAt - now) / 1000)) : 0;
  const fraction = timerFraction(view.endsAt, view.startedAt, now);
  const k = useStageScale();
  useTvSounds(view, seconds);
  useEffect(installFocalRect, []);
  const screen = screenFor(view, now);
  const stage: CSSProperties = {
    width: STAGE.w,
    height: STAGE.h,
    transform: `scale(${k})`,
    left: Math.max(0, (window.innerWidth - STAGE.w * k) / 2),
    top: Math.max(0, (window.innerHeight - STAGE.h * k) / 2),
  };
  return (
    <div className={`tv-stage paper screen-${screen}`} style={stage}>
      <div className="tv-screen" key={screen === "frame" ? `frame-${view.turn}` : screen}>
        {screen === "lobby" ? <Lobby view={view} showJoin={showJoin} couch={couch} /> : null}
        {screen === "frame" ? <Frame view={view} seconds={seconds} fraction={fraction} /> : null}
        {screen === "board" ? <Board view={view} /> : null}
        {screen === "podium" ? <Podium view={view} /> : null}
      </div>
      {connection === "connected" ? null : (
        <div className="tv-conn" role="status">
          {connection === "connecting" ? "Connecting…" : "Reconnecting…"}
        </div>
      )}
    </div>
  );
}
