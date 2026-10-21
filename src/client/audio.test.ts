import { describe, expect, it } from "vitest";
import {
  CROSSFADE_SECONDS,
  INTENSITY_LIFT,
  MOOD_BARS,
  MOOD_LEVEL,
  MUSIC_LOWPASS_HZ,
  MUSIC_MOODS,
  SFX_LOWPASS_HZ,
  clampIntensity,
  moodBar,
  LOBBY_BARS,
  LOBBY_BAR_SECONDS,
  MUSIC_ROOT,
  PENTATONIC,
  SFX,
  SFX_NAMES,
  SFX_ROOT,
  clampVolume,
  degreeFreq,
  lobbyBar,
  midiToFreq,
  pentatonicMidi,
  soundLength,
  tickDegree,
  tickNotes,
  type SoundEvent,
} from "./audio-notes";

const pitchClass = (midi: number, root: number) => (((midi - root) % 12) + 12) % 12;
const tones = (events: readonly SoundEvent[]) => events.flatMap((e) => (e.kind === "tone" ? [e] : []));
const meanDegree = (events: readonly SoundEvent[]) => {
  const t = tones(events);
  return t.reduce((s, e) => s + e.degree, 0) / t.length;
};

describe("note math", () => {
  it("maps MIDI to Hz (A4 = 440, octave doubles)", () => {
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(81)).toBeCloseTo(880, 6);
    expect(midiToFreq(60)).toBeCloseTo(261.626, 2);
  });

  it("walks the C major pentatonic across octaves, including negative degrees", () => {
    expect([0, 1, 2, 3, 4, 5].map((d) => pentatonicMidi(d, 60))).toEqual([60, 62, 64, 67, 69, 72]);
    expect([-1, -2, -5].map((d) => pentatonicMidi(d, 60))).toEqual([57, 55, 48]);
    expect(degreeFreq(5, 60)).toBeCloseTo(midiToFreq(72), 6);
  });

  it("only ever lands on pentatonic pitch classes", () => {
    for (let d = -12; d <= 20; d++) expect(PENTATONIC).toContain(pitchClass(pentatonicMidi(d, SFX_ROOT), SFX_ROOT));
  });

  it("clamps volume into 0..1", () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(0.4)).toBe(0.4);
    expect(clampVolume(Number.NaN)).toBe(0);
  });
});

describe("sfx", () => {
  it("defines every named sound, each non-empty, short and with sane gains", () => {
    for (const name of SFX_NAMES) {
      const ev = SFX[name];
      expect(ev.length, name).toBeGreaterThan(0);
      expect(soundLength(ev), name).toBeLessThanOrEqual(name === "podium" ? 2.5 : 1.3);
      for (const e of ev) {
        expect(e.gain, name).toBeGreaterThan(0);
        expect(e.gain, name).toBeLessThanOrEqual(0.3);
        expect(e.at, name).toBeGreaterThanOrEqual(0);
        if (e.kind === "tone") expect(Number.isInteger(e.degree), name).toBe(true);
      }
    }
  });

  it("keeps the stroke sound very soft and the wrong-guess sound soft and low", () => {
    for (const e of SFX.strokeStart) expect(e.gain).toBeLessThanOrEqual(0.06);
    expect(meanDegree(SFX.guessWrong)).toBeLessThan(0);
    for (const e of SFX.guessWrong) expect(e.gain).toBeLessThanOrEqual(0.15);
  });

  it("makes correct brighter and longer than a tap, and allGuessed bigger than correct", () => {
    expect(meanDegree(SFX.correct)).toBeGreaterThan(meanDegree(SFX.guessWrong) + 5);
    expect(soundLength(SFX.correct)).toBeGreaterThan(soundLength(SFX.tap));
    expect(SFX.allGuessed.length).toBeGreaterThan(SFX.correct.length);
    const top = (ev: readonly SoundEvent[]) => Math.max(...tones(ev).map((e) => e.degree));
    expect(top(SFX.allGuessed)).toBeGreaterThan(top(SFX.correct));
  });

  it("ends timeUp lower than it starts", () => {
    const t = tones(SFX.timeUp);
    expect(t[t.length - 1]?.glideTo ?? 99).toBeLessThan(t[0]?.degree ?? -99);
  });
});

describe("tick", () => {
  it("rises as time runs out and clamps outside 1..10", () => {
    expect(tickDegree(10)).toBe(0);
    expect(tickDegree(1)).toBe(9);
    expect(tickDegree(5)).toBeGreaterThan(tickDegree(6));
    expect(tickDegree(30)).toBe(0);
    expect(tickDegree(0)).toBe(9);
  });

  it("gets louder in the last 3 seconds", () => {
    const g = (s: number) => Math.max(...tones(tickNotes(s)).map((e) => e.gain));
    expect(g(2)).toBeGreaterThan(g(8));
  });
});

describe("lobby loop", () => {
  it("loops every LOBBY_BARS bars and stays inside the bar", () => {
    expect(lobbyBar(LOBBY_BARS)).toEqual(lobbyBar(0));
    expect(lobbyBar(-1)).toEqual(lobbyBar(LOBBY_BARS - 1));
    for (let b = 0; b < LOBBY_BARS; b++) {
      const bar = lobbyBar(b);
      expect(bar.length).toBeGreaterThan(4);
      for (const e of bar) {
        expect(e.at).toBeLessThan(LOBBY_BAR_SECONDS);
        expect(e.root).toBe(MUSIC_ROOT);
        expect(e.gain).toBeLessThanOrEqual(0.25);
      }
    }
  });

  it("is about 20 seconds per loop (theme.mp3 length)", () => {
    expect(LOBBY_BAR_SECONDS * LOBBY_BARS).toBeGreaterThan(18);
    expect(LOBBY_BAR_SECONDS * LOBBY_BARS).toBeLessThan(32);
  });
});

