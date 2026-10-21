// The pages' connection layer: one actor-kit client per socket, decoded with the protocol's view schemas,
// plus React hooks and the server-clock offset. Shared by the TV and phone pages (coordinator-owned).
import { type ActorClient, type ConnectionState, createActorClient } from "@actor-kit/client";
import type { FieldDescriptor, Infer, SchemaDefinition } from "@actor-kit/core";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { z } from "zod";
import type { Msg, MsgType } from "../shared/messages";

/** Every message a page can send, typed from the room's Zod schemas (type-only: no zod in the bundle). */
type Payload<T> = string extends keyof T ? unknown : T;
export type OutMsg = { [K in MsgType]: { type: K } & Payload<z.input<(typeof Msg)[K]>> }[MsgType];

export type RoomClient<V> = ActorClient<V, OutMsg>;

type View<T extends Record<string, FieldDescriptor>> = Infer<SchemaDefinition<T>>;

export function connect<T extends Record<string, FieldDescriptor>>(
  schema: SchemaDefinition<T>,
  path: string,
  initialView: View<T>,
  onError?: (e: { messageType: string; code: string; message: string }) => void,
): RoomClient<View<T>> {
  const client = createActorClient<T, OutMsg>({ path, initialView, viewSchema: schema, ...(onError ? { onError } : {}) });
  client.connect(); // actor-kit clients start unconnected
  return client;
}

export function useView<V>(client: RoomClient<V>): V {
  return useSyncExternalStore(
    (cb) => client.subscribe(cb),
    () => client.view,
    () => client.view,
  );
}

export function useConnectionState(client: RoomClient<unknown>): ConnectionState {
  const [state, setState] = useState<ConnectionState>(client.connectionState);
  useEffect(() => client.onStateChange(setState), [client]);
  return state;
}

/** Server time ≈ Date.now() + offset. Set once from the boot / join response's serverNow. */
let clockOffset = 0;
export function setServerNow(serverNow: number, sentAt = Date.now()): void {
  clockOffset = serverNow - sentAt;
}
export const serverNow = (): number => Date.now() + clockOffset;

/** Seconds left until a server epoch-ms deadline, re-rendering every 250 ms. 0 when there is no deadline. */
export function useSecondsLeft(endsAt: number): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  return useMemo(() => (endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0), [endsAt, now]);
}
