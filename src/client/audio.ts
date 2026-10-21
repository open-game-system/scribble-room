// Scribble Room's synthesized sound (no files): plays the note events from ./audio-notes on one shared
// AudioContext. Usage:
//   initAudio()                     once per page (TV: starts at once when the URL has ?stream; phones: on first tap)
//   sfx.correct(); sfx.tick(secondsLeft)
//   startLobbyMusic() / stopLobbyMusic()
//   setMasterVolume(0..1), setMuted(bool)
//   onOgsPause((p) => audioPause.setPaused(p))   (TV page: the OGS launcher parks the game)
import { GAME } from "../config";
import { createAudioPause } from "./audio-pause";
import {
  LOBBY_BAR_SECONDS,
  SFX,
  SFX_ROOT,
  degreeFreq,
  clampVolume,
  lobbyBar,
  tickNotes,
  type SfxName,
  type SoundEvent,
} from "./audio-notes";

export { SFX_NAMES, type SfxName } from "./audio-notes";

const STORE_KEY = `${GAME.storagePrefix}:audio`;
const MUSIC_LEVEL = 0.45;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let volume = 0.8;
let muted = false;

export const audioPause = createAudioPause(() => ctx);

function loadPrefs(): void {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const v: unknown = Reflect.get(parsed, "volume");
      const m: unknown = Reflect.get(parsed, "muted");
      if (typeof v === "number") volume = clampVolume(v);
      if (typeof m === "boolean") muted = m;
    }
  } catch {
    /* private mode or bad JSON: keep defaults */
  }
}

function savePrefs(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ volume, muted }));
  } catch {
    /* ignore */
  }
}

/** iOS 17+: "playback" makes Web Audio ignore the ring/silent switch. Must run before the context exists. */
function setPlaybackSession(): void {
  if (typeof navigator === "undefined") return;
  const session: unknown = Reflect.get(navigator, "audioSession");
  if (session && typeof session === "object" && "type" in session) {
    try {
      Reflect.set(session, "type", "playback");
    } catch {
      /* ignore */
    }
  }
}

function applyMaster(): void {
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
}

/** Builds the graph on any BaseAudioContext (the live one, or an OfflineAudioContext for theme.mp3). */
export function buildGraph(c: BaseAudioContext): { master: GainNode; music: GainNode; noise: AudioBuffer } {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.connect(c.destination);
  const m = c.createGain();
  m.connect(comp);
  const music = c.createGain();
  music.gain.value = MUSIC_LEVEL;
  music.connect(m);
  const len = Math.floor(c.sampleRate * 1);
  const noise = c.createBuffer(1, len, c.sampleRate);
  const data = noise.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < len; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return { master: m, music, noise };
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  setPlaybackSession();
  ctx = new AudioContext({ latencyHint: "interactive" });
  const g = buildGraph(ctx);
  master = g.master;
  musicBus = g.music;
  noiseBuf = g.noise;
  applyMaster();
  return ctx;
}

