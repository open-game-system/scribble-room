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
    noise(0.21, 0.18, 0.04, 3800, 5200),
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
    noise(0.36, 0.3, 0.04, 3600, 5000),
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
    noise(0.9, 0.5, 0.04, 3600, 5000),
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
  return out;
}

// ---------------------------------------------------------------- phase music (moods)

export const MUSIC_MOODS = ["lobby", "picking", "drawing", "reveal", "podium"] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

/**
 * Bus level per mood (before the master), set by measuring with scripts/art-kit/measure-music.ts.
 * Rendered at master 1.0: lobby -19, picking -20, drawing -23 (-22 at full intensity), reveal -23,
 * podium -20 dBFS average; nothing above 6 kHz louder than -35 dB. At the default volume (0.8) live
 * playback is ~2 dB lower, so the drawing bed sits near -24 dBFS.
 */
export const MOOD_LEVEL: Record<MusicMood, number> = {
  lobby: 2.6,
  picking: 2.0,
  drawing: 3.4,
  reveal: 2.6,
  podium: 3.0,
};
/** Low-pass on every music bus (the harshness rule: beds stay under ~5 kHz). */
export const MUSIC_LOWPASS_HZ = 5000;
/** Low-pass on the SFX path. */
export const SFX_LOWPASS_HZ = 6500;
export const CROSSFADE_SECONDS = 0.6;
/** Bus gain multiplier at full intensity (drawing's last 10 s). */
export const INTENSITY_LIFT = 0.35;

export function clampIntensity(i: number): number {
  return clampVolume(i);
}

/** Brushed off-beats (lobby). */
function brushes(gain: number): NoiseEvent[] {
  return [0, 1, 2, 3].map((k) => noise(k * BEAT + BEAT / 2, 0.05, gain, 4200));
}

/** Picking: a soft held pad, two bars per chord, no rhythm. */
const PICK_CHORDS = [
  [0, 2, 4],
  [-2, 0, 2],
  [1, 3, 5],
  [0, 2, 4],
] as const;
function pickingBar(bar: number): SoundEvent[] {
  const chord = PICK_CHORDS[Math.floor(bar / 2) % PICK_CHORDS.length] ?? PICK_CHORDS[0];
  const out: SoundEvent[] = chord.map((d, k) => tone(0, d, BEAT * 4.1, "sine", k === 0 ? 0.09 : 0.06, { root: MUSIC_ROOT }));
  out.push(tone(0, (chord[0] ?? 0) - 5, BEAT * 4.1, "triangle", 0.06, { root: MUSIC_ROOT }));
  if (bar % 2 === 1) out.push(tone(BEAT * 2, (chord[2] ?? 4) + 5, BEAT * 1.5, "sine", 0.03, { root: MUSIC_ROOT }));
  return out;
}

