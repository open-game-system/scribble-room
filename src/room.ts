// The room actor contract (actor-kit-2). Browser-safe (imports @actor-kit/worker/testing, not
// cloudflare:workers). All rules live in src/game; this file is the wire: Zod-parsed messages, durable
// timers and presence. Roles and views are in the zod-free src/room.views.ts.
import { setup } from "@actor-kit/worker/testing";
import { z } from "zod";
import { TIMER_NAMES, type TimerName, connected, deadlines, disconnected, tick } from "./game/clock";
import { judgeGuess } from "./game/guess";
import { canDraw } from "./game/canvas";
import { apply, type GameEvent } from "./game/rules";
import { bump, createGame, isPlayer, notify } from "./game/state";
import type { Deps, GameState } from "./game/types";
import { pickChoices } from "./game/words";
import { Msg } from "./shared/messages";
import { type RoomState, roomRoles, roomViews } from "./room.views";

export type { RoomState } from "./room.views";

const kit = setup({});

type Clocked = { now(): number; random(): number };
type Timers = {
  schedule(name: TimerName, opts: { at: number; key: string; payload: Record<string, never> }): void;
  cancel(key: string): void;
};

const depsOf = (ctx: Clocked): Deps => ({ now: ctx.now(), rand: () => ctx.random(), pickChoices, judge: judgeGuess });

/** Keeps one durable timer per pending deadline (key = timer name): schedules changed ones, cancels gone ones. */
function syncTimers(before: GameState, after: GameState, ctx: Timers, fired?: { name: TimerName; now: number }): void {
  const was = deadlines(before);
  const now = deadlines(after);
  for (const name of TIMER_NAMES) {
    const at = now[name];
    const refire = fired?.name === name && at !== undefined && at > fired.now;
    if (at !== undefined && (at !== was[name] || refire)) ctx.schedule(name, { at, key: name, payload: {} });
    else if (at === undefined && was[name] !== undefined) ctx.cancel(name);
  }
}

/** Runs one event through the rules. A refusal becomes a private notice for that phone. */
function play(s: RoomState, caller: string, event: GameEvent, ctx: Clocked & Timers): RoomState {
  const r = apply(s.game, caller, event, depsOf(ctx));
  if (!r.ok) return { ...s, game: bump(notify(s.game, caller, r.error, r.error)) };
  syncTimers(s.game, r.state, ctx);
  return { ...s, game: r.state };
}

/** A seated phone's message: the payload (already parsed by Zod) becomes a game event. */
function playerMessage<P>(schema: z.ZodType<P>, toEvent: (p: P) => GameEvent) {
  return kit.message(schema, {
    roles: ["player"],
    handler: (s: RoomState, p, ctx) => play(s, ctx.caller, toEvent(p), ctx),
  });
}

/** A drawer's canvas op: refused by the guard unless the caller is drawing now (no notice, no transition). */
function canvasMessage<P>(schema: z.ZodType<P>, toEvent: (p: P) => GameEvent) {
  return kit.message(schema, {
    roles: ["player"],
    guard: (s: RoomState, _p, ctx) => canDraw(s.game, ctx.caller),
    handler: (s: RoomState, p, ctx) => {
      const r = apply(s.game, ctx.caller, toEvent(p), depsOf(ctx));
      return r.ok ? { ...s, game: r.state } : s;
    },
  });
}

const Admit = z.object({ id: z.string().min(1).max(80), name: z.string().trim().min(1).max(24), avatar: z.string().max(500) });
const Empty = z.object({});

/** Every timer runs the clock: whatever is due happens, and the timers follow the new deadlines. */
const clockTimer = (name: TimerName) =>
  kit.timer(Empty, (s: RoomState, _p, ctx) => {
    const game = tick(s.game, depsOf(ctx));
    syncTimers(s.game, game, ctx, { name, now: ctx.now() });
    return { ...s, game };
  });

export const RoomContract = kit.actor("room", {
  input: z.object({ code: z.string().min(1), tvId: z.string().min(8) }),
  init: (input: { code: string; tvId: string }): RoomState => ({ tvId: input.tvId, game: createGame(input.code) }),
  roles: roomRoles,
  views: roomViews,

  messages: {
    /** The Worker seats a phone after checking its OGS token (or taking a guest's typed name). */
    ADMIT: kit.message(Admit, {
      roles: ["system"],
      handler: (s: RoomState, p, ctx) => play(s, ctx.caller, { type: "ADMIT", ...p }, ctx),
    }),
    SETTINGS: playerMessage(Msg.SETTINGS, (p) => ({ type: "SETTINGS", ...p })),
    JOIN_TEAM: playerMessage(Msg.JOIN_TEAM, (p) => ({ type: "JOIN_TEAM", team: p.team })),
    SHUFFLE_TEAMS: playerMessage(Msg.SHUFFLE_TEAMS, () => ({ type: "SHUFFLE_TEAMS" })),
    START: playerMessage(Msg.START, () => ({ type: "START" })),
    PICK: playerMessage(Msg.PICK, (p) => ({ type: "PICK", index: p.index })),
    STROKE: canvasMessage(Msg.STROKE, (p) => ({ type: "STROKE", ...p })),
    FILL: canvasMessage(Msg.FILL, (p) => ({ type: "FILL", ...p })),
    UNDO: canvasMessage(Msg.UNDO, () => ({ type: "UNDO" })),
    CLEAR: canvasMessage(Msg.CLEAR, () => ({ type: "CLEAR" })),
    GUESS: playerMessage(Msg.GUESS, (p) => ({ type: "GUESS", text: p.text })),
    SKIP: playerMessage(Msg.SKIP, () => ({ type: "SKIP" })),
    PLAY_AGAIN: playerMessage(Msg.PLAY_AGAIN, () => ({ type: "PLAY_AGAIN" })),
  },

  timers: {
    pick: clockTimer("pick"),
    hint: clockTimer("hint"),
    draw: clockTimer("draw"),
    reveal: clockTimer("reveal"),
    grace: clockTimer("grace"),
  },

  // Presence: only a player's own socket counts (the TV and "cv-" canvas sockets are not players).
  lifecycle: {
    connect: (s: RoomState, { caller }, ctx) => {
      if (!isPlayer(s.game, caller)) return s;
      const game = connected(s.game, caller);
      syncTimers(s.game, game, ctx);
      return { ...s, game };
    },
    disconnect: (s: RoomState, { caller, callerConnections }, ctx) => {
      if (callerConnections > 0 || !isPlayer(s.game, caller)) return s;
      const game = disconnected(s.game, caller, depsOf(ctx));
      syncTimers(s.game, game, ctx);
      return { ...s, game };
    },
  },
});

export type RoomContract = typeof RoomContract;
