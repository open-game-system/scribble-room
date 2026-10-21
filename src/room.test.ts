// Actor tests: the contract on actor-kit's simulate() (same step core as the Durable Object, a virtual
// clock, durable timers, lifecycle connections).
import { simulate } from "@actor-kit/test";
import { describe, expect, it } from "vitest";
import { TIMING } from "./config";
import { RoomContract } from "./room";
import { canvasIdFor } from "./room.views";
import { CanvasViewSchema, PlayerViewSchema, TvViewSchema } from "./shared/protocol";

const TV = "tv-0123456789";
const START = Date.UTC(2026, 9, 20, 20, 0, 0);
const SYS = { callerType: "service" as const };

function room(ids = ["g-ana", "g-ben", "g-cal"]) {
  const sim = simulate({ contracts: [RoomContract], seed: 7, now: START });
  const actor = sim.spawnSync(RoomContract, "ABCD", { code: "ABCD", tvId: TV }, { caller: "worker", callerType: "service" });
  const sockets = new Map<string, { disconnect(): void }>();
  for (const id of ids) {
    expect(actor.send("worker", { type: "ADMIT", id, name: id.slice(2), avatar: "" }, SYS)).toEqual({ ok: true });
    sockets.set(id, actor.connect(id));
  }
  const tv = () => TvViewSchema.parse(actor.view(TV));
  const phone = (id: string) => PlayerViewSchema.parse(actor.view(id));
  const canvas = (id: string) => CanvasViewSchema.parse(actor.view(canvasIdFor(id)));
  const word = () => actor.state.game.current?.word ?? "";
  return { sim, actor, sockets, tv, phone, canvas, word };
}

function drawing() {
  const r = room();
  expect(r.actor.send("g-ana", { type: "START" })).toEqual({ ok: true });
  expect(r.actor.send("g-ana", { type: "PICK", index: 0 })).toEqual({ ok: true });
  return r;
}

describe("roles", () => {
  it("TV, players, canvas sockets and the Worker each get a role; strangers none", () => {
    const { actor } = room();
    expect(actor.role(TV)).toBe("tv");
    expect(actor.role("g-ana")).toBe("player");
    expect(actor.role(canvasIdFor("g-ana"))).toBe("canvas");
    expect(actor.role("worker", SYS)).toBe("system");
    expect(actor.role("g-nobody")).toBeNull();
  });

  it("only the Worker admits; the TV and canvas sockets can't play", () => {
    const { actor } = room();
    expect(actor.send("g-ana", { type: "ADMIT", id: "g-x", name: "X", avatar: "" })).toMatchObject({ ok: false, code: "wrong_role" });
    expect(actor.send(TV, { type: "START" })).toMatchObject({ ok: false, code: "wrong_role" });
    expect(actor.send(canvasIdFor("g-ana"), { type: "GUESS", text: "hi" })).toMatchObject({ ok: false, code: "wrong_role" });
  });

  it("payloads are parsed at the boundary", () => {
    const { actor } = drawing();
    expect(actor.send("g-ana", { type: "STROKE", stroke: 1, color: 99, size: 0, pts: [1, 2] })).toMatchObject({ code: "invalid_payload" });
    expect(actor.send("g-ana", { type: "SETTINGS", rounds: 9 })).toMatchObject({ code: "invalid_payload" });
  });
});

describe("presence", () => {
  it("a player's socket marks them connected; a canvas socket doesn't", () => {
    const r = room(["g-ana"]);
    r.actor.send("worker", { type: "ADMIT", id: "g-ben", name: "ben", avatar: "" }, SYS);
    const cv = r.actor.connect(canvasIdFor("g-ben"));
    expect(r.tv().players.find((p) => p.id === "g-ben")?.connected).toBe(false);
    r.actor.connect("g-ben");
    expect(r.tv().players.find((p) => p.id === "g-ben")?.connected).toBe(true);
    cv.disconnect();
    expect(r.tv().players.find((p) => p.id === "g-ben")?.connected).toBe(true);
  });

  it("a second tab keeps a player connected until the last socket closes", () => {
    const r = room();
    const second = r.actor.connect("g-ben");
    r.sockets.get("g-ben")?.disconnect();
    expect(r.tv().players.find((p) => p.id === "g-ben")?.connected).toBe(true);
    second.disconnect();
    expect(r.tv().players.find((p) => p.id === "g-ben")?.connected).toBe(false);
  });

  it("host leaving: the next connected player hosts", () => {
    const r = room();
    r.sockets.get("g-ana")?.disconnect();
    expect(r.tv().hostId).toBe("g-ben");
    expect(r.phone("g-ben").me.isHost).toBe(true);
    expect(r.actor.send("g-ben", { type: "START" })).toEqual({ ok: true });
  });
});

