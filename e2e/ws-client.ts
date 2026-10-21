// Protocol-level clients for seam/load tests: a TV and phones over real WebSockets against wrangler dev,
// decoding binary views with the protocol's schemas (the same path the pages use).
import { createActorClient } from "@actor-kit/client";
import type { FieldDescriptor, Infer, SchemaDefinition } from "@actor-kit/core";
import type { z } from "zod";
import { JoinResponseZ, TvBootZ } from "../src/shared/boot";
import type { Msg, MsgType } from "../src/shared/messages";
import { type CanvasView, CanvasViewSchema, type PlayerView, PlayerViewSchema, type TvView, TvViewSchema, socketPath } from "../src/shared/protocol";

export const BASE = process.env.GAME_URL ?? "http://localhost:8872";
const HOST = new URL(BASE).host;

export type OutMsg = { [K in MsgType]: { type: K } & z.input<(typeof Msg)[K]> }[MsgType];
type Payload<K extends MsgType> = z.input<(typeof Msg)[K]>;

export type Socket<V> = {
  view(): V;
  /** Resolves once `pred(view)` holds (checked on every update), or rejects after `ms`. */
  until(pred: (v: V) => boolean, ms?: number, what?: string): Promise<V>;
  errors: { messageType: string; code: string }[];
  close(): void;
};

function open<T extends Record<string, FieldDescriptor>>(schema: SchemaDefinition<T>, path: string, initial: unknown) {
  const errors: { messageType: string; code: string }[] = [];
  const client = createActorClient<T, OutMsg>({
    path,
    host: HOST,
    initialView: schema.parse(initial),
    viewSchema: schema,
    onError: (e) => errors.push({ messageType: e.messageType, code: e.code }),
  });
  client.connect();
  const until = (pred: (v: Infer<SchemaDefinition<T>>) => boolean, ms = 10_000, what = "condition") =>
    new Promise<Infer<SchemaDefinition<T>>>((resolve, reject) => {
      if (pred(client.view)) return resolve(client.view);
      const timer = setTimeout(() => {
        off();
        reject(new Error(`timed out waiting for ${what}`));
      }, ms);
      const off = client.subscribe((v) => {
        if (!pred(v)) return;
        clearTimeout(timer);
        off();
        resolve(v);
      });
    });
  const socket: Socket<Infer<SchemaDefinition<T>>> = { view: () => client.view, until, errors, close: () => client.disconnect() };
  return { client, socket };
}

/** The boot JSON a page inlines (`<script id="boot">`). */
function bootOf(html: string): unknown {
  const m = /<script id="boot" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m?.[1]) throw new Error("no boot payload in page");
  return JSON.parse(m[1]);
}

export type TvClient = Socket<TvView>;

/** Opens `/` like a TV browser: a new room; connects the TV socket. */
export async function createRoom(): Promise<{ code: string; tvId: string; tvUrl: string; tv: TvClient }> {
  const res = await fetch(`${BASE}/`, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  const m = /\/tv\/([A-Z]{4})\?k=([^&]+)/.exec(location);
  if (!m?.[1] || !m[2]) throw new Error(`no TV redirect: ${res.status} ${location}`);
  const tvUrl = new URL(location, BASE).toString();
  return { code: m[1], tvId: decodeURIComponent(m[2]), tvUrl, tv: await openTv(tvUrl) };
}

/** Loads a TV page (also a TV refresh) and connects its socket. */
export async function openTv(tvUrl: string): Promise<TvClient> {
  const boot = TvBootZ.parse(bootOf(await (await fetch(tvUrl)).text()));
  return open(TvViewSchema, socketPath(boot.code, boot.id, boot.sig), boot.snapshot).socket;
}

export type Phone = Socket<PlayerView> & {
  id: string;
  sig: string;
  name: string;
  send<K extends MsgType>(type: K, payload: Payload<K>): void;
  canvas: Socket<CanvasView>;
};

/** POST /api/:code/join as a guest (or as `again` to keep a seat), then the player and canvas sockets. */
export async function join(code: string, name: string, again?: { id: string; sig: string } | { token: string }): Promise<Phone> {
  const res = await fetch(`${BASE}/api/${code}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...again }),
  });
  if (!res.ok) throw new Error(`join failed: ${res.status} ${await res.text()}`);
  const j = JoinResponseZ.parse(await res.json());
  const player = open(PlayerViewSchema, socketPath(code, j.id, j.sig), j.snapshot);
  const canvas = open(CanvasViewSchema, socketPath(code, j.canvas.id, j.canvas.sig), j.canvas.snapshot).socket;
  return {
    ...player.socket,
    id: j.id,
    sig: j.sig,
    name: j.name,
    canvas,
    send: (type, payload) => player.client.trigger(type, payload),
    close: () => {
      player.socket.close();
      canvas.close();
    },
  };
}
