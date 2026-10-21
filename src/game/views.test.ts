import { describe, expect, it } from "vitest";
import { CanvasViewSchema, PlayerViewSchema, TvViewSchema } from "../shared/protocol";
import { tick } from "./clock";
import { T0, deps, drawerOf, lobby, must } from "./testkit";
import { canvasView, playerView, publicView, tvView } from "./views";

const drawing = () => {
  const s = must(lobby(["a", "b", "c"]), "a", { type: "START" });
  return must(s, drawerOf(s), { type: "PICK", index: 1 }); // rainbow
};

describe("views", () => {
  it("every view parses against its wire schema", () => {
    const s = must(drawing(), "a", { type: "STROKE", stroke: 1, color: 2, size: 1, pts: [1, 2, 3, 4] });
    expect(() => TvViewSchema.parse(tvView(s))).not.toThrow();
    expect(() => CanvasViewSchema.parse(canvasView(s))).not.toThrow();
    expect(() => PlayerViewSchema.parse(playerView(s, "b"))).not.toThrow();
  });

  it("guessers see the mask, never the word; the drawer sees the word", () => {
    const s = drawing();
    expect(publicView(s).mask).toBe("_______");
    expect(JSON.stringify(playerView(s, "b"))).not.toContain("rainbow");
    expect(JSON.stringify(tvView(s))).not.toContain("rainbow");
    expect(playerView(s, "a").me).toMatchObject({ isDrawer: true, word: "rainbow", isHost: true });
  });

  it("the drawer sees their choices while picking; nobody else does", () => {
    const s = must(lobby(["a", "b"]), "a", { type: "START" });
    expect(playerView(s, "a").me.choices).toHaveLength(3);
    expect(playerView(s, "b").me.choices).toEqual([]);
    expect(JSON.stringify(tvView(s))).not.toContain("rainbow");
  });

  it("after a correct guess that player sees the word, the score moves live, the feed hides the word", () => {
    const s = must(drawing(), "b", { type: "GUESS", text: "rainbow" }, T0 + 1000);
    const b = playerView(s, "b");
    expect(b.me).toMatchObject({ guessed: true, word: "rainbow", notice: { kind: "correct" } });
    expect(b.players.find((p) => p.id === "b")).toMatchObject({ guessed: true });
    expect(b.players.find((p) => p.id === "b")?.score).toBeGreaterThan(0);
    expect(playerView(s, "c").me.word).toBe("");
    expect(playerView(s, "c").me.notice).toBeNull();
    expect(JSON.stringify(tvView(s).feed)).not.toContain("rainbow");
  });

  it("hints show in the mask as they come", () => {
    const s = tick(drawing(), deps(T0 + 28_000));
    expect(publicView(s).mask.replace(/_/g, "")).toHaveLength(1);
  });

  it("canvas ops are only in the TV and canvas views", () => {
    const s = must(drawing(), "a", { type: "STROKE", stroke: 1, color: 2, size: 1, pts: [1, 2, 3, 4] });
    expect(Object.keys(tvView(s).ops)).toEqual(["000001"]);
    expect(canvasView(s)).toMatchObject({ phase: "drawing", drawerId: "a", canvasTurn: 1 });
    expect("ops" in playerView(s, "b")).toBe(false);
  });

  it("teams mode lists the teams with summed scores and the drawing team", () => {
    let s = must(lobby(["a", "b", "c", "d"]), "a", { type: "SETTINGS", mode: "teams" });
    s = must(s, "a", { type: "START" });
    const v = publicView(s);
    expect(v.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(v.drawingTeam).toBe("t0");
    expect(publicView(lobby(["a"])).teams).toEqual([]);
  });

  it("the public part is computed once per state", () => {
    const s = drawing();
    expect(publicView(s)).toBe(publicView(s));
  });
});
