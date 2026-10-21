// Screen ↔ canvas maths for the drawing sheet. Pure.
import { CANVAS } from "../../config";

export type Size = { w: number; h: number };
export type Rect = { left: number; top: number; width: number; height: number };

/** The largest box of the canvas's aspect (4:3) that fits in `avail`, in whole pixels. */
export function fitSheet(avail: Size, aspect = CANVAS.w / CANVAS.h): Size {
  const w = Math.max(0, avail.w);
  const h = Math.max(0, avail.h);
  if (w === 0 || h === 0) return { w: 0, h: 0 };
  if (w / h > aspect) return { w: Math.floor(h * aspect), h: Math.floor(h) };
  return { w: Math.floor(w), h: Math.floor(w / aspect) };
}

/** A pointer's client position → CANVAS units (unrounded), clamped to the sheet. */
export function toCanvas(rect: Rect, clientX: number, clientY: number): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  const x = ((clientX - rect.left) / rect.width) * CANVAS.w;
  const y = ((clientY - rect.top) / rect.height) * CANVAS.h;
  return { x: Math.min(CANVAS.w, Math.max(0, x)), y: Math.min(CANVAS.h, Math.max(0, y)) };
}

/** Same as toCanvas, rounded to the integer coordinates the wire carries (FILL). */
export function toCanvasInt(rect: Rect, clientX: number, clientY: number): { x: number; y: number } {
  const p = toCanvas(rect, clientX, clientY);
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/** Display size for a word: long words shrink (to 18 px at least) so they stay on one line on a phone. */
export const wordSize = (word: string, base: number): string => `${Math.round(word.length > 9 ? Math.max(18, (base * 9) / word.length) : base)}px`;
