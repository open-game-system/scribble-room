// Teams mode over the wire: assignment in the lobby, rotation across rounds, the 80% hurry, the team
// leaderboard, a late joiner mid-turn, a drawer who drops (grace, then the turn ends) and a host who leaves.
import { describe, expect, it } from "vitest";
import type { TvView } from "../src/shared/protocol";
import { noteReloads, pickTurn, seat, total } from "./seam-kit";
import { type Phone, type TvClient, createRoom, join } from "./ws-client";

async function joinAll(code: string, names: string[]): Promise<Phone[]> {
  const out: Phone[] = [];
  for (const name of names) out.push(await join(code, name));
  return out;
}

async function connected(tv: TvClient, n: number) {
  await tv.until((v) => v.players.filter((p) => p.connected).length === n, 10_000, `${n} connected`);
}

const teamOf = (v: TvView, id: string) => seat(v, id)?.team ?? "";
const members = (v: TvView, team: string) => v.players.filter((p) => p.team === team).map((p) => p.id);

/** Host switches to teams (dealt round-robin in join order) with short draws, and starts. */
async function startTeams(tv: TvClient, host: Phone, teamCount: number, rounds: number) {
  host.send("SETTINGS", { mode: "teams", teamCount, rounds, drawSeconds: 40 });
  await tv.until((v) => v.settings.mode === "teams" && v.settings.teamCount === teamCount && v.settings.rounds === rounds, 5000, "teams settings");
  host.send("START", {});
}

/** The reveal of `turn`: team gains are the sums of their members' gains, team scores the sums of member scores. */
async function revealChecked(tv: TvClient, turn: number, ms = 10_000): Promise<TvView> {
  const r = await tv.until((v) => v.phase === "reveal" && v.lastTurn?.turn === turn, ms, `reveal ${turn}`);
  const last = r.lastTurn;
  if (!last) throw new Error("no lastTurn");
  for (const t of r.teams) {
    const sum = members(r, t.id).reduce((s, id) => s + (last.gains[id] ?? 0), 0);
    expect(last.teamGains[t.id] ?? 0, `team ${t.id} gains`).toBe(sum);
    expect(t.score, `team ${t.id} score`).toBe(r.players.filter((p) => p.team === t.id).reduce((s, p) => s + p.score, 0));
  }
  expect(total(last.teamGains)).toBe(total(last.gains));
  return r;
}

