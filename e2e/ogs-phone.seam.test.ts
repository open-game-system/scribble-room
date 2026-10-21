// The OGS phone path at the wire: a signed OGS game token seats the phone under its profile (whatever
// name it typed), anything else falls back to a guest, a guest can never take an OGS seat, and the OGS
// entry URLs (/host, ?ogsRoom=) land on the right room.
import WebSocket from "ws";
import { describe, expect, it } from "vitest";
import { JoinBootZ, JoinResponseZ } from "../src/shared/boot";
import { socketPath } from "../src/shared/protocol";
import { gameClaims, ogsTestKey } from "../src/test/ogsTestKeys";
import { ogsSeamKey } from "./ogs-jwks";
import { noteReloads, seat } from "./seam-kit";
import { BASE, createRoom, join } from "./ws-client";

const SAM = { id: "p1", handle: "sam", name: "Sam" };

async function token(claims: Record<string, unknown> = gameClaims("scribble-room", SAM)): Promise<string> {
  return (await ogsSeamKey()).sign(claims);
}

/** POST /api/:code/join, raw. */
async function postJoin(code: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/${code}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json: unknown = await res.json();
  return { status: res.status, json };
}

const seated = async (code: string, body: Record<string, unknown>) => JoinResponseZ.parse((await postJoin(code, body)).json);

/** The HTTP status a socket upgrade gets (101 when it opens). */
function upgradeStatus(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(new URL(path, BASE.replace(/^http/, "ws")).toString(), ["actor-kit.v1"]);
    ws.on("open", () => {
      ws.close();
      resolve(101);
    });
    ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
    ws.on("error", reject);
  });
}

const bootOf = (html: string): unknown => JSON.parse(/<script id="boot" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "null");