describe("phase music moods", () => {
  const all = (mood: (typeof MUSIC_MOODS)[number], i = 0) => Array.from({ length: 16 }, (_, b) => moodBar(mood, b, i));
  const avgGain = (bars: SoundEvent[][]) => {
    const ev = bars.flat();
    return ev.reduce((s, e) => s + e.gain * e.dur, 0);
  };

  it("defines every mood with notes inside the bar and sane gains", () => {
    for (const mood of MUSIC_MOODS) {
      for (const bar of all(mood)) {
        expect(bar.length, mood).toBeGreaterThan(0);
        for (const e of bar) {
          expect(e.at, mood).toBeGreaterThanOrEqual(0);
          expect(e.at, mood).toBeLessThan(LOBBY_BAR_SECONDS);
          expect(e.gain, mood).toBeGreaterThan(0);
          expect(e.gain, mood).toBeLessThanOrEqual(0.3);
          if (e.kind === "tone") expect(Number.isInteger(e.degree), mood).toBe(true);
          if (e.kind === "noise") expect(Math.max(e.freq, e.freqTo ?? 0), mood).toBeLessThanOrEqual(MUSIC_LOWPASS_HZ);
        }
      }
    }
  });

  it("loops the looping moods", () => {
    expect(moodBar("drawing", MOOD_BARS.drawing)).toEqual(moodBar("drawing", 0));
    expect(moodBar("picking", MOOD_BARS.picking + 3)).toEqual(moodBar("picking", 3));
    expect(moodBar("lobby", LOBBY_BARS + 2)).toEqual(moodBar("lobby", 2));
    // Podium: the fanfare once, then the loop (bar 1 == bar 1 + 8).
    expect(moodBar("podium", 1 + LOBBY_BARS)).toEqual(moodBar("podium", 1));
    expect(moodBar("podium", LOBBY_BARS)).not.toEqual(moodBar("podium", 0));
  });

  it("opens podium with the fanfare and reveal with a sting that then goes quiet", () => {
    expect(moodBar("podium", 0)).toEqual(SFX.podium);
    const sting = Math.max(...moodBar("reveal", 0).map((e) => e.gain));
    const after = Math.max(...moodBar("reveal", 1).map((e) => e.gain));
    expect(sting).toBeGreaterThan(after * 3);
    expect(moodBar("reveal", 5)).toEqual(moodBar("reveal", 1));
  });

  it("keeps picking a held pad: few, long, unpercussive notes", () => {
    for (const bar of all("picking")) {
      expect(bar.every((e) => e.kind === "tone")).toBe(true);
      expect(bar.length).toBeLessThanOrEqual(5);
      expect(Math.max(...bar.map((e) => e.dur))).toBeGreaterThan(LOBBY_BAR_SECONDS);
    }
  });

  it("gives drawing pencil-scratch percussion and a pulse on every beat", () => {
    const bar = moodBar("drawing", 0);
    expect(bar.filter((e) => e.kind === "noise").length).toBeGreaterThanOrEqual(8);
    const beats = new Set(bar.filter((e) => e.kind === "tone" && e.degree < 0).map((e) => e.at.toFixed(3)));
    expect(beats.size).toBe(4);
  });

  it("lifts drawing with intensity, monotonically, and clamps it", () => {
    const e0 = avgGain(all("drawing", 0));
    const e5 = avgGain(all("drawing", 0.5));
    const e1 = avgGain(all("drawing", 1));
    expect(e5).toBeGreaterThan(e0);
    expect(e1).toBeGreaterThan(e5);
    expect(moodBar("drawing", 0, 7)).toEqual(moodBar("drawing", 0, 1));
    expect(moodBar("drawing", 0, -3)).toEqual(moodBar("drawing", 0, 0));
    expect(clampIntensity(2)).toBe(1);
    expect(INTENSITY_LIFT).toBeGreaterThan(0);
    expect(INTENSITY_LIFT).toBeLessThan(0.6);
  });

  it("ignores intensity outside drawing", () => {
    expect(moodBar("lobby", 3, 1)).toEqual(moodBar("lobby", 3, 0));
    expect(moodBar("picking", 3, 1)).toEqual(moodBar("picking", 3, 0));
  });

  it("keeps the drawing bed the quietest loop and crossfades in about 600 ms", () => {
    // Per-bar note energy x bus level: drawing must sit under lobby and podium.
    const energy = (m: (typeof MUSIC_MOODS)[number]) => avgGain(all(m)) * MOOD_LEVEL[m];
    expect(energy("drawing")).toBeLessThan(energy("lobby"));
    expect(energy("drawing")).toBeLessThan(energy("podium"));
    expect(CROSSFADE_SECONDS).toBeGreaterThanOrEqual(0.4);
    expect(CROSSFADE_SECONDS).toBeLessThanOrEqual(0.8);
    expect(MUSIC_LOWPASS_HZ).toBeLessThanOrEqual(5000);
    expect(SFX_LOWPASS_HZ).toBeLessThanOrEqual(7000);
  });

  it("keeps SFX sparkle under the effects low-pass", () => {
    for (const name of SFX_NAMES)
      for (const e of SFX[name]) if (e.kind === "noise") expect(Math.max(e.freq, e.freqTo ?? 0), name).toBeLessThanOrEqual(SFX_LOWPASS_HZ);
  });
});
