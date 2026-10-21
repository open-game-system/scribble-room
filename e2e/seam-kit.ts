// Shared bits for the system-boundary tests (teams, reconnect, OGS phone, load): turn helpers on top of
// ws-client, a passive watcher for a socket's every update, percentiles, and a WebSocket meter.
import { readFileSync } from "node:fs";
import type { PlayerView, TvView } from "../src/shared/protocol";
import type { Phone, Socket, TvClient } from "./ws-client";

/** Calls `fn` with the current view and every update until the returned stop() is called. */
export function watch<V>(s: Socket<V>, fn: (v: V) => void): () => void {
  let stopped = false;
  s.until(
    (v) => {
      if (stopped) return true;
      fn(v);
      return false;
    },
    30 * 60_000,
    "watch",
  ).catch(() => undefined);
  return () => {
    stopped = true;
  };
}

export const seat = (v: TvView | PlayerView, id: string) => v.players.find((p) => p.id === id);

export const connectedCount = (v: TvView) => v.players.filter((p) => p.connected).length;

/** The phone the TV says is drawing now. */
export function drawerOf(tv: TvClient, phones: readonly Phone[]): Phone {
  const id = tv.view().drawerId;
  const p = phones.find((x) => x.id === id);
  if (!p) throw new Error(`drawer ${id} is not one of the test's phones`);
  return p;
}

/** Waits for turn `turn`'s picking on the TV, has its drawer pick `index`, and returns the drawer and word. */
export async function pickTurn(tv: TvClient, phones: readonly Phone[], turn: number, index = 0, ms = 20_000): Promise<{ drawer: Phone; word: string }> {
  await tv.until((v) => v.phase === "picking" && v.turn === turn, ms, `turn ${turn} picking`);
  const drawer = drawerOf(tv, phones);
  await drawer.until((v) => v.phase === "picking" && v.turn === turn && v.me.choices.length === 3, 10_000, `turn ${turn} choices`);
  drawer.send("PICK", { index });
  const v = await drawer.until((x) => x.phase === "drawing" && x.turn === turn && x.me.word !== "", 10_000, `turn ${turn} drawing`);
  await tv.until((x) => x.phase === "drawing" && x.turn === turn, 10_000, `tv turn ${turn} drawing`);
  return { drawer, word: v.me.word };
}

/** A guess the room judges "close" (a plural/singular of the word), never the word itself. */
export const closeGuess = (word: string): string => `${word}s`;

/** The op keys of a canvas, in render order. */
export const opKeys = (v: { ops: Record<string, unknown> }): string => Object.keys(v.ops).sort().join(",");

/** The ops in key order, as one comparable string (field order normalised: a snapshot and deltas differ). */
export const opsJson = (v: { ops: Record<string, object> }): string =>
  JSON.stringify(
    Object.keys(v.ops)
      .sort()
      .map((k) => [k, Object.entries(v.ops[k] ?? {}).sort(([a], [b]) => a.localeCompare(b))]),
  );

/** Sum of the values of a record (gains). */
export const total = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);

export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return Number.NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i] ?? Number.NaN;
}

export const ms = (x: number) => `${Math.round(x)} ms`;

export type SocketKind = "tv" | "player" | "canvas";
export type WireStats = {
  opened: number;
  bytesIn: number;
  bytesOut: number;
  framesIn: number;
  framesOut: number;
  dropped: number;
  bytesInBy: Record<SocketKind, number>;
  framesInBy: Record<SocketKind, number>;
};

function kindOf(url: string | URL): SocketKind {
  const id = new URL(String(url)).searchParams.get("id") ?? "";
  return id.startsWith("tv-") ? "tv" : id.startsWith("cv-") ? "canvas" : "player";
}

/**
 * Meters every WebSocket the actor-kit client opens from now on (it reads the global WebSocket at connect
 * time): bytes and frames each way, and closes we didn't ask for (`dropped`). Returns the live stats and
 * an uninstall function.
 */
export function meterWebSockets(): { stats: WireStats; uninstall(): void } {
  const stats: WireStats = {
    opened: 0,
    bytesIn: 0,
    bytesOut: 0,
    framesIn: 0,
    framesOut: 0,
    dropped: 0,
    bytesInBy: { tv: 0, player: 0, canvas: 0 },
    framesInBy: { tv: 0, player: 0, canvas: 0 },
  };
  const Base = globalThis.WebSocket;
  const sizeOf = (d: unknown): number =>
    d instanceof ArrayBuffer ? d.byteLength : ArrayBuffer.isView(d) ? d.byteLength : typeof d === "string" ? Buffer.byteLength(d) : 0;
  class Metered extends Base {
    #closing = false;
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      stats.opened++;
      const kind = kindOf(url);
      this.addEventListener("message", (e: MessageEvent<unknown>) => {
        const n = sizeOf(e.data);
        stats.framesIn++;
        stats.bytesIn += n;
        stats.framesInBy[kind]++;
        stats.bytesInBy[kind] += n;
      });
      this.addEventListener("close", () => {
        if (!this.#closing) stats.dropped++;
      });
    }
    override send(data: string | Blob | BufferSource): void {
      stats.framesOut++;
      stats.bytesOut += sizeOf(data);
      super.send(data);
    }
    override close(code?: number, reason?: string): void {
      this.#closing = true;
      super.close(code, reason);
    }
  }
  globalThis.WebSocket = Metered;
  return {
    stats,
    uninstall: () => {
      globalThis.WebSocket = Base;
    },
  };
}

export const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

/**
 * How many times wrangler dev has reloaded the Worker (scripts/seam.sh logs to .wrangler/seam-dev.log).
 * wrangler rebuilds on any edit under src/, which restarts the room and drops every socket: a test that
 * sees a drop can say whether a reload caused it.
 */
export function serverReloads(): number {
  try {
    return (readFileSync(new URL("../.wrangler/seam-dev.log", import.meta.url), "utf8").match(/Reloading local server/g) ?? []).length;
  } catch {
    return 0;
  }
}

/** Runs `body`; if it fails and wrangler reloaded meanwhile, the error says so (a reload drops every socket). */
export async function noteReloads<T>(body: () => Promise<T>): Promise<T> {
  const before = serverReloads();
  try {
    return await body();
  } catch (e) {
    const n = serverReloads() - before;
    if (n > 0 && e instanceof Error) e.message += ` [wrangler dev reloaded ${n}x during this test: an edit under src/ restarted the room]`;
    throw e;
  }
}
