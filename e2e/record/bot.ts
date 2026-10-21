// The gameplay-video bot's moves on the phone page: join, host settings, picking a drawable word,
// drawing a picture with real pointer moves, and typing guesses. Selectors are the page's data-testids.
import type { Page } from "playwright";
import { CANVAS } from "../../src/config";
import { type Op, STRAY, type StrokeOp, canDraw, pictureFor } from "./drawings";

export type Screen = "lobby" | "pick" | "choosing" | "draw" | "guess" | "reveal" | "podium";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const tid = (page: Page, id: string) => page.locator(`[data-testid="${id}"]`);

export async function screenOf(page: Page): Promise<string> {
  return (await page.locator(".phone-app").first().getAttribute("data-screen-name").catch(() => null)) ?? "";
}

export async function waitScreen(page: Page, name: Screen, timeout = 60_000): Promise<void> {
  await page.locator(`.phone-app[data-screen-name="${name}"]`).waitFor({ timeout });
}

export async function tap(page: Page, id: string): Promise<void> {
  await tid(page, id).tap();
}

export async function joinAs(page: Page, base: string, code: string, name: string): Promise<void> {
  await page.goto(`${base}/join/${code}`);
  const input = tid(page, "name-input");
  await input.tap();
  await input.pressSequentially(name, { delay: 90 });
  await sleep(300);
  await tap(page, "join");
  await waitScreen(page, "lobby");
}

/** Taps a stepper until its value reads `want` (e.g. "1" rounds, "40s" draw time). */
export async function stepTo(page: Page, id: string, want: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const v = ((await tid(page, id).locator(".step-value").textContent()) ?? "").trim();
    if (v === want) return;
    await tap(page, `${id}-down`);
    await sleep(350);
  }
}

/** Polls the phones until one is picking a word (returns it) or the game reached the podium (null). */
export async function nextDrawer(phones: Page[]): Promise<Page | null> {
  for (let i = 0; i < 400; i++) {
    for (const p of phones) {
      const s = await screenOf(p);
      if (s === "pick") return p;
      if (s === "podium") return null;
    }
    await sleep(150);
  }
  throw new Error("no drawer and no podium after 60 s");
}

/** Picks the first offered word the picture library can draw (else the middle one); returns it. */
export async function pickWord(drawer: Page): Promise<string> {
  const words: string[] = [];
  for (let i = 0; i < 3; i++) words.push(((await tid(drawer, `choice-${i}`).locator(".choice-word").textContent()) ?? "").trim());
  const at = Math.max(0, words.findIndex(canDraw));
  const idx = words.some(canDraw) ? at : 1;
  await sleep(1200);
  await tap(drawer, `choice-${idx}`);
  await waitScreen(drawer, "draw");
  return ((await tid(drawer, "draw-word").textContent()) ?? "").trim();
}

type PenState = { color: number; size: number; fill: boolean };

async function pen(drawer: Page, st: PenState, color: number, size: number): Promise<void> {
  if (st.fill) {
    await tap(drawer, "tool-fill");
    st.fill = false;
  }
  if (st.color !== color) {
    await tap(drawer, `color-${color}`);
    st.color = color;
  }
  if (st.size !== size) {
    await tap(drawer, `brush-${size}`);
    st.size = size;
  }
}

async function strokeOn(drawer: Page, op: StrokeOp, box: { x: number; y: number; width: number; height: number }): Promise<void> {
  const at = (x: number, y: number) => ({ x: box.x + (x / CANVAS.w) * box.width, y: box.y + (y / CANVAS.h) * box.height });
  const first = op.pts[0];
  if (!first) return;
  const p0 = at(first[0], first[1]);
  await drawer.mouse.move(p0.x, p0.y);
  await drawer.mouse.down();
  for (const [x, y] of op.pts.slice(1)) {
    const p = at(x, y);
    await drawer.mouse.move(p.x, p.y, { steps: 3 });
    await sleep(28);
  }
  await drawer.mouse.up();
}

async function canvasBox(drawer: Page) {
  const box = await tid(drawer, "draw-canvas").boundingBox();
  if (!box) throw new Error("no draw canvas");
  return box;
}

async function apply(drawer: Page, st: PenState, op: Op): Promise<void> {
  const box = await canvasBox(drawer);
  if (op.kind === "fill") {
    if (st.color !== op.color) {
      await tap(drawer, `color-${op.color}`);
      st.color = op.color;
    }
    if (!st.fill) {
      await tap(drawer, "tool-fill");
      st.fill = true;
    }
    await drawer.mouse.click(box.x + (op.at[0] / CANVAS.w) * box.width, box.y + (op.at[1] / CANVAS.h) * box.height);
    return;
  }
  await pen(drawer, st, op.color, op.size);
  await strokeOn(drawer, op, box);
}

/** Draws `word`'s picture on the drawer's canvas. `withUndo`: a stray line halfway, then Undo. */
export async function drawPicture(drawer: Page, word: string, opts: { withUndo?: boolean; still?: () => boolean } = {}): Promise<void> {
  const st: PenState = { color: 0, size: 1, fill: false };
  const ops = pictureFor(word);
  const half = Math.floor(ops.length / 2);
  for (const [i, op] of ops.entries()) {
    if (opts.still && !opts.still()) return;
    if (opts.withUndo && i === half) {
      await apply(drawer, st, STRAY);
      await sleep(700);
      await tap(drawer, "tool-undo");
      await sleep(500);
    }
    await apply(drawer, st, op);
    await sleep(260);
  }
}

/** Types a guess on a guesser's phone and sends it with Enter. */
export async function guess(page: Page, text: string): Promise<void> {
  if ((await screenOf(page)) !== "guess") return;
  const input = tid(page, "guess-input");
  if (!(await input.count())) return;
  await input.tap();
  await input.pressSequentially(text, { delay: 85 });
  await sleep(200);
  await input.press("Enter");
}

/** One typo away (or the plural for short words): the room answers it with a private "So close!". */
export function nearMiss(word: string): string {
  if (word.replace(/ /g, "").length < 4) return `${word}s`;
  const i = Math.floor(word.length / 2);
  const at = word[i] === " " ? i + 1 : i;
  return word.slice(0, at) + word.slice(at + 1);
}

const WRONG = ["potato", "a hat", "pizza", "dinosaur", "moon", "a blob", "spaceship", "banana", "cheese", "mountain"];
export function wrongFor(word: string, n: number): string {
  const pool = WRONG.filter((w) => w !== word && !word.includes(w) && !w.includes(word));
  return pool[n % pool.length] ?? "potato";
}
