import { describe, expect, it } from "vitest";
import { JoinBodySchema, resolveSeat } from "./seat";

const claims = { sub: "p1", name: "Sam", avatar: "https://x/a.png" };
const yes = async () => true;
const no = async () => false;
const newId = () => "g-new";

describe("resolveSeat", () => {
  it("an OGS player is seated under the verified profile, whatever name they typed", async () => {
    expect(await resolveSeat({ claims, body: { name: "Hacker" }, sigOk: no, newId })).toEqual({
      ok: true,
      seat: { id: "o-p1", name: "Sam", avatar: "https://x/a.png" },
    });
  });

  it("a guest gets a new id, or keeps theirs when the signature checks out", async () => {
    expect(await resolveSeat({ claims: null, body: { name: " Ana " }, sigOk: no, newId })).toEqual({
      ok: true,
      seat: { id: "g-new", name: "Ana", avatar: "" },
    });
    expect(await resolveSeat({ claims: null, body: { name: "Ana", id: "g-old", sig: "s" }, sigOk: yes, newId })).toMatchObject({
      seat: { id: "g-old" },
    });
    expect(await resolveSeat({ claims: null, body: { name: "Ana", id: "g-old", sig: "bad" }, sigOk: no, newId })).toMatchObject({
      seat: { id: "g-new" },
    });
  });

  it("a guest can never take an OGS player's id, even with a valid signature", async () => {
    expect(await resolveSeat({ claims: null, body: { name: "Ana", id: "o-p1", sig: "s" }, sigOk: yes, newId })).toMatchObject({
      seat: { id: "g-new" },
    });
  });

  it("a guest needs a name", async () => {
    expect(await resolveSeat({ claims: null, body: {}, sigOk: no, newId })).toEqual({ ok: false, error: "name-required" });
    expect(await resolveSeat({ claims: null, body: { name: "   " }, sigOk: no, newId })).toEqual({ ok: false, error: "name-required" });
  });

  it("the body is parsed at the boundary", () => {
    expect(JoinBodySchema.safeParse({ name: "x".repeat(200) }).success).toBe(false);
    expect(JoinBodySchema.safeParse({ token: 5 }).success).toBe(false);
    expect(JoinBodySchema.safeParse({}).success).toBe(true);
  });
});
