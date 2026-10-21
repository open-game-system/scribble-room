// Draws the room's canvas ops. Every device paints into the same CANVAS.w × CANVAS.h bitmap (so a
// bucket fill lands the same everywhere), then that bitmap is what the page shows, scaled by CSS.
// TV and phones share this; the drawer's phone also uses drawLine() for its local, instant stroke.
import { BRUSHES, CANVAS, CANVAS_BG, PALETTE } from "../../config";
import { ERASER, type Op } from "../../shared/protocol";
import { floodFill, hexToRgba } from "./fill";
import { type Drawn, planRender, sortedKeys } from "./plan";

export const colorOf = (index: number): string => (index === ERASER ? CANVAS_BG : (PALETTE[index] ?? PALETTE[0]));
export const widthOf = (size: number): number => BRUSHES[size] ?? BRUSHES[0];

/** A smooth line through interleaved points: quadratic curves through the midpoints. */
export function drawLine(ctx: CanvasRenderingContext2D, pts: readonly number[], color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const n = Math.floor(pts.length / 2);
  const x = (i: number) => pts[i * 2] ?? 0;
  const y = (i: number) => pts[i * 2 + 1] ?? 0;
  if (n === 0) return;
  if (n === 1) {
    ctx.beginPath();
    ctx.arc(x(0), y(0), width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x(0), y(0));
  for (let i = 1; i < n - 1; i++) {
    ctx.quadraticCurveTo(x(i), y(i), (x(i) + x(i + 1)) / 2, (y(i) + y(i + 1)) / 2);
  }
  ctx.lineTo(x(n - 1), y(n - 1));
  ctx.stroke();
}

export function drawOp(ctx: CanvasRenderingContext2D, op: Op): void {
  if (op.kind === "fill") {
    const img = ctx.getImageData(0, 0, CANVAS.w, CANVAS.h);
    floodFill(img, op.pts[0] ?? 0, op.pts[1] ?? 0, hexToRgba(colorOf(op.color)), 48);
    ctx.putImageData(img, 0, 0);
    return;
  }
  drawLine(ctx, op.pts, colorOf(op.color), widthOf(op.size));
}

export function clearCanvas(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);
}

/**
 * Keeps a <canvas> (sized CANVAS.w × CANVAS.h; scale it with CSS) in step with the room's ops,
 * drawing only what is new when it can.
 */
export function createRenderer(canvas: HTMLCanvasElement) {
  canvas.width = CANVAS.w;
  canvas.height = CANVAS.h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d canvas unavailable");
  let drawn: Drawn = { turn: -1, keys: [] };
  clearCanvas(ctx);
  return {
    update(turn: number, ops: Readonly<Record<string, Op>>): void {
      const keys = sortedKeys(ops);
      const plan = planRender(drawn, turn, keys);
      if (plan.reset) clearCanvas(ctx);
      for (const k of plan.draw) {
        const op = ops[k];
        if (op) drawOp(ctx, op);
      }
      drawn = { turn, keys };
    },
    /** Forget what is drawn: the next update redraws everything. */
    invalidate(): void {
      drawn = { turn: -1, keys: [] };
    },
    ctx,
  };
}
