/**
 * Renders each music mood offline and prints its loudness and its energy above 6 kHz (the harshness
 * rule), so levels are checked, not guessed:  pnpm exec tsx scripts/art-kit/measure-music.ts [seconds]
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const bars = Math.ceil(Number(process.argv[2] ?? 20) / 2.5);
const bundle = await build({ entryPoints: [resolve(here, "theme-entry.ts")], bundle: true, write: false, format: "iife", target: "es2020" });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><html><body></body></html>");
await page.addScriptTag({ content: bundle.outputFiles[0]?.text ?? "" });
const dir = mkdtempSync(join(tmpdir(), "sr-music-"));
const read = (wav: string, filter: string) => {
  const r = execFileSync("sh", ["-c", `ffmpeg -i "${wav}" -af "${filter}volumedetect" -f null - 2>&1 | grep -E "mean_volume|max_volume"`], { encoding: "utf8" });
  return r.replace(/\[Parsed_volumedetect_\d+[^\]]*\]\s*/g, "").replace(/\n/g, "  ").trim();
};
for (const [mood, intensity] of [["lobby", 0], ["picking", 0], ["drawing", 0], ["drawing", 1], ["reveal", 0], ["podium", 0]] as const) {
  const b64 = await page.evaluate(
    async ([m, n, i]) => {
      const fn: unknown = Reflect.get(window, "renderMood");
      if (typeof fn !== "function") throw new Error("renderMood missing");
      const r: unknown = await fn(m, n, i, false);
      return typeof r === "string" ? r : "";
    },
    [mood, mood === "reveal" ? 3 : bars, intensity] as const,
  );
  const wav = join(dir, `${mood}-${intensity}.wav`);
  writeFileSync(wav, Buffer.from(b64, "base64"));
  console.log(`${mood.padEnd(8)} i=${intensity}  all: ${read(wav, "")}   >6kHz: ${read(wav, "highpass=f=6000,highpass=f=6000,highpass=f=6000,highpass=f=6000,highpass=f=6000,highpass=f=6000,")}`);
}
rmSync(dir, { recursive: true });
await browser.close();
