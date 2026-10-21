// The pure half of the sound design (docs/art-style.md): every sound is a list of note events on one
// C major pentatonic scale, so any two sounds (and the lobby loop) harmonise when they overlap.
// src/client/audio.ts plays these with Web Audio; this file has no browser APIs so it unit-tests.

/** C major pentatonic, semitones above the root. */
export const PENTATONIC = [0, 2, 4, 7, 9] as const;
/** C5: the SFX register. The lobby loop sits an octave lower. */
export const SFX_ROOT = 72;
export const MUSIC_ROOT = 60;

export type Wave = "sine" | "triangle" | "square" | "sawtooth";

export type ToneEvent = {
  kind: "tone";
  /** Start, seconds after the sound is triggered. */
  at: number;
  dur: number;
  /** Scale degree: 0 = root, 5 = root an octave up, negatives go down. */
  degree: number;
  wave: Wave;
  /** Peak gain, 0..1 before the master. */
  gain: number;
  /** Optional glide to another degree over the note. */
  glideTo?: number;
  /** Override the register (defaults to SFX_ROOT). */
  root?: number;
};

export type NoiseEvent = {
  kind: "noise";
  at: number;
  dur: number;
  gain: number;
  /** Band-pass centre in Hz. */
  freq: number;
  /** Linear ramp of the centre frequency, for swooshes. */
  freqTo?: number;
};

