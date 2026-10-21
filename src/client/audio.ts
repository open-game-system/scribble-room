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
  CROSSFADE_SECONDS,
  INTENSITY_LIFT,
  LOBBY_BAR_SECONDS,
  MOOD_LEVEL,
  MUSIC_LOWPASS_HZ,
  SFX,
  SFX_LOWPASS_HZ,
  clampIntensity,
  moodBar,
  soundLength,
  type MusicMood,
  SFX_ROOT,
  degreeFreq,
  clampVolume,
  tickNotes,
  type SfxName,
  type SoundEvent,
} from "./audio-notes";

export { MUSIC_MOODS, SFX_NAMES, type MusicMood, type SfxName } from "./audio-notes";

const STORE_KEY = `${GAME.storagePrefix}:audio`;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: AudioNode | null = null;
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

/** Two cascaded biquads (24 dB/oct) into `dest`; returns the input. */
function lowpass(c: BaseAudioContext, hz: number, dest: AudioNode): AudioNode {
  const a = c.createBiquadFilter();
  const b = c.createBiquadFilter();
  for (const f of [a, b]) {
    f.type = "lowpass";
    f.frequency.value = hz;
    f.Q.value = 0.6;
  }
  a.connect(b);
  b.connect(dest);
  return a;
}

/**
 * Builds the graph on any BaseAudioContext (the live one, or an OfflineAudioContext for theme.mp3):
 * sfx (low-passed) and music (duckable) buses into the master, then a gentle compressor.
 */
export function buildGraph(c: BaseAudioContext): { master: GainNode; sfx: AudioNode; music: GainNode; noise: AudioBuffer } {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 6;
  comp.ratio.value = 8;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  // A last low-pass after the compressor catches the edge its gain changes add (harshness rule).
  comp.connect(lowpass(c, SFX_LOWPASS_HZ, c.destination));
  const m = c.createGain();
  m.connect(comp);
  const sfxLp = lowpass(c, SFX_LOWPASS_HZ, m);
  const music = c.createGain();
  music.connect(m);
  const len = Math.floor(c.sampleRate * 1);
  const noise = c.createBuffer(1, len, c.sampleRate);
  const data = noise.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < len; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return { master: m, sfx: sfxLp, music, noise };
}

/** One mood's bus: its own gain (for crossfades and intensity) through the music low-pass. */
export function createMoodBus(c: BaseAudioContext, music: AudioNode): GainNode {
  const lp = lowpass(c, MUSIC_LOWPASS_HZ, music);
  const g = c.createGain();
  g.gain.value = 0;
  g.connect(lp);
  return g;
}

/** Bus level for a mood at an intensity. */
export function moodLevel(mood: MusicMood, intensity: number): number {
  return MOOD_LEVEL[mood] * (1 + INTENSITY_LIFT * clampIntensity(intensity));
}

