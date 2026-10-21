// The drawer's canvas: the base layer renders the room's ops (canvas socket: undo, clear and reconnects
// resync it), the overlay draws this finger's strokes at once and lets go of each when the room echoes it.
import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { BRUSHES, PALETTE } from "../../config";
import { type CanvasView, ERASER } from "../../shared/protocol";
import { sfx } from "../audio";
import { createBatcher } from "../canvas/batcher";
import { colorOf, drawLine, widthOf } from "../canvas/render";
import { CANVAS } from "../../config";
import type { OutMsg } from "../net";
import { type Rect, toCanvas, toCanvasInt } from "./geometry";
import { Stage, useCanvasRenderer } from "./Sheet";
import { type LocalStroke, dropNewest, nextStrokeId, settle } from "./strokes";
import { Btn, ConfirmBtn } from "./ui";

export const COLOR_NAMES = ["Black", "White", "Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Pink", "Brown", "Grey", "Sky blue"] as const;
const BRUSH_NAMES = ["Thin", "Medium", "Thick"] as const;
const FLUSH_MS = 50;

type Tool = "pen" | "eraser" | "fill";
type Ripple = { id: number; x: number; y: number };

export function DrawPad({ canvas, send }: { canvas: CanvasView; send: (m: OutMsg) => void }) {
  const base = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  useCanvasRenderer(base, canvas);

  const [color, setColor] = useState(0);
  const [size, setSize] = useState(1);
  const [tool, setTool] = useState<Tool>("pen");
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const locals = useRef<LocalStroke[]>([]);
  const used = useRef(0);
  const turn = useRef(canvas.canvasTurn);
  const ops = useRef(canvas.ops);
  const active = useRef<{ pointer: number; rect: Rect; stroke: LocalStroke } | null>(null);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const frame = useRef(0);

  const redraw = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const ctx = overlay.current?.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, CANVAS.w, CANVAS.h);
      for (const s of locals.current) drawLine(ctx, s.pts, colorOf(s.color), widthOf(s.size));
    });
  }, []);

  const batcher = useRef(
    createBatcher({
      send: (c) => {
        send({ type: "STROKE", stroke: c.stroke, color: c.color, size: c.size, pts: c.pts });
        const s = locals.current.find((l) => l.id === c.stroke);
        if (s) s.chunks += 1;
      },
    }),
  );

  useEffect(() => {
    const el = overlay.current;
    if (el) {
      el.width = CANVAS.w;
      el.height = CANVAS.h;
    }
    return () => {
      if (flushTimer.current) clearInterval(flushTimer.current);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  // The room's ops changed: drop echoed strokes; a new turn starts fresh.
  useEffect(() => {
    ops.current = canvas.ops;
    if (canvas.canvasTurn !== turn.current) {
      turn.current = canvas.canvasTurn;
      locals.current = locals.current.filter((s) => s.endedAt === null);
      used.current = 0;
    }
    locals.current = settle(locals.current, canvas.ops, Date.now());
    redraw();
  }, [canvas.canvasTurn, canvas.ops, redraw]);

  // Strokes whose echo never came (dropped socket) leave the overlay after the grace period.
  useEffect(() => {
    const t = setInterval(() => {
      const before = locals.current.length;
      locals.current = settle(locals.current, ops.current, Date.now());
      if (locals.current.length !== before) redraw();
    }, 500);
    return () => clearInterval(t);
  }, [redraw]);

  const endStroke = () => {
    const a = active.current;
    if (!a) return;
    batcher.current.end();
    a.stroke.endedAt = Date.now();
    active.current = null;
    if (flushTimer.current) clearInterval(flushTimer.current);
    flushTimer.current = null;
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (active.current) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    const id = nextStrokeId(ops.current, used.current);
    used.current = id + 1;
    if (tool === "fill") {
      const p = toCanvasInt(rect, e.clientX, e.clientY);
      send({ type: "FILL", stroke: id, color, x: p.x, y: p.y });
      sfx.tap();
      const ripple = { id, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
      setRipples((rs) => [...rs.slice(-3), ripple]);
      setTimeout(() => setRipples((rs) => rs.filter((x) => x.id !== ripple.id)), 500);
      return;
    }
    el.setPointerCapture(e.pointerId);
    const c = tool === "eraser" ? ERASER : color;
    const p = toCanvas(rect, e.clientX, e.clientY);
    const stroke: LocalStroke = { id, color: c, size, pts: [p.x, p.y], chunks: 0, endedAt: null };
    locals.current = [...locals.current, stroke];
    active.current = { pointer: e.pointerId, rect, stroke };
    batcher.current.begin(id, c, size, p);
    flushTimer.current = setInterval(() => batcher.current.flush(), FLUSH_MS);
    sfx.strokeStart();
    redraw();
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    if (!a || a.pointer !== e.pointerId) return;
    const native = e.nativeEvent;
    const events = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [native]) {
      const p = toCanvas(a.rect, ev.clientX, ev.clientY);
      batcher.current.move(p);
      a.stroke.pts.push(p.x, p.y);
    }
    redraw();
  };

  const onUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (active.current?.pointer === e.pointerId) endStroke();
  };

  const undo = () => {
    if (active.current) return;
    send({ type: "UNDO" });
    locals.current = dropNewest(locals.current);
    redraw();
  };
  const clear = () => {
    endStroke();
    send({ type: "CLEAR" });
    locals.current = [];
    redraw();
  };

  return (
    <div className="drawpad">
      <Stage className="draw-stage" testId="sheet">
        <canvas ref={base} aria-hidden="true" />
        <canvas
          ref={overlay}
          className={`overlay tool-${tool}`}
          data-testid="draw-canvas"
          aria-label="Drawing canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onLostPointerCapture={onUp}
          onContextMenu={(e) => e.preventDefault()}
        />
        {ripples.map((r) => (
          <span key={r.id} className="fill-ripple" style={{ left: `${r.x}%`, top: `${r.y}%`, "--swatch": PALETTE[color] }} />
        ))}
      </Stage>
      <div className="tools" data-testid="tools">
        <div className="palette" role="radiogroup" aria-label="Colours">
          {PALETTE.map((hex, i) => (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={color === i && tool !== "eraser"}
              aria-label={COLOR_NAMES[i]}
              data-testid={`color-${i}`}
              className={`swatch${color === i && tool !== "eraser" ? " is-selected" : ""}`}
              style={{ "--swatch": hex }}
              onPointerDown={() => sfx.tap()}
              onClick={() => {
                setColor(i);
                if (tool === "eraser") setTool("pen");
              }}
            />
          ))}
        </div>
        <div className="toolrow">
          {BRUSHES.map((w, i) => (
            <Btn
              key={w}
              className="tool brush"
              testId={`brush-${i}`}
              label={`${BRUSH_NAMES[i]} brush`}
              selected={size === i && tool === "pen"}
              onPress={() => {
                setSize(i);
                setTool("pen");
              }}
            >
              <span className="brush-dot" style={{ "--dot": `${6 + i * 7}px`, "--swatch": PALETTE[color] }} />
            </Btn>
          ))}
          <Btn className="tool" testId="tool-eraser" label="Eraser" selected={tool === "eraser"} onPress={() => setTool(tool === "eraser" ? "pen" : "eraser")}>
            Erase
          </Btn>
          <Btn className="tool" testId="tool-fill" label="Fill" selected={tool === "fill"} onPress={() => setTool(tool === "fill" ? "pen" : "fill")}>
            Fill
          </Btn>
        </div>
        <div className="toolrow">
          <Btn className="tool wide" testId="tool-undo" label="Undo" onPress={undo}>
            Undo
          </Btn>
          <ConfirmBtn className="tool wide" testId="tool-clear" label="Clear" confirmLabel="Clear all?" onConfirm={clear} />
        </div>
      </div>
    </div>
  );
}
