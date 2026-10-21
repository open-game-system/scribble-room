// The phone page inside a fake OGS app WebView (app bridge + a game token signed by the seam key set):
// no name form, seated under the OGS profile, the TV page declared to the app for casting, the sitting
// label reported; an untrusted token never earns an OGS seat; a plain browser still gets the name form.
import { type Page, chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { gameClaims } from "../src/test/ogsTestKeys";
import { ogsSeamKey } from "./ogs-jwks";
import { noteReloads, seat } from "./seam-kit";
import { BASE, openTv } from "./ws-client";

const browserP = chromium.launch();
afterAll(async () => (await browserP).close());

const CAST = {
  isAvailable: true,
  devices: [],
  session: { status: "disconnected", deviceId: null, deviceName: null, sessionId: null, streamSessionId: null },
  error: null,
  viewUrl: null,
};

/** The OGS app's WebView: answers BRIDGE_READY with each store's STATE_INIT, records what the page sends. */
const fakeWebView = (stores: Record<string, unknown>) => `
  window.__ogsSent = [];
  window.ReactNativeWebView = {
    postMessage(raw) {
      const msg = JSON.parse(raw);
      window.__ogsSent.push(msg);
      if (msg.type === "BRIDGE_READY") {
        setTimeout(() => {
          for (const [storeKey, data] of Object.entries(${JSON.stringify(stores)}))
            window.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "STATE_INIT", storeKey, data }) }));
        }, 50);
      }
    },
  };
  new MutationObserver(() => {
    if (document.querySelector('[data-testid="name-input"]')) window.__sawNameForm = true;
  }).observe(document, { childList: true, subtree: true });
`;

const SentZ = z.array(
  z
    .object({
      type: z.string(),
      event: z.object({ type: z.string(), url: z.string().optional(), report: z.object({ title: z.string() }).passthrough().optional() }).passthrough().optional(),
    })
    .passthrough(),
);
const sent = async (page: Page) => SentZ.parse(await page.evaluate(() => Reflect.get(window, "__ogsSent")));
const viewUrl = async (page: Page) => (await sent(page)).find((m) => m.event?.type === "SET_VIEW_URL")?.event?.url ?? "";
const reportTitles = async (page: Page) => (await sent(page)).flatMap((m) => (m.event?.type === "INSTANCE_REPORT" && m.event.report ? [m.event.report.title] : []));

async function inOgs(token: string, path: string, who = { id: "p1", handle: "sam", name: "Sam" }): Promise<Page> {
  const ctx = await (await browserP).newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(
    fakeWebView({
      cast: CAST,
      ogs: { reported: [] },
      profile: { status: "ready", profile: { ...who, avatar: gameClaims("scribble-room", who).avatar, token } },
    }),
  );
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`);
  return page;
}

const SAM = { id: "p1", handle: "sam", name: "Sam" };
const sign = async (claims: object) => (await ogsSeamKey()).sign(claims);
const codeOf = (page: Page) => new URL(page.url()).pathname.split("/")[2] ?? "";

describe("the phone page inside the OGS app", () => {
  it("/host: no name form, seated as the OGS profile, hosts, declares the room's TV page with &stream=1, reports its label", () =>
    noteReloads(async () => {
      const page = await inOgs(await sign(gameClaims("scribble-room", SAM)), "/host");
      await page.locator('.phone-app[data-screen-name="lobby"]').waitFor({ timeout: 15_000 });
      expect(await page.evaluate(() => Reflect.get(window, "__sawNameForm") === true)).toBe(false);
      const code = codeOf(page);
      const tvId = new URL(page.url()).searchParams.get("tv") ?? "";
      expect(tvId).toMatch(/^tv-/);
      await expect.poll(() => page.locator(".chip.is-me .chip-name").textContent()).toBe("Sam (you)");
      expect(await page.getByTestId("start").count()).toBe(1); // the start phone hosts

      const tvUrl = new URL(`/tv/${code}?k=${tvId}`, BASE).toString();
      await expect.poll(() => viewUrl(page), { timeout: 10_000 }).toBe(`${tvUrl}&stream=1`);
      expect((await sent(page)).some((m) => m.event?.type === "START_CASTING" || m.event?.type === "SHOW_CAST_PICKER")).toBe(false);
      expect(await page.getByTestId("tv-hint").count()).toBe(0); // the app casts: no "open the TV page" link
      await expect.poll(() => reportTitles(page)).toContain(`Room ${code} · in the lobby`);

      // The room seats the OGS profile (what the TV shows).
      const tv = await openTv(tvUrl);
      expect(seat(tv.view(), "o-p1")).toMatchObject({ name: "Sam", avatar: gameClaims("scribble-room", SAM).avatar });
      tv.close();
      await page.context().close();
    }));

  it("the OGS app opening startUrl (/) on the phone joins that room instead of showing the TV page", () =>
    noteReloads(async () => {
      const page = await inOgs(await sign(gameClaims("scribble-room", SAM)), "/");
      await page.locator('.phone-app[data-screen-name="lobby"]').waitFor({ timeout: 15_000 });
      expect(new URL(page.url()).pathname).toBe(`/join/${codeOf(page)}`);
      expect(new URL(page.url()).searchParams.get("tv")).toMatch(/^tv-/);
      expect(await page.locator(".tv-stage").count()).toBe(0);
      await expect.poll(() => viewUrl(page), { timeout: 10_000 }).toMatch(new RegExp(`/tv/${codeOf(page)}\\?k=tv-[0-9a-f-]{36}&stream=1$`));
      await page.context().close();
    }));

  it("a couch phone with ?ogsRoom= joins that room as its own profile and declares no TV", () =>
    noteReloads(async () => {
      const host = await inOgs(await sign(gameClaims("scribble-room", SAM)), "/host");
      await host.locator('.phone-app[data-screen-name="lobby"]').waitFor({ timeout: 15_000 });
      const code = codeOf(host);
      const KIT = { id: "p2", handle: "kit", name: "Kit" };
      const kit = await inOgs(await sign(gameClaims("scribble-room", KIT)), `/host?ogsRoom=${code}`, KIT);
      await kit.locator('.phone-app[data-screen-name="lobby"]').waitFor({ timeout: 15_000 });
      expect(new URL(kit.url()).pathname).toBe(`/join/${code}`);
      await expect.poll(() => kit.locator(".chip.is-me .chip-name").textContent()).toBe("Kit (you)");
      await expect.poll(() => host.locator(".chip-name").allTextContents()).toEqual(["Sam (you)", "Kit"]);
      expect(await kit.getByTestId("waiting-host").count()).toBe(1);
      await kit.waitForTimeout(500);
      expect(await viewUrl(kit)).toBe("");
      await host.context().close();
      await kit.context().close();
    }));

  it("a token for another game or an expired one never gets an OGS seat", () =>
    noteReloads(async () => {
      const now = Math.floor(Date.now() / 1000);
      for (const claims of [gameClaims("rocket-crew", SAM), { ...gameClaims("scribble-room", SAM), iat: now - 7200, exp: now - 60 }]) {
        const page = await inOgs(await sign(claims), "/host");
        await page.locator('.phone-app[data-screen-name="lobby"]').waitFor({ timeout: 15_000 });
        const seatId = await page.evaluate((code) => localStorage.getItem(`sr:seat:${code}`) ?? "", codeOf(page));
        expect(seatId).toMatch(/"id":"g-/);
        await page.context().close();
      }
    }));

  it("in a plain browser the phone asks for a name", () =>
    noteReloads(async () => {
      const page = await (await browserP).newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`${BASE}/host`);
      await page.getByTestId("name-input").fill("Ana");
      await page.getByTestId("join").click();
      await page.locator('.phone-app[data-screen-name="lobby"]').waitFor({ timeout: 15_000 });
      await expect.poll(() => page.locator(".chip.is-me .chip-name").textContent()).toBe("Ana (you)");
      expect(await page.getByTestId("tv-hint").count()).toBe(1);
      await page.close();
    }));
});
