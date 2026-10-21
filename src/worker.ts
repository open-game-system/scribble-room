// The Worker: makes rooms, serves the TV and phone pages, seats phones (OGS token or guest name),
// and forwards signed WebSockets to the room's Durable Object.

import { createActorClass, withCallerIdentity } from "@actor-kit/worker";
import { verifyOgsToken } from "@open-game-system/profile-kit/server";
import { GAME } from "./config";
import { RoomContract } from "./room";
import { canvasIdFor } from "./room.views";
import { createFreshRoom } from "./server/fresh-room";
import { signId, verifyId } from "./server/identity";
import { JoinBodySchema, resolveSeat } from "./server/seat";

export const Room = createActorClass(RoomContract);

type RoomActor = InstanceType<typeof Room>;

export interface Env {
  ROOM: DurableObjectNamespace<RoomActor>;
  ASSETS: Fetcher;
  OGS_JWKS_URL: string;
  SESSION_SECRET: string;
}

const CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
const ROOM_CODE = /^[A-Z]{4}$/;

function newRoomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

const stubFor = (env: Env, code: string) => env.ROOM.get(env.ROOM.idFromName(code));

async function createRoom(env: Env): Promise<{ code: string; tvId: string }> {
  return createFreshRoom({
    newCode: newRoomCode,
    newTvId: () => `tv-${crypto.randomUUID()}`,
    spawn: async (code, tvId) => {
      await stubFor(env, code).spawn({ actorId: code, caller: "worker", callerType: "service", input: { code, tvId } });
    },
    isTv: async (code, tvId) => {
      const snap = await stubFor(env, code)
        .getSnapshot(tvId, "user")
        .catch(() => null);
      return snap?.role === "tv";
    },
  });
}

/** JSON safe to inline inside a <script> tag. */
const inlineJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

async function page(req: Request, env: Env, name: "tv" | "join", boot: unknown): Promise<Response> {
  const html = await (await env.ASSETS.fetch(new URL(`/${name}.html`, req.url))).text();
  return new Response(html.replace("<!--BOOT-->", `<script id="boot" type="application/json">${inlineJson(boot)}</script>`), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function tvPage(req: Request, env: Env, code: string): Promise<Response> {
  const tvId = new URL(req.url).searchParams.get("k") ?? "";
  const stub = stubFor(env, code);
  // The room must exist (asked as the Worker) before the key is checked: a caller with no role makes
  // getSnapshot throw, and a wrong key is "not this room's TV", not "no such room".
  const exists = await stub.getSnapshot("worker", "service").then(
    () => true,
    () => false,
  );
  if (!exists) return new Response("No room with that code.", { status: 404 });
  const snap = await stub.getSnapshot(tvId, "user").catch(() => null);
  if (snap?.role !== "tv") return new Response("This link isn't the TV for that room.", { status: 403 });
  return page(req, env, "tv", { code, id: tvId, sig: await signId(tvId, env.SESSION_SECRET), serverNow: Date.now(), snapshot: snap.snapshot });
}

async function joinPage(req: Request, env: Env, code: string): Promise<Response> {
  const url = new URL(req.url);
  const snap = await stubFor(env, code)
    .getSnapshot("worker", "service")
    .catch(() => null);
  if (!snap) return new Response("No room with that code. Check the code on the TV.", { status: 404 });
  const tv = url.searchParams.get("tv");
  const tvUrl = tv ? new URL(`/tv/${code}?k=${encodeURIComponent(tv)}`, url).toString() : null;
  return page(req, env, "join", { code, tvUrl, serverNow: Date.now() });
}

async function join(req: Request, env: Env, code: string): Promise<Response> {
  const parsed = JoinBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad-request" }, { status: 400 });
  const body = parsed.data;
  const claims = body.token ? await verifyOgsToken(body.token, { appId: GAME.appId, jwksUrl: env.OGS_JWKS_URL }) : null;
  const r = await resolveSeat({
    claims,
    body,
    sigOk: (id, sig) => verifyId(id, sig, env.SESSION_SECRET),
    newId: () => `g-${crypto.randomUUID()}`,
  });
  if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  const stub = stubFor(env, code);
  const sent = await stub.send("worker", "service", { type: "ADMIT", ...r.seat }).catch(() => ({ ok: false }));
  if (!sent.ok) return Response.json({ error: "no-room" }, { status: 404 });
  const canvasId = canvasIdFor(r.seat.id);
  const [snap, canvasSnap] = await Promise.all([stub.getSnapshot(r.seat.id, "user"), stub.getSnapshot(canvasId, "user")]);
  return Response.json({
    id: r.seat.id,
    sig: await signId(r.seat.id, env.SESSION_SECRET),
    name: r.seat.name,
    serverNow: Date.now(),
    snapshot: snap.snapshot,
    canvas: { id: canvasId, sig: await signId(canvasId, env.SESSION_SECRET), snapshot: canvasSnap.snapshot },
  });
}

async function socket(req: Request, env: Env, code: string): Promise<Response> {
  if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  if (!(await verifyId(id, sig, env.SESSION_SECRET))) return new Response("Forbidden", { status: 403 });
  // Binary views: the contract's view schemas encode each frame; deltas carry only what changed.
  return stubFor(env, code).fetch(withCallerIdentity(req, { callerId: id, callerType: "user", supportsBinary: true }));
}

/** OGS names the couch's room (ogsRoom): this phone joins it rather than making a new one. */
function ogsRoom(url: URL): string | null {
  const room = url.searchParams.get("ogsRoom")?.toUpperCase() ?? "";
  return ROOM_CODE.test(room) ? room : null;
}

async function newRoomRedirect(url: URL, env: Env): Promise<Response> {
  const couch = ogsRoom(url);
  if (couch) return Response.redirect(new URL(`/join/${couch}`, url).toString(), 302);
  const { code, tvId } = await createRoom(env);
  // "/" in a plain browser is a TV; "/host" is a phone (the OGS start page) that hosts a room.
  const to = url.pathname === "/" ? `/tv/${code}?k=${tvId}` : `/join/${code}?tv=${tvId}`;
  return Response.redirect(new URL(to, url).toString(), 302);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/host") return newRoomRedirect(url, env);
    const [, head, rawCode, tail] = url.pathname.split("/");
    const code = rawCode?.toUpperCase() ?? "";
    if (!ROOM_CODE.test(code)) return env.ASSETS.fetch(req);
    if (head === "tv") return tvPage(req, env, code);
    if (head === "join") return joinPage(req, env, code);
    if (head === "api" && tail === "join" && req.method === "POST") return join(req, env, code);
    if (head === "api" && tail === "ws") return socket(req, env, code);
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
