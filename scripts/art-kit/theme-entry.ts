// Bundled by render.ts / measure-music.ts into a Playwright page: renders a music mood offline (the same
// graph and notes the live engine uses) to a 16-bit WAV, base64.
import { LOBBY_BARS, LOBBY_BAR_SECONDS, MUSIC_MOODS, type MusicMood } from "../../src/client/audio-notes";
import { buildGraph, createMoodBus, moodLevel, scheduleMood } from "../../src/client/audio";

async function renderMood(moodName: string, bars: number, intensity: number, fade: boolean): Promise<string> {
  const mood: MusicMood | undefined = MUSIC_MOODS.find((m) => m === moodName);
  if (!mood) throw new Error(`unknown mood ${moodName}`);
  const rate = 44100;
  const seconds = bars * LOBBY_BAR_SECONDS + 1.5;
  const c = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  const g = buildGraph(c);
  g.master.gain.setValueAtTime(1, 0);
  if (fade) {
    g.master.gain.setValueAtTime(1, seconds - 3);
    g.master.gain.linearRampToValueAtTime(0.0001, seconds);
  }
  g.music.gain.value = 1;
  const bus = createMoodBus(c, g.music);
  bus.gain.value = moodLevel(mood, intensity);
  scheduleMood(c, bus, g.noise, mood, 0.05, 0, bars, intensity);
  const buf = await c.startRendering();
  const ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o: number, s: string) => [...s].forEach((x, i) => out.setUint8(o + i, x.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + n * 4, true);
  str(8, "WAVE");
  str(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 2, true);
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * 4, true);
  out.setUint16(32, 4, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 2; k++) {
      const v = Math.max(-1, Math.min(1, ch[k]?.[i] ?? 0));
      out.setInt16(44 + i * 4 + k * 2, v * 0x7fff, true);
    }
  const bytes = new Uint8Array(out.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** theme.mp3: the lobby loop, then its first bar again to land on, faded out. */
const renderTheme = () => renderMood("lobby", LOBBY_BARS + 1, 0, true);

Reflect.set(window, "renderTheme", renderTheme);
Reflect.set(window, "renderMood", renderMood);
