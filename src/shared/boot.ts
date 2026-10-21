// What the Worker inlines into the pages / returns from /api/:code/join. zod/mini: small in the bundle.
// The snapshot is validated separately with the actor-kit view schema (TvViewSchema.parse / PlayerViewSchema.parse).
import * as z from "zod/mini";

export const TvBootZ = z.object({ code: z.string(), id: z.string(), sig: z.string(), serverNow: z.number(), snapshot: z.unknown() });
export const JoinBootZ = z.object({ code: z.string(), tvUrl: z.nullable(z.string()), serverNow: z.number() });
export const JoinResponseZ = z.object({
  id: z.string(),
  sig: z.string(),
  name: z.string(),
  serverNow: z.number(),
  snapshot: z.unknown(),
  /** Sign-in for the canvas socket (role "canvas"). */
  canvas: z.object({ id: z.string(), sig: z.string() }),
});
export type TvBoot = z.infer<typeof TvBootZ>;
export type JoinBoot = z.infer<typeof JoinBootZ>;
export type JoinResponse = z.infer<typeof JoinResponseZ>;
