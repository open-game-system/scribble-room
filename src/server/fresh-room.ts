// A new room must really be new: codes are short, rooms persist, and spawn is idempotent, so a code
// that lands on an existing room would hand out a TV link that room doesn't know. Try another code.
export async function createFreshRoom(deps: {
  newCode: () => string;
  newTvId: () => string;
  spawn: (code: string, tvId: string) => Promise<void>;
  isTv: (code: string, tvId: string) => Promise<boolean>;
  attempts?: number;
}): Promise<{ code: string; tvId: string }> {
  for (let i = 0; i < (deps.attempts ?? 8); i++) {
    const code = deps.newCode();
    const tvId = deps.newTvId();
    await deps.spawn(code, tvId);
    if (await deps.isTv(code, tvId)) return { code, tvId };
  }
  throw new Error("no free room code");
}
