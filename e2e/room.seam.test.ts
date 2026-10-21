// The protocol seam: a TV and phones over real WebSockets against wrangler dev play a whole one-round
// classic game, with a phone refresh mid-turn and a late joiner.
import { describe, expect, it } from "vitest";
import type { PlayerView, TvView } from "../src/shared/protocol";
import { type Phone, createRoom, join, openTv } from "./ws-client";

const seat = (v: TvView, id: string) => v.players.find((p) => p.id === id);

/** The drawer picks the first word and returns it (read from the drawer's own view). */
async function pickFirst(drawer: Phone, turn: number): Promise<string> {
  await drawer.until((v) => v.phase === "picking" && v.turn === turn && v.me.choices.length === 3, 15_000, `turn ${turn} choices`);
  drawer.send("PICK", { index: 0 });
  const v = await drawer.until((x) => x.phase === "drawing" && x.me.word !== "", 5000, "drawing");
  return v.me.word;
}

async function everyoneGuesses(guessers: Phone[], word: string): Promise<void> {
  for (const g of guessers) g.send("GUESS", { text: word });
  await Promise.all(guessers.map((g) => g.until((v) => v.phase === "reveal" || v.me.guessed, 5000, `${g.name} guessed`)));
}

describe("a whole game over the wire", () => {
  it("TV + phones: lobby, drawing, guesses, a refresh, a late joiner, reveal and the podium", async () => {
    const { code, tvId, tvUrl, tv } = await createRoom();
    expect(code).toMatch(/^[A-Z]{4}$/);
    expect(tvId).toMatch(/^tv-/);
    expect(tv.view()).toMatchObject({ code, phase: "lobby", players: [] });

    const ana = await join(code, "Ana");
    let ben = await join(code, "Ben");
    const cal = await join(code, "Cal");
    await tv.until((v) => v.players.filter((p) => p.connected).length === 3, 10_000, "3 connected");
    expect(ana.view().me.isHost).toBe(true);
    expect(tv.view().hostId).toBe(ana.id);

    ana.send("SETTINGS", { rounds: 1, drawSeconds: 40 });
    await tv.until((v) => v.settings.rounds === 1 && v.settings.drawSeconds === 40, 5000, "settings");
    ben.send("START", {});
    await ben.until((v) => v.me.notice?.kind === "not-host", 5000, "not-host notice");
    ana.send("START", {});

    // Turn 1: Ana draws.
    const w1 = await pickFirst(ana, 1);
    const drawingTv = await tv.until((v) => v.phase === "drawing" && v.mask.length === w1.length, 5000, "mask");
    // Each socket gets its frames on its own: wait until Ben's phone has the drawing too (same seq as the TV).
    await ben.until((v) => v.seq === drawingTv.seq, 5000, "ben's view at the TV's seq");
    expect(JSON.stringify(tv.view())).not.toContain(`"${w1}"`);
    expect(JSON.stringify(ben.view())).not.toContain(`"${w1}"`);
    expect(tv.view().endsAt - tv.view().startedAt).toBe(40_000);

    // Strokes reach the TV and the phones' canvas sockets; the player view has no canvas.
    const playerSeq = ben.view().seq;
    ana.send("STROKE", { stroke: 1, color: 0, size: 1, pts: [100, 100, 200, 150, 300, 120] });
    ana.send("STROKE", { stroke: 1, color: 0, size: 1, pts: [300, 120, 400, 200] });
    await tv.until((v) => Object.keys(v.ops).length === 2, 5000, "tv ops");
    await cal.canvas.until((v) => Object.keys(v.ops).length === 2 && v.drawerId === ana.id, 5000, "canvas ops");
    expect("ops" in ben.view()).toBe(false);
    expect(ben.view().seq).toBe(playerSeq);
    ana.send("UNDO", {});
    await tv.until((v) => Object.keys(v.ops).length === 0, 5000, "undo");
    ben.send("STROKE", { stroke: 9, color: 0, size: 1, pts: [1, 1, 2, 2] });
    await expect.poll(() => ben.errors.some((e) => e.code === "guard_failed")).toBe(true);

    // A wrong guess is public; then Ben's phone refreshes mid-turn and keeps its seat.
    ben.send("GUESS", { text: "definitely not it" });
    await tv.until((v) => v.feed.some((f) => f.kind === "guess" && f.text === "definitely not it"), 5000, "wrong guess in feed");
    ben.close();
    await tv.until((v) => seat(v, ben.id)?.connected === false, 5000, "ben away");
    const benId = ben.id;
    ben = await join(code, "Ben", { id: ben.id, sig: ben.sig });
    expect(ben.id).toBe(benId);
    await tv.until((v) => seat(v, benId)?.connected === true, 5000, "ben back");
    expect(tv.view().players).toHaveLength(3);

    // Ben gets it: a private "you got it", the feed says who but never the word.
    ben.send("GUESS", { text: w1.toUpperCase() });
    const benView: PlayerView = await ben.until((v) => v.me.guessed, 5000, "ben guessed");
    expect(benView.me).toMatchObject({ word: w1, notice: { kind: "correct" } });
    const correct = await tv.until((v) => v.feed.some((f) => f.kind === "correct"), 5000, "correct in feed");
    expect(JSON.stringify(correct.feed)).not.toContain(w1);
    expect(cal.view().me.word).toBe("");

    // A late joiner guesses this turn's word, and is appended to this round.
    const dee = await join(code, "Dee");
    await tv.until((v) => seat(v, dee.id)?.connected === true, 5000, "dee connected");
    await everyoneGuesses([dee, cal], w1);
    const reveal1 = await tv.until((v) => v.phase === "reveal", 5000, "reveal 1");
    expect(reveal1.lastTurn).toMatchObject({ turn: 1, word: w1, drawerId: ana.id, reason: "all-guessed" });
    expect(Object.keys(reveal1.lastTurn?.gains ?? {}).sort()).toEqual([ana.id, ben.id, cal.id, dee.id].sort());
    const tvAfterRefresh = await openTv(tvUrl); // a TV refresh sees the same room
    expect(tvAfterRefresh.view().lastTurn?.word).toBe(w1);
    tvAfterRefresh.close();

    // Turns 2–4: Ben, Cal, then Dee (the late joiner); everyone else guesses.
    const order: [Phone, Phone[]][] = [
      [ben, [ana, cal, dee]],
      [cal, [ana, ben, dee]],
      [dee, [ana, ben, cal]],
    ];
    for (const [i, [drawer, others]] of order.entries()) {
      const w = await pickFirst(drawer, i + 2);
      expect(tv.view().drawerId).toBe(drawer.id);
      await everyoneGuesses(others, w);
      await tv.until((v) => v.phase === "reveal" && v.lastTurn?.turn === i + 2, 5000, `reveal ${i + 2}`);
    }

    const podium = await tv.until((v) => v.phase === "podium", 15_000, "podium");
    expect(podium.players.every((p) => p.score > 0)).toBe(true);
    expect(podium.endsAt).toBe(0);

    ana.send("PLAY_AGAIN", {});
    const again = await tv.until((v) => v.phase === "lobby", 5000, "lobby again");
    expect(again.players.map((p) => p.score)).toEqual([0, 0, 0, 0]);

    for (const p of [ana, ben, cal, dee]) p.close();
    tv.close();
  }, 120_000);
});
