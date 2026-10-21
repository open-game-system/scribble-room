// What to draw when a canvas view arrives: only the new ops when the screen already shows a prefix of
// them (the common case: the drawer added chunks), else wipe and redraw (undo, clear, new turn, resync).

export const sortedKeys = (ops: Readonly<Record<string, unknown>>): string[] => Object.keys(ops).sort((a, b) => Number(a) - Number(b));

export type Drawn = { turn: number; keys: string[] };

export function planRender(drawn: Drawn, turn: number, keys: string[]): { reset: boolean; draw: string[] } {
  const prefix = drawn.turn === turn && drawn.keys.length <= keys.length && drawn.keys.every((k, i) => keys[i] === k);
  if (!prefix) return { reset: true, draw: keys };
  return { reset: false, draw: keys.slice(drawn.keys.length) };
}
