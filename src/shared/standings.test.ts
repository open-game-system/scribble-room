import { describe, expect, it } from "vitest";
import { leader, placeOf, rank } from "./standings";

const p = (id: string, score: number, name = id.toUpperCase()) => ({ id, name, score });

describe("rank", () => {
  it("sorts by score, high first, and shares a place on a tie (1, 2, 2, 4)", () => {
    const r = rank([p("a", 10), p("b", 30), p("c", 10), p("d", 5)], "list");
    expect(r.map((x) => [x.item.id, x.place])).toEqual([["b", 1], ["a", 2], ["c", 2], ["d", 4]]);
  });

  it("'list' keeps the given order among ties", () => {
    const r = rank([p("z", 10, "Zed"), p("a", 10, "Ann"), p("m", 10, "Max")], "list");
    expect(r.map((x) => x.item.id)).toEqual(["z", "a", "m"]);
    expect(r.map((x) => x.place)).toEqual([1, 1, 1]);
  });

  it("'name' orders ties alphabetically", () => {
    const r = rank([p("z", 10, "Zed"), p("a", 10, "Ann"), p("m", 10, "Max")], "name");
    expect(r.map((x) => x.item.id)).toEqual(["a", "m", "z"]);
  });

  it("ranks by a given score (e.g. before this turn's gains) and shares places on that score", () => {
    const gains: Record<string, number> = { a: 20, b: 0 };
    const r = rank([p("a", 30), p("b", 10)], "list", (x) => x.score - (gains[x.id] ?? 0));
    expect(r.map((x) => [x.item.id, x.place])).toEqual([["a", 1], ["b", 1]]);
  });

  it("is empty for nobody and never mutates its input", () => {
    expect(rank([], "name")).toEqual([]);
    const items = [p("a", 1), p("b", 2)];
    rank(items, "name");
    expect(items.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("placeOf", () => {
  it("is a player's shared place, or null when they are not in the list", () => {
    const items = [p("a", 10), p("b", 30), p("c", 10)];
    expect(placeOf(items, "c", "name")).toBe(2);
    expect(placeOf(items, "b", "list")).toBe(1);
    expect(placeOf(items, "zz", "name")).toBeNull();
  });
});

describe("leader", () => {
  it("is the top item under the tie-break, or null when empty", () => {
    const tied = [p("t2", 50, "Plum"), p("t1", 50, "Teal")];
    expect(leader(tied, "list")?.id).toBe("t2");
    expect(leader(tied, "name")?.id).toBe("t2");
    expect(leader([p("t1", 50, "Teal"), p("t2", 50, "Plum")], "list")?.id).toBe("t1");
    expect(leader([p("t1", 50, "Teal"), p("t2", 50, "Plum")], "name")?.id).toBe("t2");
    expect(leader([], "list")).toBeNull();
  });
});
