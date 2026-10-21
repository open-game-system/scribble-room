import { describe, expect, it } from "vitest";
import {
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
