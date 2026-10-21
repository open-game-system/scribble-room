// The room's roles and views: zod-free, so the pages can build their clients from these same objects
// (`actorClient<typeof RoomContract>({ roles: roomRoles, views: roomViews })`) without bundling Zod.
//
// Roles (first match wins): system (the Worker, a service caller), tv (the room's TV id), player
// (a seated phone), canvas (a phone's second socket, ids "cv-…": the drawing only).
import { view } from "@actor-kit/core";
import { CanvasViewSchema, PlayerViewSchema, TvViewSchema } from "./shared/protocol";
import { isPlayer } from "./game/state";
import type { GameState } from "./game/types";
import { canvasView, playerView, tvView } from "./game/views";

export type RoomState = { tvId: string; game: GameState };

/** A phone's canvas socket signs in as `cv-<player id>`. */
export const CANVAS_PREFIX = "cv-";
export const canvasIdFor = (playerId: string): string => `${CANVAS_PREFIX}${playerId}`;

export const roomRoles = {
  system: (_s: RoomState, _caller: string, { callerType }: { callerType: "user" | "service" }) => callerType === "service",
  tv: (s: RoomState, caller: string) => caller === s.tvId,
  player: (s: RoomState, caller: string) => isPlayer(s.game, caller),
  canvas: (_s: RoomState, caller: string) => caller.startsWith(CANVAS_PREFIX),
};

export const roomViews = {
  system: view.shared(TvViewSchema, (s: RoomState) => tvView(s.game)),
  tv: view.shared(TvViewSchema, (s: RoomState) => tvView(s.game)),
  player: view.perCaller(PlayerViewSchema, (s: RoomState, caller: string) => playerView(s.game, caller)),
  canvas: view.shared(CanvasViewSchema, (s: RoomState) => canvasView(s.game)),
};