export type SoundEvent = ToneEvent | NoiseEvent;

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** MIDI note for a pentatonic degree (any integer) above `root`. */
export function pentatonicMidi(degree: number, root = SFX_ROOT): number {
  const d = Math.trunc(degree);
  const octave = Math.floor(d / PENTATONIC.length);
  const idx = ((d % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length;
  return root + octave * 12 + (PENTATONIC[idx] ?? 0);
}

export function degreeFreq(degree: number, root = SFX_ROOT): number {
  return midiToFreq(pentatonicMidi(degree, root));
}

export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

const tone = (at: number, degree: number, dur: number, wave: Wave, gain: number, extra: Partial<ToneEvent> = {}): ToneEvent => ({
  kind: "tone",
  at,
  degree,
  dur,
  wave,
  gain,
  ...extra,
});
const noise = (at: number, dur: number, gain: number, freq: number, freqTo?: number): NoiseEvent =>
  freqTo === undefined ? { kind: "noise", at, dur, gain, freq } : { kind: "noise", at, dur, gain, freq, freqTo };

export const SFX_NAMES = [
  "tap",
  "pick",
  "strokeStart",
  "guessWrong",
  "guessClose",
  "correct",
  "allGuessed",
  "tick",
  "timeUp",
  "reveal",
  "roundStart",
  "podium",
  "join",
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

/** Rising tick in the last 10 seconds: 10 s left = degree 0, 1 s left = degree 9. */
export function tickDegree(secondsLeft: number): number {
  const s = Math.min(10, Math.max(1, Math.round(secondsLeft)));
  return 10 - s;
}

export function tickNotes(secondsLeft: number): SoundEvent[] {
  const d = tickDegree(secondsLeft);
  const g = secondsLeft <= 3 ? 0.3 : 0.2;
  return [tone(0, d, 0.07, "triangle", g), noise(0, 0.02, 0.08, 3200)];
}

/** Every SFX as note events. `tick` here is the 10-seconds-left tick; use tickNotes(s) for the others. */
export const SFX: Record<SfxName, SoundEvent[]> = {
  tap: [tone(0, 7, 0.05, "triangle", 0.18)],
  pick: [tone(0, 5, 0.08, "triangle", 0.2), tone(0.07, 7, 0.14, "triangle", 0.22)],
  strokeStart: [noise(0, 0.06, 0.05, 2400, 1800)],
  guessWrong: [tone(0, -3, 0.12, "sine", 0.12)],
  guessClose: [tone(0, 4, 0.1, "triangle", 0.18), tone(0.09, 3, 0.1, "triangle", 0.16), tone(0.18, 4, 0.16, "triangle", 0.18)],
  correct: [
    tone(0, 5, 0.09, "square", 0.1),
    tone(0, 5, 0.12, "triangle", 0.22),
    tone(0.07, 7, 0.12, "triangle", 0.22),
    tone(0.14, 9, 0.12, "triangle", 0.22),
    tone(0.21, 10, 0.4, "triangle", 0.26),
    tone(0.21, 12, 0.35, "sine", 0.12),
    noise(0.21, 0.18, 0.05, 6000, 9000),
  ],
  allGuessed: [
    tone(0, 0, 0.6, "triangle", 0.14),
    tone(0, 2, 0.6, "triangle", 0.14),
    tone(0, 3, 0.6, "triangle", 0.14),
    tone(0.12, 5, 0.12, "square", 0.08),
    tone(0.2, 7, 0.12, "square", 0.08),
    tone(0.28, 8, 0.12, "square", 0.08),
    tone(0.36, 10, 0.7, "triangle", 0.24),
    tone(0.36, 15, 0.6, "sine", 0.1),
    noise(0.36, 0.3, 0.05, 7000, 10000),
  ],
  tick: tickNotes(10),
  timeUp: [
    tone(0, 5, 0.16, "square", 0.1),
    tone(0.16, 3, 0.16, "square", 0.1),
    tone(0.32, 0, 0.5, "triangle", 0.22, { glideTo: -2 }),
    noise(0.32, 0.3, 0.06, 800, 300),
  ],
  reveal: [
    noise(0, 0.5, 0.06, 500, 4000),
    tone(0.5, 0, 0.7, "triangle", 0.2),
    tone(0.5, 2, 0.7, "triangle", 0.16),
    tone(0.5, 5, 0.7, "triangle", 0.18),
  ],
  roundStart: [tone(0, 0, 0.1, "triangle", 0.2), tone(0.1, 2, 0.1, "triangle", 0.2), tone(0.2, 5, 0.3, "triangle", 0.24)],
  podium: [
    tone(0, 0, 0.14, "square", 0.1),
    tone(0.15, 2, 0.14, "square", 0.1),
    tone(0.3, 3, 0.14, "square", 0.1),
    tone(0.45, 5, 0.5, "square", 0.12),
    tone(0.45, 5, 0.9, "triangle", 0.2),
    tone(0.75, 3, 0.14, "triangle", 0.18),
    tone(0.9, 5, 1.2, "triangle", 0.24),
    tone(0.9, 0, 1.2, "triangle", 0.14),
    tone(0.9, 2, 1.2, "triangle", 0.12),
    tone(0.9, 10, 1.0, "sine", 0.1),
    noise(0.9, 0.5, 0.05, 6000, 10000),
  ],
  join: [tone(0, 2, 0.07, "sine", 0.18), tone(0.06, 5, 0.12, "triangle", 0.18)],
};

/** Length of a sound in seconds. */
export function soundLength(events: readonly SoundEvent[]): number {
  return events.reduce((m, e) => Math.max(m, e.at + e.dur), 0);
}

// ---------------------------------------------------------------- lobby loop

export const LOBBY_BPM = 96;
export const LOBBY_BARS = 8;
const BEAT = 60 / LOBBY_BPM;
export const LOBBY_BAR_SECONDS = BEAT * 4;

/** Bass roots per bar, as degrees in the music register: C, A, F-ish (D), G — I vi ii V on the pentatonic. */
const BASS = [0, -2, 1, 3, 0, -2, 1, 3] as const;
/** A soft plucked melody: 8 eighth-note steps per bar, null = rest. Deterministic, loops every 8 bars. */
const MELODY: readonly (readonly (number | null)[])[] = [
  [5, null, 7, null, 9, 7, null, null],
  [8, null, 7, null, 5, null, null, null],
  [6, null, 7, 8, null, 7, null, null],
  [8, null, 9, null, 10, null, null, null],
  [10, null, 9, null, 7, 9, null, null],
  [8, null, 7, null, 5, null, 7, null],
  [6, null, 5, null, 6, 7, null, null],
  [8, null, 7, null, 5, null, null, null],
];

/** The lobby loop's notes for one bar (any bar index; it loops every LOBBY_BARS). Times are within the bar. */
export function lobbyBar(bar: number): ToneEvent[] {
  const i = ((Math.trunc(bar) % LOBBY_BARS) + LOBBY_BARS) % LOBBY_BARS;
  const root = BASS[i] ?? 0;
  const out: ToneEvent[] = [];
  // Bass: root on 1 and 3, the fifth-ish (root + 3 degrees) on the "and" of 2.
  out.push(tone(0, root - 5, BEAT * 1.4, "triangle", 0.22, { root: MUSIC_ROOT }));
  out.push(tone(BEAT * 1.5, root - 2, BEAT * 0.4, "triangle", 0.14, { root: MUSIC_ROOT }));
  out.push(tone(BEAT * 2, root - 5, BEAT * 1.4, "triangle", 0.2, { root: MUSIC_ROOT }));
  // Soft pad: two chord tones held, very quiet.
  out.push(tone(0, root, BEAT * 3.8, "sine", 0.05, { root: MUSIC_ROOT }));
  out.push(tone(0, root + 2, BEAT * 3.8, "sine", 0.04, { root: MUSIC_ROOT }));
  // Melody plucks.
  const steps = MELODY[i] ?? [];
  steps.forEach((d, s) => {
    if (d !== null) out.push(tone((s * BEAT) / 2, d, BEAT * 0.45, "triangle", 0.1, { root: MUSIC_ROOT }));
  });
  // Shaker-ish brush on the off-beats is noise, so it is added by the player, not here.
  return out;
}