describe("teams mode over the wire", () => {
  it("lobby: ten players switch to teams, players move, the host shuffles onto more teams", () =>
    noteReloads(async () => {
      const { code, tv } = await createRoom();
      const phones = await joinAll(
        code,
        Array.from({ length: 10 }, (_, i) => `T${i}`),
      );
      await connected(tv, 10);
      const [host, second] = phones;
      if (!host || !second) throw new Error("phones");
      // Ten in the lobby: teams by default, its draw time, dealt t0/t1 in join order.
      const auto = await tv.until((v) => v.settings.mode === "teams", 5000, "auto teams");
      expect(auto.settings.drawSeconds).toBe(60);
      expect(phones.map((p) => teamOf(auto, p.id))).toEqual(phones.map((_, i) => (i % 2 === 0 ? "t0" : "t1")));
      expect(auto.teams.map((t) => t.id)).toEqual(["t0", "t1"]);

      // A player moves; a team that isn't in play is refused; only the host shuffles.
      second.send("JOIN_TEAM", { team: "t0" });
      await tv.until((v) => teamOf(v, second.id) === "t0", 5000, "moved to t0");
      second.send("JOIN_TEAM", { team: "t5" });
      await second.until((v) => v.me.notice?.kind === "bad-team", 5000, "bad-team notice");
      expect(teamOf(tv.view(), second.id)).toBe("t0");
      second.send("SHUFFLE_TEAMS", {});
      await second.until((v) => v.me.notice?.kind === "not-host", 5000, "not-host notice");

      host.send("SETTINGS", { teamCount: 3 });
      await tv.until((v) => v.settings.teamCount === 3 && v.teams.length === 3, 5000, "3 teams");
      host.send("SHUFFLE_TEAMS", {});
      const shuffled = await tv.until((v) => v.teams.every((t) => members(v, t.id).length >= 3), 5000, "shuffled onto 3 teams");
      expect(shuffled.teams.map((t) => members(shuffled, t.id).length).sort()).toEqual([3, 3, 4]);
      expect(shuffled.players.every((p) => ["t0", "t1", "t2"].includes(p.team))).toBe(true);

      for (const p of phones) p.close();
      tv.close();
    }), 60_000);

  it("each team draws once per round, the drawer rotates within the team, the 80% hurry, the leaderboard", () =>
    noteReloads(async () => {
      const { code, tv } = await createRoom();
      const phones = await joinAll(code, ["A", "B", "C", "D", "E", "F"]);
      const [a, b, c, d, e, f] = phones;
      if (!a || !b || !c || !d || !e || !f) throw new Error("phones");
      await connected(tv, 6);
      await startTeams(tv, a, 2, 2);
      const lobby = tv.view();
      expect(members(lobby, "t0")).toEqual([a.id, c.id, e.id]);
      expect(members(lobby, "t1")).toEqual([b.id, d.id, f.id]);

      const teamTotals = new Map<string, number>();
      const add = (r: TvView) => {
        for (const [t, g] of Object.entries(r.lastTurn?.teamGains ?? {})) teamTotals.set(t, (teamTotals.get(t) ?? 0) + g);
      };

      // Turn 1 (round 1, t0): A draws. 4 of 5 guessers get it → the clock drops to ≤ 10 s; F never does.
      const t1 = await pickTurn(tv, phones, 1);
      expect(t1.drawer).toBe(a);
      expect(tv.view()).toMatchObject({ round: 1, drawingTeam: "t0" });
      const full = tv.view().endsAt - tv.view().startedAt;
      expect(full).toBe(40_000);
      for (const p of [b, c, d]) p.send("GUESS", { text: t1.word });
      await tv.until((v) => v.players.filter((p) => p.guessed).length === 3, 5000, "3 guessed");
      expect(tv.view().endsAt - tv.view().startedAt).toBe(40_000); // 3 of 5 is under 80%: no hurry yet
      e.send("GUESS", { text: t1.word });
      const sentAt = Date.now();
      const hurried = await tv.until((v) => v.endsAt - v.startedAt < 40_000, 5000, "hurry");
      expect(hurried.endsAt).toBeGreaterThan(sentAt + 8_000);
      expect(hurried.endsAt).toBeLessThanOrEqual(Date.now() + 10_000);
      expect(f.view().me.word).toBe("");
      const r1 = await revealChecked(tv, 1, 15_000);
      expect(Date.now() - sentAt).toBeGreaterThan(8_000);
      expect(r1.lastTurn?.reason).toBe("time");
      expect(r1.lastTurn?.gains[a.id]).toBe(240); // 300 × 4/5
      expect(r1.lastTurn?.gains[f.id]).toBeUndefined();
      add(r1);
      a.send("SKIP", {}); // past the reveal

      // Turn 2 (round 1, t1): B draws; everyone else gets it.
      const t2 = await pickTurn(tv, phones, 2);
      expect(t2.drawer).toBe(b);
      expect(tv.view()).toMatchObject({ round: 1, drawingTeam: "t1" });
      for (const p of [a, c, d, e, f]) p.send("GUESS", { text: t2.word });
      const r2 = await revealChecked(tv, 2);
      expect(r2.lastTurn?.reason).toBe("all-guessed");
      add(r2);
      a.send("SKIP", {});

      // Round 2: the next member of each team draws (C for t0, D for t1).
      const t3 = await pickTurn(tv, phones, 3);
      expect(t3.drawer).toBe(c);
      expect(tv.view()).toMatchObject({ round: 2, drawingTeam: "t0" });
      for (const p of [a, b, d, e, f]) p.send("GUESS", { text: t3.word });
      add(await revealChecked(tv, 3));
      a.send("SKIP", {});
      const t4 = await pickTurn(tv, phones, 4);
      expect(t4.drawer).toBe(d);
      expect(tv.view()).toMatchObject({ round: 2, drawingTeam: "t1" });
      for (const p of [a, b, c, e, f]) p.send("GUESS", { text: t4.word });
      add(await revealChecked(tv, 4));
      a.send("SKIP", {});

      const podium = await tv.until((v) => v.phase === "podium", 10_000, "podium");
      for (const t of podium.teams) expect(t.score).toBe(teamTotals.get(t.id));
      expect(total(Object.fromEntries(teamTotals))).toBe(podium.players.reduce((s, p) => s + p.score, 0));

      for (const p of phones) p.close();
      tv.close();
    }), 90_000);

  it("a late joiner mid-turn lands on the smallest team and can guess the current word", () =>
    noteReloads(async () => {
      const { code, tv } = await createRoom();
      const phones = await joinAll(code, ["A", "B", "C", "D", "E"]);
      const [a, b, c, d, e] = phones;
      if (!a || !b || !c || !d || !e) throw new Error("phones");
      await connected(tv, 5);
      await startTeams(tv, a, 2, 1);
      const { word } = await pickTurn(tv, phones, 1);
      expect(members(tv.view(), "t1")).toHaveLength(2);

      const g = await join(code, "Gil");
      await tv.until((v) => seat(v, g.id)?.connected === true, 5000, "gil connected");
      expect(teamOf(tv.view(), g.id)).toBe("t1");
      const gv = await g.until((v) => v.phase === "drawing", 5000, "gil sees the drawing");
      expect(gv.me).toMatchObject({ isDrawer: false, guessed: false, word: "" });
      expect(gv.mask).toHaveLength(word.length);

      g.send("GUESS", { text: word });
      const got = await g.until((v) => v.me.guessed, 5000, "gil guessed");
      expect(got.me).toMatchObject({ word, notice: { kind: "correct" } });
      for (const p of [b, c, d, e]) p.send("GUESS", { text: word });
      const r = await revealChecked(tv, 1);
      expect(r.lastTurn?.reason).toBe("all-guessed");
      expect(r.lastTurn?.gains[g.id]).toBeGreaterThan(0);
      expect(r.lastTurn?.gains[a.id]).toBe(300);

      for (const p of [...phones, g]) p.close();
      tv.close();
    }), 60_000);

  it("a drawer who drops: the turn ends after the 15 s grace, guessers keep their points", () =>
    noteReloads(async () => {
      const { code, tv } = await createRoom();
      const phones = await joinAll(code, ["A", "B", "C", "D"]);
      const [a, b, c, d] = phones;
      if (!a || !b || !c || !d) throw new Error("phones");
      await connected(tv, 4);
      await startTeams(tv, a, 2, 1);
      const { drawer, word } = await pickTurn(tv, phones, 1);
      expect(drawer).toBe(a);
      b.send("GUESS", { text: word });
      await b.until((v) => v.me.guessed, 5000, "b guessed");

      a.close();
      await tv.until((v) => seat(v, a.id)?.connected === false, 5000, "drawer away");
      const droppedAt = Date.now();
      const away = tv.view();
      expect(away.phase).toBe("drawing"); // not over yet: the drawer has the grace
      const r = await revealChecked(tv, 1, 25_000);
      expect(Date.now() - droppedAt).toBeGreaterThan(13_000);
      expect(r.lastTurn?.reason).toBe("drawer-left");
      expect(r.lastTurn?.gains[b.id]).toBeGreaterThan(0);
      expect(r.feed.some((x) => x.kind === "leave" && x.playerId === a.id)).toBe(true);
      expect(r.hostId).toBe(b.id); // A hosted; B is the next connected player

      // The next turn goes to t1 (B), and nobody waits on the absent A.
      const t2 = await pickTurn(tv, [b, c, d], 2);
      expect(t2.drawer).toBe(b);

      for (const p of [b, c, d]) p.close();
      tv.close();
    }), 60_000);

  it("the host leaves: the next connected player hosts (lobby and mid-game), the first joiner gets it back", () =>
    noteReloads(async () => {
      const { code, tv } = await createRoom();
      let [a, b, c, d] = await joinAll(code, ["A", "B", "C", "D"]);
      if (!a || !b || !c || !d) throw new Error("phones");
      await connected(tv, 4);
      expect(tv.view().hostId).toBe(a.id);

      // Lobby: A leaves; B hosts and can change the settings.
      a.close();
      await tv.until((v) => v.hostId === b?.id, 5000, "b hosts");
      await b.until((v) => v.me.isHost, 5000, "b knows");
      b.send("SETTINGS", { mode: "teams", teamCount: 2, rounds: 1, drawSeconds: 40 });
      await tv.until((v) => v.settings.mode === "teams" && v.settings.drawSeconds === 40, 5000, "b's settings");

      // A comes back (same seat) and hosts again.
      const aId = a.id;
      a = await join(code, "A", { id: a.id, sig: a.sig });
      expect(a.id).toBe(aId);
      await tv.until((v) => v.hostId === aId, 5000, "a hosts again");
      b.send("START", {});
      await b.until((v) => v.me.notice?.kind === "not-host", 5000, "b no longer hosts");
      a.send("START", {});

      // Mid-game: B (t1) draws turn 2; A leaves; B, now host, can skip the drawing.
      await pickTurn(tv, [a, b, c, d], 1);
      a.send("SKIP", {});
      await tv.until((v) => v.phase === "reveal" && v.lastTurn?.turn === 1, 5000, "turn 1 skipped");
      a.send("SKIP", {});
      const t2 = await pickTurn(tv, [a, b, c, d], 2);
      expect(t2.drawer).toBe(b);
      a.close();
      await tv.until((v) => v.hostId === b?.id, 5000, "b hosts mid-game");
      b.send("SKIP", {});
      const r = await tv.until((v) => v.phase === "reveal" && v.lastTurn?.turn === 2, 5000, "b skipped");
      expect(r.lastTurn).toMatchObject({ reason: "skipped", gains: {} });

      for (const p of [b, c, d]) p.close();
      tv.close();
    }), 60_000);
});
