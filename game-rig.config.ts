/**
 * Scribble Room evidence rig: ~/src/skills/game-rig/bin/game-rig.mjs record --no-open (pnpm record)
 * Point it at a dev server with GAME_RIG_URL (default http://127.0.0.1:8875). The bot plays a short
 * classic game (1 round, 40 s, easy words; everyone draws once), then Play again into a 2-team game.
 */
import type { Page } from "playwright";
import type { GameRigInput, SessionRig } from "../skills/game-rig/src/config.ts";
import { drawPicture, guess, joinAs, nearMiss, nextDrawer, pickWord, stepTo, tap, waitScreen, wrongFor } from "./e2e/record/bot.ts";

const URL_BASE = process.env.SCRIBBLE_URL ?? "http://127.0.0.1:8875";
const PLAYERS = [
  { role: "maya", name: "Maya", team: "t0" },
  { role: "theo", name: "Theo", team: "t0" },
  { role: "rosa", name: "Rosa", team: "t1" },
  { role: "sam", name: "Sam", team: "t1" },
] as const;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One turn: the drawer picks a drawable word and draws it; guessers try wrong, close, then right. */
async function playTurn(rig: SessionRig, phones: Page[], n: number, opts: { undo: boolean }): Promise<boolean> {
  const drawer = await nextDrawer(phones);
  if (!drawer) return false;
  const who = PLAYERS[phones.indexOf(drawer)]?.name ?? "?";
  rig.mark(`${who} picks a word`);
  const word = await pickWord(drawer);
  rig.mark(`${who} draws "${word}"`);
  const others = phones.filter((p) => p !== drawer);
  const g = others.map((_, i) => others[(i + n) % others.length]).filter((p): p is Page => p !== undefined);
  const [g0, g1, g2] = g;
  if (!g0 || !g1 || !g2) throw new Error("need three guessers");
  const drawing = drawPicture(drawer, word, { withUndo: opts.undo });
  await sleep(2500);
  await guess(g0, wrongFor(word, n));
  rig.mark("wrong guess");
  await sleep(2000);
  await guess(g1, nearMiss(word));
  rig.mark("so close");
  await drawing;
  rig.mark("drawing done");
  await sleep(500);
  await guess(g1, word);
  rig.mark("first correct");
  await sleep(900);
  await guess(g2, wrongFor(word, n + 3));
  await sleep(600);
  await guess(g0, word);
  await sleep(900);
  await guess(g2, word);
  await waitScreen(drawer, "reveal", 45_000);
  rig.mark(`reveal "${word}"`);
  return true;
}

async function playGame(rig: SessionRig, phones: Page[], firstUndo: boolean): Promise<void> {
  for (let n = 0; n < 12; n++) {
    if (!(await playTurn(rig, phones, n, { undo: firstUndo && n === 0 }))) break;
  }
  rig.mark("podium");
  await sleep(9000);
}

const config: GameRigInput = {
  name: "Scribble Room",
  baseUrl: URL_BASE,
  roles: {
    tv: { kind: "tv", label: "TV" },
    maya: { kind: "phone", label: "Maya (host)" },
    theo: { kind: "phone", label: "Theo" },
    rosa: { kind: "phone", label: "Rosa" },
    sam: { kind: "phone", label: "Sam" },
  },
  focal: "window.__focalRect?.() ?? null",
  audioRole: "tv",
  session: async (rig: SessionRig) => {
    const { tv, maya, theo, rosa, sam } = rig.pages;
    if (!tv || !maya || !theo || !rosa || !sam) throw new Error("roles missing");
    const phones = [maya, theo, rosa, sam];
    await tv.goto(`${rig.baseUrl}/`);
    await tv.waitForURL(/\/tv\/[A-Z]{4}/);
    const code = /\/tv\/([A-Z]{4})/.exec(tv.url())?.[1] ?? "";
    // A plain-browser TV unlocks its sound on the first click (once the page has mounted).
    await tv.locator(".tv-stage").waitFor();
    for (let i = 0; i < 10; i++) {
      await tv.mouse.click(4, 4);
      await sleep(300);
      if (await tv.evaluate("Boolean(window.__gameRigAudio && window.__gameRigAudio.started())")) break;
    }
    await rig.startAudio("tv");
    rig.mark(`TV lobby ${code}`);
    await sleep(2500);
    for (const [i, p] of PLAYERS.entries()) {
      const page = phones[i];
      if (page) await joinAs(page, rig.baseUrl, code, p.name);
      await sleep(700);
    }
    rig.mark("everyone joined");
    await tap(maya, "difficulty-easy");
    await stepTo(maya, "set-rounds", "1");
    await stepTo(maya, "set-time", "40s");
    await sleep(1200);
    await tap(maya, "start");
    rig.mark("classic game starts");
    await playGame(rig, phones, true);

    await tap(maya, "play-again");
    await waitScreen(maya, "lobby");
    rig.mark("play again");
    await sleep(1500);
    await tap(maya, "mode-teams");
    await sleep(800);
    for (const [i, p] of PLAYERS.entries()) {
      const page = phones[i];
      if (page) await tap(page, `team-${p.team}`);
      await sleep(500);
    }
    await stepTo(maya, "set-rounds", "1");
    await stepTo(maya, "set-time", "40s");
    rig.mark("teams picked");
    await sleep(2000);
    await tap(maya, "start");
    rig.mark("teams game starts");
    await playGame(rig, phones, false);
  },
};
export default config;