/** Schedules note events at time `t0` into `dest`. Works on live and offline contexts. */
export function scheduleEvents(c: BaseAudioContext, dest: AudioNode, noise: AudioBuffer, events: readonly SoundEvent[], t0: number): void {
  for (const e of events) {
    const start = t0 + e.at;
    const end = start + e.dur;
    const env = c.createGain();
    env.connect(dest);
    if (e.kind === "tone") {
      const osc = c.createOscillator();
      osc.type = e.wave;
      const root = e.root ?? SFX_ROOT;
      osc.frequency.setValueAtTime(degreeFreq(e.degree, root), start);
      if (e.glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(degreeFreq(e.glideTo, root), end);
      const attack = Math.min(0.012, e.dur / 4);
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(e.gain, start + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(env);
      osc.start(start);
      osc.stop(end + 0.02);
    } else {
      const src = c.createBufferSource();
      src.buffer = noise;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(e.freq, start);
      if (e.freqTo !== undefined) bp.frequency.linearRampToValueAtTime(e.freqTo, end);
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(e.gain, start + Math.min(0.01, e.dur / 4));
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      src.connect(bp);
      bp.connect(env);
      src.start(start, Math.random() * 0.4);
      src.stop(end + 0.02);
    }
  }
}

function canPlay(): AudioContext | null {
  if (muted || audioPause.paused()) return null;
  if (!ctx || ctx.state !== "running") return null;
  return ctx;
}

function play(events: readonly SoundEvent[]): void {
  const c = canPlay();
  if (!c || !master || !noiseBuf) return;
  scheduleEvents(c, master, noiseBuf, events, c.currentTime + 0.005);
}

let lastStroke = 0;

export function playSfx(name: SfxName): void {
  if (name === "strokeStart") {
    const now = performance.now();
    if (now - lastStroke < 120) return;
    lastStroke = now;
  }
  play(SFX[name]);
}

/** Named SFX. `tick` takes the seconds left (10..1) so it rises toward the buzzer. */
export const sfx = {
  tap: () => playSfx("tap"),
  pick: () => playSfx("pick"),
  strokeStart: () => playSfx("strokeStart"),
  guessWrong: () => playSfx("guessWrong"),
  guessClose: () => playSfx("guessClose"),
  correct: () => playSfx("correct"),
  allGuessed: () => playSfx("allGuessed"),
  tick: (secondsLeft = 10) => play(tickNotes(secondsLeft)),
  timeUp: () => playSfx("timeUp"),
  reveal: () => playSfx("reveal"),
  roundStart: () => playSfx("roundStart"),
  podium: () => playSfx("podium"),
  join: () => playSfx("join"),
} as const;

// ---------------------------------------------------------------- unlock / init

function resumeIfAllowed(c: AudioContext): void {
  if (!audioPause.unlocked(c)) return;
  if (c.state !== "running") void c.resume();
}

let unlockInstalled = false;
const UNLOCK_EVENTS = ["pointerdown", "touchend", "keydown"] as const;

function onGesture(): void {
  const c = ensureContext();
  if (!c) return;
  // A one-sample silent buffer started inside the gesture is what actually unlocks iOS.
  const buf = c.createBuffer(1, 1, c.sampleRate);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start();
  resumeIfAllowed(c);
  if (c.state === "running" || audioPause.paused()) {
    for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, onGesture, true);
    unlockInstalled = false;
  }
}

export type InitAudioOptions = {
  /** Start sound now without a gesture (the cloud-streamed TV). Defaults to `?stream` in the URL. */
  stream?: boolean;
};

/** Call once on mount. Safe to call again. */
export function initAudio(opts: InitAudioOptions = {}): void {
  if (typeof window === "undefined") return;
  loadPrefs();
  const stream = opts.stream ?? new URLSearchParams(window.location.search).has("stream");
  if (stream) {
    const c = ensureContext();
    if (c) resumeIfAllowed(c);
  }
  if (!unlockInstalled) {
    unlockInstalled = true;
    for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, onGesture, { capture: true, passive: true });
  }
}

/** True once sound can actually play. */
export function audioReady(): boolean {
  return ctx?.state === "running" && !audioPause.paused();
}

// ---------------------------------------------------------------- volume

export function setMasterVolume(v: number): void {
  volume = clampVolume(v);
  savePrefs();
  applyMaster();
}
export function getMasterVolume(): number {
  return volume;
}
export function setMuted(m: boolean): void {
  muted = m;
  savePrefs();
  applyMaster();
}
export function isMuted(): boolean {
  return muted;
}

// ---------------------------------------------------------------- lobby music

/** Schedules `bars` bars of the lobby loop from `t0` (used live and by the theme.mp3 renderer). */
export function scheduleLobby(c: BaseAudioContext, dest: AudioNode, noise: AudioBuffer, t0: number, firstBar: number, bars: number): void {
  for (let b = 0; b < bars; b++) {
    const start = t0 + b * LOBBY_BAR_SECONDS;
    scheduleEvents(c, dest, noise, lobbyBar(firstBar + b), start);
    // Brushed off-beats.
    const beat = LOBBY_BAR_SECONDS / 4;
    scheduleEvents(
      c,
      dest,
      noise,
      [0, 1, 2, 3].map((k): SoundEvent => ({ kind: "noise", at: k * beat + beat / 2, dur: 0.05, gain: 0.025, freq: 7000 })),
      start,
    );
  }
}

let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicNext = 0;
let musicBar = 0;

export function startLobbyMusic(): void {
  if (musicTimer !== null) return;
  if (ctx && musicBus) {
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(MUSIC_LEVEL, ctx.currentTime);
  }
  musicBar = 0;
  musicNext = 0;
  const pump = () => {
    const c = canPlay();
    if (!c || !musicBus || !noiseBuf) {
      musicNext = 0; // resync after a pause/unlock instead of bursting the backlog
      return;
    }
    if (musicNext < c.currentTime) musicNext = c.currentTime + 0.1;
    while (musicNext < c.currentTime + 1.5) {
      scheduleLobby(c, musicBus, noiseBuf, musicNext, musicBar, 1);
      musicNext += LOBBY_BAR_SECONDS;
      musicBar += 1;
    }
  };
  pump();
  musicTimer = setInterval(pump, 400);
}

export function stopLobbyMusic(): void {
  if (musicTimer !== null) clearInterval(musicTimer);
  musicTimer = null;
  // Fade out what is already scheduled.
  if (ctx && musicBus) {
    const now = ctx.currentTime;
    musicBus.gain.setTargetAtTime(0, now, 0.15);
    musicBus.gain.setTargetAtTime(MUSIC_LEVEL, now + 2, 0.01);
  }
}
