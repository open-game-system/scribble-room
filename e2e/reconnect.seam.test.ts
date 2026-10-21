// Reconnects and canvas consistency over the wire: phones refreshing mid-drawing (drawer and guesser),
// a TV refresh redrawing the whole canvas, undo/clear converging on every canvas socket, and a host skip.
import { describe, expect, it } from "vitest";
import type { CanvasView, TvView } from "../src/shared/protocol";
import { noteReloads, opKeys, opsJson, pickTurn, seat } from "./seam-kit";
import { type Phone, type Socket, type TvClient, createRoom, join, openTv } from "./ws-client";

async function room(names: string[]) {
  const { code, tv, tvUrl } = await createRoom();
  const phones: Phone[] = [];
  for (const name of names) phones.push(await join(code, name));
  await tv.until((v) => v.players.filter((p) => p.connected).length === names.length, 10_000, "all connected");
  return { code, tv, tvUrl, phones };
}

async function startClassic(tv: TvClient, host: Phone) {
  host.send("SETTINGS", { mode: "classic", rounds: 1, drawSeconds: 40 });
  await tv.until((v) => v.settings.rounds === 1 && v.settings.drawSeconds === 40, 5000, "settings");
  host.send("START", {});
}

/** Sends `chunks` chunks of stroke `stroke` (distinct points per chunk). */
function draw(drawer: Phone, stroke: number, chunks: number) {
  for (let i = 0; i < chunks; i++) drawer.send("STROKE", { stroke, color: stroke % 12, size: 1, pts: [10 * stroke + i, 20 + i, 10 * stroke + i + 5, 40 + i] });
}

type Canvas = Socket<CanvasView> | Socket<TvView>;

/** Every canvas (phones' canvas sockets and TVs) shows exactly `n` ops, the same ones. */
async function converge(canvases: Canvas[], n: number, what: string): Promise<string> {
  const views = await Promise.all(canvases.map((c, i) => c.until((v) => Object.keys(v.ops).length === n, 5000, `${what} (#${i})`)));
  const [first, ...rest] = views;
  if (!first) throw new Error("no canvases");
  for (const v of rest) expect(opsJson(v)).toBe(opsJson(first));
  return opKeys(first);
}

const strokesOf = (v: { ops: Record<string, { stroke: number }> }) => Object.keys(v.ops).sort().map((k) => v.ops[k]?.stroke);