describe("OGS phones over the wire", () => {
  it("a signed OGS token seats the phone under the profile's name and avatar, whatever it typed", () =>
    noteReloads(async () => {
      const { code, tv } = await createRoom();
      const sam = await join(code, "typed name", { token: await token() });
      expect(sam.id).toBe("o-p1");
      expect(sam.name).toBe("Sam");
      const v = await tv.until((x) => seat(x, "o-p1")?.connected === true, 5000, "sam seated");
      expect(seat(v, "o-p1")).toMatchObject({ name: "Sam", avatar: gameClaims("scribble-room", SAM).avatar });
      expect(sam.view().me).toMatchObject({ id: "o-p1", isHost: true });

      // The same profile again (another launch, a renamed profile): the same seat, renamed; no second seat.
      sam.close();
      const again = await join(code, "", { token: await token(gameClaims("scribble-room", { ...SAM, name: "Samantha" })) });
      expect(again.id).toBe("o-p1");
      const v2 = await tv.until((x) => seat(x, "o-p1")?.name === "Samantha" && seat(x, "o-p1")?.connected === true, 5000, "renamed");
      expect(v2.players).toHaveLength(1);
      again.close();
      tv.close();
    }));

  it("a token for another game, an expired one, one signed by an unknown key or garbage: a guest seat with the typed name", () =>
    noteReloads(async () => {
      const { code, tv } = await createRoom();
      const now = Math.floor(Date.now() / 1000);
      const stranger = await ogsTestKey("not-ogs");
      const bad = [
        await token(gameClaims("rocket-crew", SAM)),
        await token({ ...gameClaims("scribble-room", SAM), iat: now - 7200, exp: now - 60 }),
        await stranger.sign(gameClaims("scribble-room", SAM)),
        "not.a.token",
      ];
      for (const [i, t] of bad.entries()) {
        const p = await seated(code, { name: `Guest ${i}`, token: t });
        expect(p.id, `token ${i}`).toMatch(/^g-/);
        expect(p.name).toBe(`Guest ${i}`);
      }
      const v = await tv.until((x) => x.players.length === 4, 5000, "four guests");
      expect(v.players.every((p) => p.id.startsWith("g-") && p.avatar === "")).toBe(true);

      // A bad token and no name: nothing to seat.
      const none = await postJoin(code, { token: bad[0] });
      expect(none).toMatchObject({ status: 400, json: { error: "name-required" } });
      tv.close();
    }));

  it("a guest can't take an OGS seat or another guest's seat, and a socket needs its own signature", () =>
    noteReloads(async () => {
      const { code, tv } = await createRoom();
      const sam = await seated(code, { token: await token() });
      const ann = await seated(code, { name: "Ann" });

      // Sam's own signature on Sam's OGS id, without the token: a new guest, not Sam.
      const thief = await seated(code, { name: "Mallory", id: sam.id, sig: sam.sig });
      expect(thief.id).toMatch(/^g-/);
      expect(thief.id).not.toBe(sam.id);
      // A guest id with a signature that isn't its own: a new guest.
      const forged = await seated(code, { name: "Mallory", id: ann.id, sig: thief.sig });
      expect(forged.id).not.toBe(ann.id);
      // Ann's real signature keeps Ann's seat (a refresh).
      expect((await seated(code, { name: "Ann", id: ann.id, sig: ann.sig })).id).toBe(ann.id);

      const v = await tv.until((x) => x.players.length === 4, 5000, "four seats");
      expect(seat(v, sam.id)?.name).toBe("Sam");
      expect(seat(v, ann.id)?.name).toBe("Ann");

      expect(await upgradeStatus(socketPath(code, sam.id, thief.sig))).toBe(403);
      expect(await upgradeStatus(socketPath(code, sam.id, sam.sig))).toBe(101);
      tv.close();
    }));

  it("/host makes a room for the OGS start phone; ?ogsRoom= joins the couch's room instead", () =>
    noteReloads(async () => {
      const host = await fetch(`${BASE}/host`, { redirect: "manual" });
      expect(host.status).toBe(302);
      const to = new URL(host.headers.get("location") ?? "", BASE);
      const code = /^\/join\/([A-Z]{4})$/.exec(to.pathname)?.[1] ?? "";
      expect(code).toMatch(/^[A-Z]{4}$/);
      const tvId = to.searchParams.get("tv") ?? "";
      expect(tvId).toMatch(/^tv-/);

      // The join page knows its TV (the OGS launcher frames it); that TV page is the room's TV.
      const boot = JoinBootZ.parse(bootOf(await (await fetch(to)).text()));
      expect(boot.code).toBe(code);
      expect(boot.tvUrl).toBe(new URL(`/tv/${code}?k=${tvId}`, BASE).toString());
      expect((await fetch(boot.tvUrl ?? "")).status).toBe(200);

      // The start phone (OGS token) hosts it.
      const sam = await join(code, "", { token: await token() });
      await sam.until((v) => v.me.isHost, 5000, "sam hosts");

      // Couch phones following the TV: /host or / with ogsRoom (any case) go to that room's join page.
      for (const path of [`/host?ogsRoom=${code}`, `/?ogsRoom=${code.toLowerCase()}`]) {
        const r = await fetch(`${BASE}${path}`, { redirect: "manual" });
        expect(r.status, path).toBe(302);
        expect(new URL(r.headers.get("location") ?? "", BASE).toString()).toBe(new URL(`/join/${code}`, BASE).toString());
      }
      // A malformed ogsRoom is ignored: a fresh room as usual.
      const odd = await fetch(`${BASE}/?ogsRoom=AB1`, { redirect: "manual" });
      expect(odd.headers.get("location") ?? "").toMatch(/\/tv\/[A-Z]{4}\?k=tv-/);
      expect((await fetch(`${BASE}/join/AAAA`)).status).toBe(404);
      sam.close();
    }));

  // src/worker.ts tvPage means a wrong key to answer 403 "This link isn't the TV for that room.", but
  // getSnapshot throws for a caller with no role, so it answers 404 "No room with that code." instead.
  it("a TV link with the wrong key is refused as not this room's TV (403), not as a missing room", () =>
    noteReloads(async () => {
      const { code, tv } = await createRoom();
      const wrong = await fetch(new URL(`/tv/${code}?k=tv-wrong`, BASE));
      expect(wrong.status).toBe(403);
      expect(await wrong.text()).toContain("isn't the TV");
      tv.close();
    }));
});