/** Drawing: a light pulsing bed. Sparse plucks, a soft bass pulse and pencil-scratch percussion. */
const DRAW_BASS = [0, 0, -2, -2, 1, 1, 3, 3] as const;
const DRAW_PLUCKS: readonly (readonly (number | null)[])[] = [
  [5, null, null, 7, null, null, 9, null],
  [null, null, 7, null, null, 5, null, null],
  [3, null, null, 5, null, null, 7, null],
  [null, null, 5, null, 3, null, null, null],
  [6, null, null, 8, null, null, 10, null],
  [null, null, 8, null, null, 6, null, null],
  [8, null, null, 10, null, null, 8, null],
  [null, null, 7, null, 5, null, null, null],
];
function drawingBar(bar: number, intensity: number): SoundEvent[] {
  const i = bar % LOBBY_BARS;
  const root = DRAW_BASS[i] ?? 0;
  const lift = 1 + intensity;
  const out: SoundEvent[] = [];
  // Bass pulse on every beat, accent on 1.
  for (let b = 0; b < 4; b++) out.push(tone(b * BEAT, root - 5, BEAT * 0.5, "triangle", b === 0 ? 0.16 : 0.1, { root: MUSIC_ROOT }));
  // Plucks.
  (DRAW_PLUCKS[i] ?? []).forEach((d, s) => {
    if (d !== null) out.push(tone((s * BEAT) / 2, d, BEAT * 0.4, "triangle", 0.07, { root: MUSIC_ROOT }));
  });
  // Pencil scratches: short band-passed noise on the eighths, a longer scritch on the "and" of 4.
  for (let s = 0; s < 8; s++) {
    const g = (s % 2 === 1 ? 0.03 : 0.018) * lift;
    out.push(noise((s * BEAT) / 2, 0.045, Math.min(0.08, g), 2600, 2000));
  }
  out.push(noise(BEAT * 3.5, 0.16, Math.min(0.08, 0.03 * lift), 1800, 3000));
  // Intensity: sixteenth-note ticks and a higher counter-line, both fading in with intensity.
  if (intensity > 0.05) {
    for (let s = 0; s < 16; s++) {
      if (s % 2 === 1) out.push(noise((s * BEAT) / 4, 0.03, 0.022 * intensity, 2800));
    }
    out.push(tone(BEAT * 2, root + 7, BEAT * 0.3, "triangle", 0.06 * intensity, { root: MUSIC_ROOT }));
    out.push(tone(BEAT * 3, root + 9, BEAT * 0.3, "triangle", 0.06 * intensity, { root: MUSIC_ROOT }));
  }
  return out;
}

/** Reveal: a short sting on bar 0, then a very quiet held chord. */
function revealBar(bar: number): SoundEvent[] {
  if (bar === 0)
    return [
      tone(0, 0, BEAT * 2, "triangle", 0.18, { root: MUSIC_ROOT }),
      tone(0, 2, BEAT * 2, "triangle", 0.14, { root: MUSIC_ROOT }),
      tone(0, 4, BEAT * 2, "triangle", 0.14, { root: MUSIC_ROOT }),
      tone(0.12, 7, BEAT * 1.5, "triangle", 0.12, { root: MUSIC_ROOT }),
      tone(0, -5, BEAT * 2.5, "triangle", 0.16, { root: MUSIC_ROOT }),
    ];
  return [
    tone(0, 0, BEAT * 4.1, "sine", 0.04, { root: MUSIC_ROOT }),
    tone(0, 4, BEAT * 4.1, "sine", 0.03, { root: MUSIC_ROOT }),
  ];
}

/** Podium: the fanfare on bar 0, then a light, brighter version of the lobby loop. */
function podiumBar(bar: number): SoundEvent[] {
  if (bar === 0) return [...SFX.podium];
  const loop: SoundEvent[] = lobbyBar(bar - 1)
    .filter((e) => e.wave === "triangle")
    .map((e) => ({ ...e, gain: e.gain * 0.8 }));
  return [...loop, ...brushes(0.02)];
}

/** Loop length in bars per mood (one-shot intros on bar 0 do not repeat). */
export const MOOD_BARS: Record<MusicMood, number> = { lobby: LOBBY_BARS, picking: 8, drawing: LOBBY_BARS, reveal: 1, podium: LOBBY_BARS };

/**
 * The notes for bar `bar` (0 = the bar the mood started) of a mood, at `intensity` 0..1.
 * Times are within the bar (LOBBY_BAR_SECONDS long).
 */
export function moodBar(mood: MusicMood, bar: number, intensity = 0): SoundEvent[] {
  const b = Math.max(0, Math.trunc(bar));
  const k = clampIntensity(intensity);
  switch (mood) {
    case "lobby":
      return [...lobbyBar(b), ...brushes(0.025)];
    case "picking":
      return pickingBar(b % MOOD_BARS.picking);
    case "drawing":
      return drawingBar(b, k);
    case "reveal":
      return revealBar(b);
    case "podium":
      return podiumBar(b === 0 ? 0 : ((b - 1) % LOBBY_BARS) + 1);
  }
}