describe("reconnects and the canvas over the wire", () => {
  it("refreshing mid-drawing keeps the drawer's and a guesser's seat, score and guessed state", () =>
    noteReloads(async () => {
      const { code, tv, phones } = await room(["Ana", "Ben", "Cal"]);
      let [ana, ben, cal] = phones;
      if (!ana || !ben || !cal) throw new Error("phones");
      await startClassic(tv, ana);
      const { drawer, word } = await pickTurn(tv, phones, 1);
      expect(drawer).toBe(ana);
      draw(ana, 1, 3);
      await tv.until((v) => Object.keys(v.ops).length === 3, 5000, "3 ops");

      // Ben gets it, then refreshes: same seat, same live score, still guessed, still sees the word.
      ben.send("GUESS", { text: word });
      const got = await tv.until((v) => seat(v, ben?.id ?? "")?.guessed === true, 5000, "ben guessed");
      const benScore = seat(got, ben.id)?.score ?? 0;
      expect(benScore).toBeGreaterThan(0);
      ben.close();
      await tv.until((v) => seat(v, ben?.id ?? "")?.connected === false, 5000, "ben away");
      const benId = ben.id;
      ben = await join(code, "Ben", { id: ben.id, sig: ben.sig });
      expect(ben.id).toBe(benId);
      const back = await ben.until((v) => seat(v, benId)?.connected === true, 5000, "ben back");
      expect(back.me).toMatchObject({ guessed: true, word, isDrawer: false });
      expect(seat(back, benId)?.score).toBe(benScore);
      await ben.canvas.until((v) => opKeys(v) === opKeys(tv.view()), 5000, "ben's canvas redrawn");

      // Ana (drawing) refreshes inside the grace: still the drawer, sees the word and the canvas, can draw on.
      ana.close();
      await tv.until((v) => seat(v, ana?.id ?? "")?.connected === false, 5000, "ana away");
      const droppedAt = Date.now();
      ana = await join(code, "Ana", { id: ana.id, sig: ana.sig });
      const anaBack = await ana.until((v) => v.me.isDrawer && v.phase === "drawing", 5000, "ana drawing again");
      expect(anaBack.me.word).toBe(word);
      await ana.canvas.until((v) => Object.keys(v.ops).length === 3, 5000, "ana's canvas redrawn");
      draw(ana, 2, 1);
      await tv.until((v) => Object.keys(v.ops).length === 4, 5000, "ana draws after the refresh");
      expect(ana.errors).toEqual([]);

      // The grace was cancelled: past 15 s from the drop the turn is still on.
      const left = 16_000 - (Date.now() - droppedAt);
      await expect(tv.until((v) => v.phase !== "drawing", left, "turn ended")).rejects.toThrow(/timed out/);

      cal.send("GUESS", { text: word });
      const r = await tv.until((v) => v.phase === "reveal", 5000, "reveal");
      expect(r.lastTurn).toMatchObject({ reason: "all-guessed", gains: { [ana.id]: 300 } });
      expect(r.lastTurn?.gains[benId]).toBe(benScore);
      for (const p of [ana, ben, cal]) p.close();
      tv.close();
    }), 60_000);

  it("a TV refresh redraws the whole canvas, including what was drawn while it was away", () =>
    noteReloads(async () => {
      const { code, tv, tvUrl, phones } = await room(["Ana", "Ben"]);
      const [ana, ben] = phones;
      if (!ana || !ben) throw new Error("phones");
      await startClassic(tv, ana);
      await pickTurn(tv, phones, 1);
      draw(ana, 1, 5);
      draw(ana, 2, 5);
      ana.send("FILL", { stroke: 3, color: 4, x: 600, y: 450 });
      await converge([tv, ben.canvas], 11, "11 ops");
      ana.send("UNDO", {}); // takes the fill back
      draw(ana, 4, 3);
      const before = await converge([tv, ben.canvas, ana.canvas], 13, "13 ops");
      expect(strokesOf(tv.view())).not.toContain(3);

      tv.close();
      draw(ana, 5, 4);
      await ben.canvas.until((v) => Object.keys(v.ops).length === 17, 5000, "drawn while the TV is away");
      const tv2 = await openTv(tvUrl);
      const after = await converge([tv2, ben.canvas, ana.canvas], 17, "the refreshed TV");
      expect(after.startsWith(before)).toBe(true);
      expect(tv2.view().canvasTurn).toBe(ben.canvas.view().canvasTurn);
      expect(opsJson(tv2.view())).toBe(opsJson(ben.canvas.view()));

      // A phone refresh gets the whole canvas in its join snapshot too.
      ben.close();
      const ben2 = await join(code, "Ben", { id: ben.id, sig: ben.sig });
      expect(opsJson(ben2.canvas.view())).toBe(opsJson(tv2.view()));
      for (const p of [ana, ben2]) p.close();
      tv2.close();
    }), 60_000);

  it("undo and clear converge on every canvas socket; only the drawer can change the canvas", () =>
    noteReloads(async () => {
      const { tv, phones } = await room(["Ana", "Ben", "Cal", "Dee"]);
      const [ana, ben] = phones;
      if (!ana || !ben) throw new Error("phones");
      await startClassic(tv, ana);
      await pickTurn(tv, phones, 1);
      const canvases: Canvas[] = [tv, ...phones.map((p) => p.canvas)];

      draw(ana, 1, 3);
      draw(ana, 2, 3);
      draw(ana, 3, 2);
      await converge(canvases, 8, "8 ops");
      ana.send("UNDO", {});
      await converge(canvases, 6, "undo stroke 3");
      expect(strokesOf(tv.view())).toEqual([1, 1, 1, 2, 2, 2]);

      // A phone that restarts its stroke counter: undo removes only the trailing run, not the old stroke 1.
      draw(ana, 1, 2);
      await converge(canvases, 8, "a second stroke 1");
      ana.send("UNDO", {});
      await converge(canvases, 6, "undo the trailing stroke 1");
      expect(strokesOf(tv.view())).toEqual([1, 1, 1, 2, 2, 2]);
      const maxKey = Object.keys(tv.view().ops).sort().at(-1) ?? "";

      // Someone else's canvas ops are refused and change nothing.
      ben.send("UNDO", {});
      ben.send("CLEAR", {});
      await expect.poll(() => ben.errors.filter((e) => e.code === "guard_failed").length).toBe(2);
      expect(Object.keys(tv.view().ops)).toHaveLength(6);

      ana.send("CLEAR", {});
      await converge(canvases, 0, "clear");
      ana.send("UNDO", {}); // nothing to undo; a clear is not undone
      draw(ana, 7, 2);
      await converge(canvases, 2, "drawing after the clear");
      expect(strokesOf(tv.view())).toEqual([7, 7]);
      expect(Object.keys(tv.view().ops).every((k) => k > maxKey)).toBe(true);
      expect(ana.errors).toEqual([]);
      for (const p of phones) p.close();
      tv.close();
    }), 60_000);

  it("host SKIP mid-drawing scores nobody; a guest can't skip; SKIP in the reveal goes straight on", () =>
    noteReloads(async () => {
      const { tv, phones } = await room(["Ana", "Ben", "Cal"]);
      const [ana, ben, cal] = phones;
      if (!ana || !ben || !cal) throw new Error("phones");
      await startClassic(tv, ana);
      const { word } = await pickTurn(tv, phones, 1);
      ben.send("GUESS", { text: word });
      await tv.until((v) => (seat(v, ben.id)?.score ?? 0) > 0, 5000, "ben's live score");

      cal.send("SKIP", {});
      await cal.until((v) => v.me.notice?.kind === "not-host", 5000, "not-host notice");
      expect(tv.view().phase).toBe("drawing");

      ana.send("SKIP", {});
      const r = await tv.until((v) => v.phase === "reveal", 5000, "skipped");
      expect(r.lastTurn).toMatchObject({ turn: 1, word, reason: "skipped", gains: {}, teamGains: {} });
      expect(r.players.map((p) => p.score)).toEqual([0, 0, 0]);
      expect(r.feed.some((f) => f.kind === "skip" && f.playerId === ana.id)).toBe(true);

      // In the reveal, SKIP goes to the next turn now (not after the 7 s beat); skipping a pick scores nobody too.
      const t = Date.now();
      ana.send("SKIP", {});
      await tv.until((v) => v.phase === "picking" && v.turn === 2, 3000, "turn 2");
      expect(Date.now() - t).toBeLessThan(3000);
      ana.send("SKIP", {});
      const r2 = await tv.until((v) => v.phase === "reveal" && v.lastTurn?.turn === 2, 5000, "turn 2 skipped while picking");
      expect(r2.lastTurn).toMatchObject({ reason: "skipped", gains: {} });
      expect(r2.players.map((p) => p.score)).toEqual([0, 0, 0]);
      for (const p of phones) p.close();
      tv.close();
    }), 60_000);
});
