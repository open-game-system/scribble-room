/**
 * Renders Scribble Room's OGS art kit from code (docs/art-style.md, "Marker & Tape"): no AI, no paid
 * services. Scenes are React SVG/CSS in scenes.tsx, screenshotted with Playwright; theme.mp3 is the
 * synthesized lobby loop rendered offline and encoded with ffmpeg.
 *
 *   pnpm exec tsx scripts/art-kit/render.ts [out dir]
 *
 * Writes icon.png (1024), cover.jpg (1000x1500), logo.png (transparent, trimmed), hero-clean.jpg and
 * tv.jpg (1920x1080), KIT-SHEET.jpg (contact sheet) and theme.mp3 to assets/ogs-art/scribble-room/.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { tsImport } from "tsx/esm/api";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const out = resolve(process.argv[2] ?? resolve(root, "assets/ogs-art/scribble-room"));
mkdirSync(out, { recursive: true });

type Scene = { name: string; w: number; h: number; html: string; format: "png" | "jpg"; transparent?: boolean; selector?: string };
const mod: unknown = await tsImport("./scenes.tsx", { parentURL: import.meta.url, tsconfig: resolve(here, "tsconfig.json") });
const scenesFn: unknown = mod && typeof mod === "object" ? Reflect.get(mod, "scenes") : undefined;
if (typeof scenesFn !== "function") throw new Error("scenes.tsx must export scenes()");
const list: unknown = scenesFn();
if (!Array.isArray(list)) throw new Error("scenes() must return an array");
const scenes: Scene[] = list.filter(
  (s): s is Scene => !!s && typeof s === "object" && typeof Reflect.get(s, "name") === "string" && typeof Reflect.get(s, "html") === "string",
);

const tokens = readFileSync(resolve(root, "public/css/tokens.css"), "utf8");
const doc = (body: string, transparent = false) =>
  `<!doctype html><html class="tv"><head><meta charset="utf-8"><style>${tokens}
  html,body{margin:0;${transparent ? "background:transparent!important;" : ""}}</style></head><body>${body}</body></html>`;

const browser = await chromium.launch();
const files: Record<string, string> = {};
for (const s of scenes) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
  await page.setContent(doc(s.html, s.transparent), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const path = resolve(out, `${s.name}.${s.format}`);
  if (s.selector) {
    await page.locator(s.selector).screenshot({ path, omitBackground: true });
  } else {
    await page.screenshot({
      path,
      omitBackground: s.transparent === true,
      ...(s.format === "jpg" ? { type: "jpeg", quality: 92 } : {}),
    });
  }
  files[s.name] = path;
  await page.close();
  console.log(`wrote ${path}`);
}

// Contact sheet.
const thumb = (name: string, w: number) => {
  const p = files[name];
  if (!p) return "";
  const mime = p.endsWith(".png") ? "image/png" : "image/jpeg";
  const bg = name === "logo" ? "background:#fff3dc;" : "";
  return `<figure style="margin:0;display:flex;flex-direction:column;gap:10px"><img src="data:${mime};base64,${readFileSync(p).toString("base64")}" style="width:${w}px;border:5px solid #1b1a1f;box-shadow:8px 8px 0 #1b1a1f;${bg}"/><figcaption class="label">${name}</figcaption></figure>`;
};
const sheet = await browser.newPage({ viewport: { width: 2300, height: 1200 } });
await sheet.setContent(
  doc(`<div class="paper" style="width:2300px;padding:50px 60px 60px;display:grid;grid-template-columns:860px 860px 400px;gap:40px 50px;align-items:start">
    ${thumb("hero-clean", 860)}${thumb("tv", 860)}<div style="grid-row:span 2">${thumb("cover", 400)}</div>
    ${thumb("icon", 420)}${thumb("logo", 860)}
  </div>`),
  { waitUntil: "networkidle" },
);
await sheet.evaluate(() => document.fonts.ready);
await sheet.screenshot({ path: resolve(out, "KIT-SHEET.jpg"), type: "jpeg", quality: 88, fullPage: true });
console.log(`wrote ${resolve(out, "KIT-SHEET.jpg")}`);

// theme.mp3: the lobby loop, rendered offline in the browser, encoded by ffmpeg.
const bundle = await build({
  entryPoints: [resolve(here, "theme-entry.ts")],
  bundle: true,
  write: false,
  format: "iife",
  target: "es2020",
  alias: { "~": resolve(root, "src") },
});
const js = bundle.outputFiles[0]?.text ?? "";
const audioPage = await browser.newPage();
await audioPage.setContent("<!doctype html><html><body></body></html>");
await audioPage.addScriptTag({ content: js });
const b64 = await audioPage.evaluate(async () => {
  const fn: unknown = Reflect.get(window, "renderTheme");
  if (typeof fn !== "function") throw new Error("renderTheme missing");
  const r: unknown = await fn();
  return typeof r === "string" ? r : "";
});
const wav = resolve(out, "theme.wav");
writeFileSync(wav, Buffer.from(b64, "base64"));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "44100", "-b:a", "160k", resolve(out, "theme.mp3")]);
rmSync(wav);
console.log(`wrote ${resolve(out, "theme.mp3")}`);

await browser.close();
