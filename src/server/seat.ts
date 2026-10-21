// Who a joining phone is: the verified OGS profile when it has a game token, else a named guest.
import { z } from "zod";

export const JoinBodySchema = z.object({
  name: z.string().max(60).optional(),
  token: z.string().max(4000).optional(),
  id: z.string().max(80).optional(),
  sig: z.string().max(100).optional(),
});
export type JoinBody = z.infer<typeof JoinBodySchema>;
export type Seat = { id: string; name: string; avatar: string };
type Claims = { sub: string; name: string; avatar: string };

export async function resolveSeat(args: {
  claims: Claims | null;
  body: JoinBody;
  sigOk: (id: string, sig: string) => Promise<boolean>;
  newId: () => string;
}): Promise<{ ok: true; seat: Seat } | { ok: false; error: "name-required" }> {
  const { claims, body } = args;
  if (claims) return { ok: true, seat: { id: `o-${claims.sub}`, name: claims.name.slice(0, 24), avatar: claims.avatar } };
  const name = body.name?.trim().slice(0, 24) ?? "";
  if (name === "") return { ok: false, error: "name-required" };
  const keep = body.id?.startsWith("g-") && body.sig !== undefined && (await args.sigOk(body.id, body.sig));
  return { ok: true, seat: { id: keep && body.id ? body.id : args.newId(), name, avatar: "" } };
}
