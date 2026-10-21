// The drawing sheet on a phone: a 4:3 box as big as its stage allows, and the read-only mirror that
// renders the canvas socket's ops with the shared renderer (CANVAS units, scaled by CSS).
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CanvasView } from "../../shared/protocol";
import { createRenderer } from "../canvas/render";
import { type Size, fitSheet } from "./geometry";

/** The 4:3 size that fits the element's content box, kept current with a ResizeObserver. */
export function useFit(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = fitSheet({ w: r.width, h: r.height });
      setSize((cur) => (cur.w === next.w && cur.h === next.h ? cur : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Keeps a <canvas> in step with the canvas view. */
export function useCanvasRenderer(ref: RefObject<HTMLCanvasElement | null>, canvas: CanvasView): void {
  const renderer = useRef<ReturnType<typeof createRenderer> | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!renderer.current) renderer.current = createRenderer(el);
    renderer.current.update(canvas.canvasTurn, canvas.ops);
  }, [ref, canvas.canvasTurn, canvas.ops]);
}

/** A sheet sized to its stage. Children are stacked canvases (all CANVAS-sized, scaled by CSS). */
export function Stage({ children, className = "", testId }: { children: ReactNode; className?: string; testId?: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const size = useFit(stage);
  return (
    <div className={`stage ${className}`} ref={stage}>
      <div className="sheet" data-testid={testId} style={{ width: size.w, height: size.h, visibility: size.w ? "visible" : "hidden" }}>
        {children}
      </div>
    </div>
  );
}

export function Mirror({ canvas, className = "" }: { canvas: CanvasView; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useCanvasRenderer(ref, canvas);
  return (
    <Stage className={`mirror ${className}`} testId="mirror">
      <canvas ref={ref} aria-label="The drawing" />
    </Stage>
  );
}
