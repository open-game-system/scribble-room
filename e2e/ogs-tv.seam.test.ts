// The TV page framed by a stand-in OGS TV launcher: it says ogs:ready, gets ogs:start, hides its room
// code and QR, names the couch, reports its room and sitting label, and goes silent while parked.
import { type Frame, type Page, chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { noteReloads } from "./seam-kit";
import { BASE, join } from "./ws-client";

const browserP = chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
afterAll(async () => (await browserP).close());

/** Remember every AudioContext the page makes, so the test can read its state. */
const TRACK_AUDIO = `
  window.__ctxs = [];
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(...a) { super(...a); window.__ctxs.push(this); }
  };
`;

const START = {
  type: "ogs:start",
  instanceId: "i-1",
  mode: "new",
  roster: [],
  token: "",
  players: [
    { id: "p1", handle: "sam", name: "Sam", avatar: "https://example.com/a.png" },
    { id: "p2", handle: "kit", name: "Kit", avatar: "https://example.com/b.png" },
  ],
};

const Msg = z.object({ type: z.string() }).passthrough();
const States = z.array(z.string());

async function newTvUrl(): Promise<{ url: string; code: string }> {
  const res = await fetch(`${BASE}/`, { redirect: "manual" });
  const url = new URL(res.headers.get("location") ?? "", BASE).toString();
  return { url, code: /\/tv\/([A-Z]{4})/.exec(url)?.[1] ?? "" };
}

/** The launcher: frames the streamed TV page and answers its ogs:ready with ogs:start (unless told not to). */
async function launcher(opts: { start?: boolean } = {}) {
  const { url, code } = await newTvUrl();
  const page = await (await browserP).newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(TRACK_AUDIO);
  const got: z.infer<typeof Msg>[] = [];
  await page.exposeFunction("onGameMessage", (m: unknown) => {
    const r = Msg.safeParse(m);
    if (r.success) got.push(r.data);
  });
  await page.setContent(
    `<script>
       addEventListener("message", (e) => {
         window.onGameMessage(e.data);
         if (${opts.start !== false} && e.data && e.data.type === "ogs:ready")
           document.getElementById("game").contentWindow.postMessage(${JSON.stringify(START)}, "*");
       });
     </script>
     <iframe id="game" allow="autoplay; fullscreen" src="${url}&stream=1" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>`,
  );
  const frame = await (await page.waitForSelector("#game")).contentFrame();
  if (!frame) throw new Error("no game frame");
  const post = (msg: object) =>
    page.evaluate((m) => {
      const el = document.getElementById("game");
      if (el instanceof HTMLIFrameElement) el.contentWindow?.postMessage(m, "*");
    }, msg);
  return { page, frame, code, got, post };
}

const states = async (f: Frame) => States.parse(await f.evaluate(() => Reflect.get(window, "__ctxs").map((c: AudioContext) => c.state)));
const titles = (got: z.infer<typeof Msg>[]) => got.filter((m) => m.type === "ogs:instance").map((m) => JSON.stringify(m));

async function closeAll(page: Page) {
  await page.context().close();
}

describe("the TV page inside the OGS launcher", () => {
  it("ogs:ready → ogs:start: no room code or QR, the couch named, room and sitting label reported", () =>
    noteReloads(async () => {
      const { page, frame, code, got } = await launcher();
      await expect.poll(() => got.map((m) => m.type)).toContain("ogs:ready");
      await frame.locator(".tv-lobby").waitFor({ timeout: 15_000 });
      await expect.poll(() => frame.locator(".tv-couch").textContent()).toMatch(/Sam, Kit/);
      expect(await frame.locator(".tv-join, .tv-qr, .tv-code").count()).toBe(0);
      expect(await frame.getByText(code, { exact: true }).count()).toBe(0);
      await expect.poll(() => got.find((m) => m.type === "ogs:room")).toEqual({ type: "ogs:room", room: code });
      await expect.poll(() => titles(got).join("\n")).toMatch(/"title":"Waiting for players"/);

      // A player joins: the label follows the room; a couch member who joined drops off the waiting line.
      const sam = await join(code, "Sam");
      await expect.poll(() => titles(got).join("\n")).toMatch(/"title":"Lobby · 1 player"/);
      await expect.poll(() => frame.locator(".tv-couch").textContent()).toBe("On the couch: Kit");
      await page.waitForTimeout(300);
      expect(await frame.locator(".tv-join, .tv-qr, .tv-code").count()).toBe(0);
      sam.close();
      await closeAll(page);
    }));

  it("in a plain browser it shows the room code and QR", () =>
    noteReloads(async () => {
      const { url, code } = await newTvUrl();
      const page = await (await browserP).newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(url);
      await expect.poll(() => page.locator(".tv-code").getAttribute("aria-label"), { timeout: 15_000 }).toBe(`Room code ${code.split("").join(" ")}`);
      expect(await page.locator(".tv-qr svg").count()).toBe(1);
      await closeAll(page);
    }));

  it("ogs:suspend silences every AudioContext; ogs:resume brings the sound back", () =>
    noteReloads(async () => {
      const { page, frame, post } = await launcher();
      await expect.poll(() => states(frame), { timeout: 15_000 }).toEqual(["running"]);
      await post({ type: "ogs:suspend" });
      await expect.poll(() => states(frame)).toEqual(["suspended"]);
      await page.waitForTimeout(800);
      expect(await states(frame)).toEqual(["suspended"]); // nothing (music, ticks) wakes it while parked
      await post({ type: "ogs:resume" });
      await expect.poll(() => states(frame)).toEqual(["running"]);
      await closeAll(page);
    }));
});
