// One classic turn end to end through the real pages: a TV and three phones in a browser. Join by name,
// start, pick, draw a stroke with the pointer, a wrong guess, a close guess (private notice), a correct
// guess ("got it"); the TV shows the stroke and the correct toast but never the word until the reveal.
import { type Browser, type Page, chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { closeGuess, noteReloads } from "./seam-kit";
import { BASE } from "./ws-client";

const browserP = chromium.launch();
afterAll(async () => (await browserP).close());

async function phone(browser: Browser, code: string, name: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: false })).newPage();
  await page.goto(`${BASE}/join/${code}`);
  await page.getByTestId("name-input").fill(name);
  await page.getByTestId("join").click();
  await screen(page, "lobby");
  return page;
}

const screen = (page: Page, name: string, timeout = 15_000) => page.locator(`.phone-app[data-screen-name="${name}"]`).waitFor({ timeout });

/** Non-background pixels on a canvas (sampled every 4th pixel). */
const inkOn = async (page: Page, selector: string) =>
  z.number().parse(
    await page.locator(selector).evaluate((el) => {
      if (!(el instanceof HTMLCanvasElement)) return -1;
      const ctx = el.getContext("2d");
      if (!ctx) return -1;
      const d = ctx.getImageData(0, 0, el.width, el.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 16) if ((d[i] ?? 255) < 200 || (d[i + 1] ?? 255) < 200 || (d[i + 2] ?? 255) < 200) n++;
      return n;
    }),
  );

/** True when the TV page's visible text has `word` as a whole word (any case). */
const tvSays = async (tv: Page, word: string) => {
  const text = await tv.locator("body").innerText();
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${esc}([^\\p{L}]|$)`, "iu").test(text);
};

async function guess(page: Page, text: string) {
  await page.getByTestId("guess-input").fill(text);
  await page.getByTestId("guess-send").click();
}

describe("one classic turn through the pages", () => {
  it("TV + 3 phones: pick, draw by pointer, wrong / close / right guesses, reveal", () =>
    noteReloads(async () => {
      const browser = await browserP;
      const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      await tv.goto(`${BASE}/`);
      const code = /\/tv\/([A-Z]{4})/.exec(tv.url())?.[1] ?? "";
      expect(code).toMatch(/^[A-Z]{4}$/);
      await tv.locator(".tv-lobby").waitFor({ timeout: 15_000 });

      const ana = await phone(browser, code, "Ana");
      const ben = await phone(browser, code, "Ben");
      const cal = await phone(browser, code, "Cal");
      await expect.poll(() => tv.locator(".tv-lobby .chip-name").allTextContents()).toEqual(["Ana", "Ben", "Cal"]);

      // Ana hosts and draws first.
      expect(await ben.getByTestId("start").count()).toBe(0);
      await ana.getByTestId("start").click();
      await screen(ana, "pick");
      await screen(ben, "choosing");
      await ana.getByTestId("choice-0").click();
      await screen(ana, "draw");
      const word = ((await ana.getByTestId("draw-word").textContent()) ?? "").trim();
      expect(word.length).toBeGreaterThan(1);
      await screen(ben, "guess");
      await screen(cal, "guess");
      expect(await tv.locator('canvas[aria-label="The drawing"]').isVisible()).toBe(true);
      expect(await inkOn(tv, 'canvas[aria-label="The drawing"]')).toBe(0);

      // A stroke drawn with the pointer reaches the TV and the guessers' mirrors.
      const pad = ana.getByTestId("draw-canvas");
      const box = await pad.boundingBox();
      if (!box) throw new Error("no draw canvas box");
      await ana.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
      await ana.mouse.down();
      for (let i = 1; i <= 20; i++) await ana.mouse.move(box.x + box.width * (0.2 + i * 0.03), box.y + box.height * (0.3 + i * 0.02));
      await ana.mouse.up();
      await expect.poll(() => inkOn(tv, 'canvas[aria-label="The drawing"]'), { timeout: 5000 }).toBeGreaterThan(50);
      await expect.poll(() => inkOn(ben, '[data-testid="mirror"] canvas'), { timeout: 5000 }).toBeGreaterThan(5);
      expect(await tvSays(tv, word)).toBe(false);

      // Wrong: public on the TV. Close: a private notice for Ben, nothing on the TV.
      await guess(ben, "xq nope");
      await expect.poll(() => tv.locator(".tv-feed-guess").allTextContents()).toEqual([expect.stringContaining("xq nope")]);
      await guess(ben, closeGuess(word));
      await ben.getByTestId("notice").waitFor({ timeout: 5000 });
      expect(await cal.getByTestId("notice").count()).toBe(0);
      expect(await tvSays(tv, closeGuess(word))).toBe(false);

      // Right: Ben sees "got it" and the word; the TV toasts Ben but never shows the word; Cal still doesn't know.
      await guess(ben, word.toUpperCase());
      await ben.getByTestId("got-it").waitFor({ timeout: 5000 });
      expect(await ben.getByTestId("got-it").textContent()).toContain(word);
      await expect.poll(() => tv.locator(".tv-feed-correct").allTextContents()).toEqual([expect.stringMatching(/Ben got it!\s*\+\d+/)]);
      expect(await tvSays(tv, word)).toBe(false);
      expect(await cal.getByTestId("got-it").count()).toBe(0);
      expect(await cal.locator("body").innerText()).not.toContain(word);

      // Cal gets it too: everyone has it, the reveal shows the word on the TV and the phones.
      await guess(cal, word);
      await screen(cal, "reveal", 10_000);
      await expect.poll(() => tv.locator(".tv-word-card").innerText(), { timeout: 10_000 }).toMatch(/\S/);
      expect((await tv.locator(".tv-word-card").innerText()).replace(/\s/g, "")).toBe(word.toUpperCase().replace(/\s/g, ""));
      await screen(ben, "reveal");
      expect(((await ben.getByTestId("reveal-word").textContent()) ?? "").toLowerCase()).toContain(word.toLowerCase());

      for (const p of [tv, ana, ben, cal]) await p.context().close();
    }), 90_000);
});
