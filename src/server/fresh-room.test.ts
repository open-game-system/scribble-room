import { describe, expect, it } from "vitest";
import { createFreshRoom } from "./fresh-room";

/** A fake namespace: rooms that already exist keep their first TV id (spawn is idempotent). */
function fakeRooms(existing: Record<string, string>) {
  const rooms = new Map(Object.entries(existing));
  return {
    rooms,
    spawn: async (code: string, tvId: string) => {
      if (!rooms.has(code)) rooms.set(code, tvId);
    },
    isTv: async (code: string, tvId: string) => rooms.get(code) === tvId,
  };
}

describe("createFreshRoom", () => {
  it("skips a code that already belongs to another room", async () => {
    const f = fakeRooms({ BCDF: "tv-old" });
    const codes = ["BCDF", "GHJK"];
    const r = await createFreshRoom({ newCode: () => codes.shift() ?? "ZZZZ", newTvId: () => "tv-new", spawn: f.spawn, isTv: f.isTv });
    expect(r).toEqual({ code: "GHJK", tvId: "tv-new" });
    expect(f.rooms.get("BCDF")).toBe("tv-old");
  });

  it("gives up after a few collisions instead of looping forever", async () => {
    const f = fakeRooms({ BCDF: "tv-old" });
    await expect(createFreshRoom({ newCode: () => "BCDF", newTvId: () => "tv-new", spawn: f.spawn, isTv: f.isTv })).rejects.toThrow(/no free room code/);
  });
});