describe("timers", () => {
  it("the pick times out to the middle word on the durable timer", () => {
    const r = room();
    r.actor.send("g-ana", { type: "START" });
    const middle = r.actor.state.game.current?.choices[1]?.word;
    expect(r.actor.timers.map((t) => t.key)).toEqual(["pick"]);
    r.sim.advance(TIMING.pickSeconds * 1000);
    expect(r.tv().phase).toBe("drawing");
    expect(r.word()).toBe(middle);
    expect(r.tv().endsAt).toBe(START + 15_000 + 80_000);
  });

  it("hints, draw end, reveal end and the next turn run on their own", () => {
    const r = drawing();
    const before = r.tv().mask;
    r.sim.advance("40s");
    const hidden = (m: string) => [...m].filter((c) => c === "_").length;
    if (r.word().replace(/[ '-]/g, "").length >= 3) expect(hidden(r.tv().mask)).toBeLessThan(hidden(before));
    r.sim.advance("40s");
    expect(r.tv()).toMatchObject({ phase: "reveal", lastTurn: { reason: "time", drawerId: "g-ana" } });
    r.sim.advance("7s");
    expect(r.tv()).toMatchObject({ phase: "picking", turn: 2, drawerId: "g-ben" });
  });

  it("a whole one-round game reaches the podium; play again returns to the lobby", () => {
    const r = room();
    r.actor.send("g-ana", { type: "SETTINGS", rounds: 1 });
    r.actor.send("g-ana", { type: "START" });
    for (let i = 0; i < 3; i++) r.sim.advance("110s");
    expect(r.tv().phase).toBe("podium");
    expect(r.actor.timers).toEqual([]);
    expect(r.actor.send("g-ana", { type: "PLAY_AGAIN" })).toEqual({ ok: true });
    expect(r.tv().phase).toBe("lobby");
  });

  it("a drawer who drops for 15 s loses the turn; back in time, the turn goes on", () => {
    const r = drawing();
    r.sockets.get("g-ana")?.disconnect();
    r.sim.advance("10s");
    r.sockets.set("g-ana", r.actor.connect("g-ana"));
    r.sim.advance("10s");
    expect(r.tv().phase).toBe("drawing");
    r.sockets.get("g-ana")?.disconnect();
    r.sim.advance("15s");
    expect(r.tv()).toMatchObject({ phase: "reveal", lastTurn: { reason: "drawer-left" } });
  });

  it("everyone guessing ends the turn early and cancels the draw timers", () => {
    const r = drawing();
    r.actor.send("g-ben", { type: "GUESS", text: r.word() });
    r.actor.send("g-cal", { type: "GUESS", text: r.word() });
    expect(r.tv().lastTurn?.reason).toBe("all-guessed");
    expect(r.actor.timers.map((t) => t.key)).toEqual(["reveal"]);
  });
});

describe("views on the wire", () => {
  it("a guesser's view never contains the word; the drawer's does", () => {
    const r = drawing();
    const w = r.word();
    expect(JSON.stringify(r.phone("g-ben"))).not.toContain(`"${w}"`);
    expect(JSON.stringify(r.tv())).not.toContain(`"${w}"`);
    expect(r.phone("g-ana").me.word).toBe(w);
  });

  it("a correct guess: private notice and the word for that guesser; the feed says who, never the word", () => {
    const r = drawing();
    const w = r.word();
    r.actor.send("g-ben", { type: "GUESS", text: w });
    expect(r.phone("g-ben").me).toMatchObject({ guessed: true, word: w, notice: { kind: "correct" } });
    const last = r.tv().feed.at(-1);
    expect(last).toMatchObject({ kind: "correct", playerId: "g-ben" });
    expect(JSON.stringify(r.tv().feed)).not.toContain(w);
    expect(r.phone("g-cal").me.word).toBe("");
  });

  it("canvas ops reach the TV and canvas views only; strokes don't touch the player view", () => {
    const r = drawing();
    const phoneBefore = JSON.stringify(r.phone("g-ben"));
    expect(r.actor.send("g-ana", { type: "STROKE", stroke: 1, color: 2, size: 1, pts: [10, 10, 20, 20] })).toEqual({ ok: true });
    expect(Object.values(r.tv().ops)).toHaveLength(1);
    expect(Object.values(r.canvas("g-ben").ops)).toHaveLength(1);
    expect(JSON.stringify(r.phone("g-ben"))).toBe(phoneBefore);
  });

  it("a guesser can't draw (refused by the guard)", () => {
    const r = drawing();
    expect(r.actor.send("g-ben", { type: "STROKE", stroke: 1, color: 2, size: 1, pts: [1, 1, 2, 2] })).toMatchObject({ ok: false, code: "guard_failed" });
  });

  it("a refused move becomes a private notice", () => {
    const r = room();
    r.actor.send("g-ben", { type: "START" });
    expect(r.phone("g-ben").me.notice).toMatchObject({ kind: "not-host" });
    expect(r.phone("g-cal").me.notice).toBeNull();
  });
});

describe("reconnects and late joiners", () => {
  it("a refreshed phone keeps its seat and score", () => {
    const r = drawing();
    r.actor.send("g-ben", { type: "GUESS", text: r.word() });
    const score = r.tv().players.find((p) => p.id === "g-ben")?.score ?? 0;
    expect(score).toBeGreaterThan(0);
    r.sockets.get("g-ben")?.disconnect();
    expect(r.tv().players.find((p) => p.id === "g-ben")?.connected).toBe(false);
    r.actor.send("worker", { type: "ADMIT", id: "g-ben", name: "ben", avatar: "" }, SYS);
    r.actor.connect("g-ben");
    expect(r.tv().players).toHaveLength(3);
    expect(r.tv().players.find((p) => p.id === "g-ben")).toMatchObject({ connected: true, score, guessed: true });
  });

  it("a late joiner guesses the current word", () => {
    const r = drawing();
    r.actor.send("worker", { type: "ADMIT", id: "g-dee", name: "dee", avatar: "" }, SYS);
    r.actor.connect("g-dee");
    expect(r.actor.send("g-dee", { type: "GUESS", text: r.word() })).toEqual({ ok: true });
    expect(r.phone("g-dee").me.guessed).toBe(true);
  });
});