/** Schedules `bars` bars of a mood from `t0` into `dest` (live, and the offline theme/measure renders). */
export function scheduleMood(
  c: BaseAudioContext,
  dest: AudioNode,
  noise: AudioBuffer,
  mood: MusicMood,
  t0: number,
  firstBar: number,
  bars: number,
  intensity = 0,
): void {
  for (let b = 0; b < bars; b++) scheduleEvents(c, dest, noise, moodBar(mood, firstBar + b, intensity), t0 + b * LOBBY_BAR_SECONDS);
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  setPlaybackSession();
  ctx = new AudioContext({ latencyHint: "interactive" });
  const g = buildGraph(ctx);
  master = g.master;
  sfxBus = g.sfx;
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

/** Duck the music ~3 dB under an event, not more (the bed should still be heard). */
function duck(seconds: number): void {
  if (!ctx || !musicBus) return;
  const now = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(now);
  musicBus.gain.setTargetAtTime(0.7, now, 0.03);
  musicBus.gain.setTargetAtTime(1, now + Math.min(1.5, seconds), 0.25);
}

function play(events: readonly SoundEvent[]): void {
  const c = canPlay();
  if (!c || !sfxBus || !noiseBuf) return;
  scheduleEvents(c, sfxBus, noiseBuf, events, c.currentTime + 0.005);
  const len = soundLength(events);
  if (len > 0.25) duck(len);
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

// ---------------------------------------------------------------- phase music

type MoodSession = { mood: MusicMood; bus: GainNode; bar: number; next: number };

let session: MoodSession | null = null;
let currentMood: MusicMood | null = null;
let intensity = 0;
let musicTimer: ReturnType<typeof setInterval> | null = null;

function fadeOut(s: MoodSession, c: BaseAudioContext): void {
  const now = c.currentTime;
  s.bus.gain.cancelScheduledValues(now);
  s.bus.gain.setValueAtTime(s.bus.gain.value, now);
  s.bus.gain.linearRampToValueAtTime(0, now + CROSSFADE_SECONDS);
  const bus = s.bus;
  // Notes already scheduled on it play out silently; drop the bus once they are done.
  setTimeout(() => bus.disconnect(), (CROSSFADE_SECONDS + 2) * 1000);
}

/** Opens the bus for the wanted mood once the context can play (after unlock / Continue). */
function ensureSession(c: AudioContext): MoodSession | null {
  if (!currentMood || !musicBus) return null;
  if (session && session.mood === currentMood) return session;
  if (session) fadeOut(session, c);
  const bus = createMoodBus(c, musicBus);
  const now = c.currentTime;
  bus.gain.setValueAtTime(0, now);
  bus.gain.linearRampToValueAtTime(moodLevel(currentMood, intensity), now + CROSSFADE_SECONDS);
  session = { mood: currentMood, bus, bar: 0, next: now + 0.05 };
  return session;
}

function pump(): void {
  const c = canPlay();
  if (!c || !noiseBuf) {
    // Parked, muted or locked: schedule nothing, and resync on return instead of bursting the backlog.
    if (session) session.next = 0;
    return;
  }
  const s = ensureSession(c);
  if (!s) return;
  if (s.next < c.currentTime) s.next = c.currentTime + 0.05;
  while (s.next < c.currentTime + 1.5) {
    scheduleEvents(c, s.bus, noiseBuf, moodBar(s.mood, s.bar, intensity), s.next);
    s.next += LOBBY_BAR_SECONDS;
    s.bar += 1;
  }
}

/**
 * The music for a game phase, crossfaded (~600 ms): "lobby" loop, "picking" soft pad, "drawing" quiet
 * pulsing bed, "reveal" sting then near-silence, "podium" fanfare then a light loop. null = silence.
 * Setting the same mood again does nothing (it never restarts a loop). Respects mute and audioPause.
 */
export function setMusicMood(mood: MusicMood | null): void {
  if (mood === currentMood) return;
  currentMood = mood;
  if (mood !== "drawing") intensity = 0;
  if (mood === null) {
    if (session && ctx) fadeOut(session, ctx);
    session = null;
    if (musicTimer !== null) clearInterval(musicTimer);
    musicTimer = null;
    return;
  }
  if (session && ctx) {
    fadeOut(session, ctx);
    session = null;
  }
  pump();
  if (musicTimer === null) musicTimer = setInterval(pump, 400);
}

export function getMusicMood(): MusicMood | null {
  return currentMood;
}

/** 0..1: lifts the drawing bed (busier percussion, a counter-line, +35% level). The TV raises it in the last 10 s. */
export function setMusicIntensity(value: number): void {
  intensity = clampIntensity(value);
  if (session && ctx) session.bus.gain.setTargetAtTime(moodLevel(session.mood, intensity), ctx.currentTime, 0.3);
}

export function startLobbyMusic(): void {
  setMusicMood("lobby");
}

export function stopLobbyMusic(): void {
  if (currentMood === "lobby") setMusicMood(null);
}
