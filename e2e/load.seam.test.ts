/**
 * Load: one room, a TV and N phones (each with its player and canvas sockets) over real WebSockets,
 * teams mode with 6 teams. Every streamed turn the drawer sends STROKE_CHUNKS chunks at ~20/s while every
 * guesser sends a wrong guess, a close guess and (staggered) the right one.
 *
 *   pnpm test:load                       # 40 phones (6 turns streamed) and 60 phones (LOAD_TURNS_60, default 3)
 *
 * Asserts: every canvas socket converges on the TV's ops, every guesser gets its private "close" and
 * "correct" notices, the word never reaches a phone that hasn't got it or the TV, gains add up per team,
 * p95 guess → TV feed < 1 s and p95 stroke → TV op < 500 ms, no socket errors, drops or reconnects.
 * Prints latency and bytes. Skipped unless LOAD=1 (pnpm test:seam runs every other seam file).
 */
import { afterEach, describe, expect, it } from "vitest";
import type { TvView } from "../src/shared/protocol";
import { closeGuess, kb, noteReloads, meterWebSockets, ms, opKeys, opsJson, percentile, pickTurn, seat, total, watch } from "./seam-kit";
import { type Phone, createRoom, join, openTv } from "./ws-client";

const RUN = process.env.LOAD === "1";
const TEAMS = 6;
const STROKE_CHUNKS = Number(process.env.STROKE_CHUNKS ?? 150);
const CHUNKS_PER_STROKE = 15;
const CHUNK_EVERY_MS = 50;
const POINTS_PER_CHUNK = 6;

const sleep = (t: number) => new Promise<void>((r) => setTimeout(r, t));
const at = (t0: number, offset: number) => sleep(Math.max(0, t0 + offset - performance.now()));

type Turn = { turn: number; word: string; drawerId: string };

let cleanup: (() => void)[] = [];
afterEach(() => {
  for (const f of cleanup.splice(0)) f();
});

