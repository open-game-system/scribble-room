// The drawing: the room's canvas ops painted by the shared renderer at CANVAS units, scaled by CSS.
// It is the focal area: nothing is ever drawn over it (data-focal feeds window.__focalRect()).
import { type ReactNode, useEffect, useRef } from "react";
import { createRenderer } from "../canvas/render";
import type { Op } from "../../shared/protocol";

type Renderer = ReturnType<typeof createRenderer>;

/** `cover` (picking) replaces the blank sheet with a caption; the canvas stays mounted underneath, hidden. */
export function Sheet({ turn, ops, cover }: { turn: number; ops: Readonly<Record<string, Op>>; cover?: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const renderer = useRef<Renderer | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    if (!renderer.current) renderer.current = createRenderer(canvas.current);
    renderer.current.update(turn, ops);
  }, [turn, ops]);
  return (
    <div className="sheet taped tv-sheet">
      <canvas ref={canvas} data-focal={cover ? undefined : "canvas"} aria-label="The drawing" className={cover ? "is-hidden" : undefined} />
      {cover ? <div className="tv-sheet-cover">{cover}</div> : null}
    </div>
  );
}