async function loadRun(n: number, streamedTurns: number) {
  const meter = meterWebSockets();
  cleanup.push(meter.uninstall);
  const t0Run = performance.now();

  const { code, tv, tvUrl } = await createRoom();
  cleanup.push(() => tv.close());

  // --- What the TV sees: feed arrivals, op arrivals, and the word never showing up.
  const sent = new Map<string, number>();
  const feedLatency: number[] = [];
  const strokeLatency: number[] = [];
  const arrived = new Set<string>();
  const leaks: string[] = [];
  let current: Turn | null = null;
  const seenFeed = new Set<number>();
  const seenOps = new Set<string>();
  const correctPoints = new Map<string, number>();
  const leaked = (text: string, word: string) => text.toLowerCase().includes(word.toLowerCase());
  const tvWatch = (v: TvView) => {
    const now = performance.now();
    for (const f of v.feed) {
      if (seenFeed.has(f.seq)) continue;
      seenFeed.add(f.seq);
      const key = f.kind === "guess" ? `g:${f.text}` : f.kind === "correct" ? `c:${v.turn}:${f.playerId}` : "";
      if (f.kind === "correct") correctPoints.set(`${v.turn}:${f.playerId}`, Number(f.text.replace("+", "")));
      const t = sent.get(key);
      if (t !== undefined && !arrived.has(key)) {
        arrived.add(key);
        feedLatency.push(now - t);
      }
    }
    for (const [k, op] of Object.entries(v.ops)) {
      const id = `${v.canvasTurn}:${k}`;
      if (seenOps.has(id)) continue;
      seenOps.add(id);
      const t = sent.get(`s:${v.canvasTurn}:${op.stroke}:${op.pts[0]}`);
      if (t !== undefined) strokeLatency.push(now - t);
    }
    if (current && v.phase === "drawing" && v.turn === current.turn) {
      const w = current.word;
      if (v.mask === w || v.feed.some((f) => leaked(f.text, w)) || JSON.stringify(v).includes(`"${w}"`)) leaks.push(`tv turn ${v.turn}`);
    }
  };
  cleanup.push(watch(tv, tvWatch));

  // --- Phones: the first is the host; the rest join ten at a time.
  const joinMs: number[] = [];
  const timedJoin = async (i: number) => {
    const t = performance.now();
    const p = await join(code, `P${String(i).padStart(2, "0")}`);
    joinMs.push(performance.now() - t);
    return p;
  };
  const phones: Phone[] = [await timedJoin(0)];
  for (let i = 1; i < n; i += 10) {
    const batch = Array.from({ length: Math.min(10, n - i) }, (_, k) => i + k);
    phones.push(...(await Promise.all(batch.map(timedJoin))));
  }
  cleanup.push(() => phones.forEach((p) => p.close()));
  const host = phones[0];
  if (!host) throw new Error("no host");
  await tv.until((v) => v.players.filter((p) => p.connected).length === n, 30_000, `${n} connected`);

  // Each phone: its notices this turn, and the word never in its view before it has it.
  const notices = new Map<string, string[]>();
  for (const p of phones) {
    let lastNotice = -1;
    cleanup.push(
      watch(p, (v) => {
        const nt = v.me.notice;
        if (nt && nt.seq !== lastNotice) {
          lastNotice = nt.seq;
          notices.set(p.id, [...(notices.get(p.id) ?? []), nt.kind]);
        }
        if (!current || v.phase !== "drawing" || v.turn !== current.turn || v.me.guessed || v.me.isDrawer) return;
        const w = current.word;
        if (v.me.word !== "" || v.mask === w || v.feed.some((f) => leaked(f.text, w))) leaks.push(`${p.name} turn ${v.turn}`);
      }),
    );
  }

  // --- Lobby: 6 teams, one round, short draws; shuffle deals everyone round-robin.
  host.send("SETTINGS", { mode: "teams", teamCount: TEAMS, rounds: 1, drawSeconds: 40, hints: true });
  await tv.until((v) => v.settings.mode === "teams" && v.settings.teamCount === TEAMS && v.settings.rounds === 1, 10_000, "settings");
  host.send("SHUFFLE_TEAMS", {});
  const dealt = await tv.until((v) => {
    const sizes = v.teams.map((t) => v.players.filter((p) => p.team === t.id).length);
    return sizes.length === TEAMS && Math.max(...sizes) - Math.min(...sizes) <= 1 && v.players.every((p) => p.team !== "");
  }, 10_000, "balanced teams");
  const teamOf = new Map(dealt.players.map((p) => [p.id, p.team]));
  host.send("START", {});

  const playerTotals = new Map<string, number>();
  const teamTotals = new Map<string, number>();
  const drawingTeams: string[] = [];

  for (let turn = 1; turn <= TEAMS; turn++) {
    if (turn > streamedTurns) {
      // Not streamed: the host skips it (nobody scores), then skips the reveal.
      const v = await tv.until((x) => x.phase === "picking" && x.turn === turn, 20_000, `turn ${turn} picking`);
      drawingTeams.push(v.drawingTeam);
      host.send("SKIP", {});
      const r = await tv.until((x) => x.phase === "reveal" && x.lastTurn?.turn === turn, 10_000, `turn ${turn} skipped`);
      expect(r.lastTurn?.reason).toBe("skipped");
      expect(r.lastTurn?.gains).toEqual({});
      host.send("SKIP", {});
      continue;
    }

    const { drawer, word } = await pickTurn(tv, phones, turn);
    drawingTeams.push(tv.view().drawingTeam);
    current = { turn, word, drawerId: drawer.id };
    for (const p of phones) notices.delete(p.id);
    const guessers = phones.filter((p) => p !== drawer);
    const g = guessers.length;
    const wave1 = guessers.slice(0, Math.floor(g * 0.7));
    const wave2 = guessers.slice(wave1.length);
    const canvasTurn = tv.view().canvasTurn;
    const t0 = performance.now();

    const stream = (async () => {
      for (let i = 0; i < STROKE_CHUNKS; i++) {
        await at(t0, i * CHUNK_EVERY_MS);
        const stroke = 1 + Math.floor(i / CHUNKS_PER_STROKE);
        const pts = Array.from({ length: POINTS_PER_CHUNK }, (_, k) => [50 + i, 100 + ((i * 13 + k * 29) % 700)]).flat();
        sent.set(`s:${canvasTurn}:${stroke}:${50 + i}`, performance.now());
        drawer.send("STROKE", { stroke, color: i % 12, size: i % 3, pts });
      }
    })();
    const wrong = guessers.map(async (p, k) => {
      await at(t0, 150 + (k * 2400) / g);
      const text = `xq ${turn} ${k}`;
      sent.set(`g:${text}`, performance.now());
      p.send("GUESS", { text });
    });
    const close = guessers.map(async (p, k) => {
      await at(t0, 2600 + (k * 1800) / g);
      p.send("GUESS", { text: closeGuess(word) });
    });
    const right = (p: Phone) => {
      sent.set(`c:${turn}:${p.id}`, performance.now());
      p.send("GUESS", { text: word.toUpperCase() });
    };
    const first = wave1.map(async (p, k) => {
      await at(t0, 4800 + (k * 2400) / wave1.length);
      right(p);
    });
    await Promise.all([stream, ...wrong, ...close, ...first]);

    // Every canvas socket (drawer's included) converges on the TV's ops before the last guesses end the turn.
    const tvOps = await tv.until((v) => Object.keys(v.ops).length === STROKE_CHUNKS, 10_000, `turn ${turn} tv ops`).catch(async (e: unknown) => {
      const v = tv.view();
      const fresh = await openTv(tvUrl);
      const have = new Set(Object.values(v.ops).map((o) => o.pts[0]));
      const missing = Array.from({ length: STROKE_CHUNKS }, (_, i) => 50 + i).filter((x) => !have.has(x));
      const canvasCounts = phones.map((p) => Object.keys(p.canvas.view().ops).length);
      console.log(`fresh TV ops ${Object.keys(fresh.view().ops).length}; missing chunks ${missing.join(",")}; canvas counts ${canvasCounts.join(",")}`);
      fresh.close();
      throw new Error(
        `${String(e)}: tv phase ${v.phase} turn ${v.turn}, ${Object.keys(v.ops).length} ops, drawer errors ${JSON.stringify(drawer.errors)}, last turn ${JSON.stringify(v.lastTurn?.reason)}`,
      );
    });
    const keys = opKeys(tvOps);
    const json = opsJson(tvOps);
    await Promise.all(phones.map((p) => p.canvas.until((v) => v.canvasTurn === tvOps.canvasTurn && opKeys(v) === keys, 10_000, `${p.name} canvas`)));
    for (const p of phones) expect(opsJson(p.canvas.view())).toBe(json);

    for (const [k, p] of wave2.entries()) {
      await at(performance.now(), k === 0 ? 0 : 20);
      right(p);
    }
    const r = await tv.until((v) => v.phase === "reveal" && v.lastTurn?.turn === turn, 15_000, `turn ${turn} reveal`);
    current = null;
    const last = r.lastTurn;
    if (!last) throw new Error("no lastTurn");
    expect(last.reason).toBe("all-guessed");
    expect(last.word).toBe(word);
    expect(Object.keys(last.gains).sort()).toEqual(phones.map((p) => p.id).sort());
    expect(last.gains[drawer.id]).toBe(300);
    for (const p of guessers) expect(last.gains[p.id], `${p.name} gain = its feed points`).toBe(correctPoints.get(`${turn}:${p.id}`));
    // Team gains are the sum of their members' gains.
    for (const t of r.teams) {
      const sum = phones.filter((p) => teamOf.get(p.id) === t.id).reduce((s, p) => s + (last.gains[p.id] ?? 0), 0);
      expect(last.teamGains[t.id] ?? 0, `team ${t.id} gains`).toBe(sum);
      teamTotals.set(t.id, (teamTotals.get(t.id) ?? 0) + sum);
    }
    expect(total(last.teamGains)).toBe(total(last.gains));
    for (const p of phones) playerTotals.set(p.id, (playerTotals.get(p.id) ?? 0) + (last.gains[p.id] ?? 0));
    for (const p of phones) expect(seat(r, p.id)?.score).toBe(playerTotals.get(p.id));
    for (const t of r.teams) {
      expect(t.score).toBe(teamTotals.get(t.id));
      expect(t.score).toBe(r.players.filter((p) => p.team === t.id).reduce((s, p) => s + p.score, 0));
    }
    // Private notices: every guesser saw "close" then "correct"; the drawer none.
    for (const p of guessers) expect(notices.get(p.id), `${p.name} notices`).toEqual(["close", "correct"]);
    expect(notices.get(drawer.id)).toBeUndefined();
    host.send("SKIP", {}); // past the reveal
  }

  const podium = await tv.until((v) => v.phase === "podium", 20_000, "podium");
  expect(drawingTeams).toEqual(dealt.teams.map((t) => t.id));
  for (const t of podium.teams) expect(t.score).toBe(teamTotals.get(t.id) ?? 0);

  // Every wrong and right guess reached the TV feed; every stroke reached the TV.
  const guessesSent = [...sent.keys()].filter((k) => !k.startsWith("s:")).length;
  expect(feedLatency.length, "guesses seen in the TV feed").toBe(guessesSent);
  expect(strokeLatency.length).toBe(STROKE_CHUNKS * streamedTurns);
  expect(leaks).toEqual([]);
  const errors = [...phones.flatMap((p) => [...p.errors, ...p.canvas.errors]), ...tv.errors];
  expect(errors).toEqual([]);
  expect(meter.stats.dropped, "sockets dropped").toBe(0);
  expect(meter.stats.opened, "sockets opened (no reconnects)").toBe(1 + 2 * n);

  const s = meter.stats;
  const secs = (performance.now() - t0Run) / 1000;
  process.stdout.write(
    `${[
      `load ${n} phones, ${streamedTurns} streamed turns, ${secs.toFixed(1)} s`,
      `  join          p50 ${ms(percentile(joinMs, 50))}  p95 ${ms(percentile(joinMs, 95))}  max ${ms(Math.max(...joinMs))}`,
      `  guess→TV feed p50 ${ms(percentile(feedLatency, 50))}  p95 ${ms(percentile(feedLatency, 95))}  max ${ms(Math.max(...feedLatency))}  (${feedLatency.length})`,
      `  stroke→TV op  p50 ${ms(percentile(strokeLatency, 50))}  p95 ${ms(percentile(strokeLatency, 95))}  max ${ms(Math.max(...strokeLatency))}  (${strokeLatency.length})`,
      `  bytes in ${kb(s.bytesIn)} (${s.framesIn} frames): TV ${kb(s.bytesInBy.tv)}, per phone player ${kb(s.bytesInBy.player / n)}, per phone canvas ${kb(s.bytesInBy.canvas / n)}`,
      `  bytes out ${kb(s.bytesOut)} (${s.framesOut} frames)`,
    ].join("\n")}\n`,
  );
  expect(percentile(feedLatency, 95)).toBeLessThan(1000);
  expect(percentile(strokeLatency, 95)).toBeLessThan(500);
}

describe.skipIf(!RUN)("load: one room, a TV and many phones, teams of 6", () => {
  it("40 phones: a whole round, every team's drawer streams", () => noteReloads(() => loadRun(40, Number(process.env.LOAD_TURNS_40 ?? TEAMS))), 240_000);
  it("60 phones", () => noteReloads(() => loadRun(60, Number(process.env.LOAD_TURNS_60 ?? 3))), 240_000);
});
