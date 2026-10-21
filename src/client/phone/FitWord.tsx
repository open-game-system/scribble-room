// A word (or phrase) at the largest size up to `base` at which its longest word fits the width: it never
// breaks inside a word; a phrase may wrap at its spaces. Measured in the browser (the real font), so it
// holds for every word in every pack at every phone width.
import { useLayoutEffect, useRef } from "react";
import { fitSize } from "./geometry";

const px = (v: string): number => Number.parseFloat(v) || 0;

/** The width the word may use: the parent's content box minus this element's own padding and border. */
function availableWidth(el: HTMLElement): number {
  const parent = el.parentElement;
  if (!parent) return el.clientWidth;
  const ps = getComputedStyle(parent);
  const s = getComputedStyle(el);
  const parentContent = parent.clientWidth - px(ps.paddingLeft) - px(ps.paddingRight);
  const own = px(s.paddingLeft) + px(s.paddingRight) + px(s.borderLeftWidth) + px(s.borderRightWidth);
  return Math.max(0, parentContent - own);
}

function fit(el: HTMLElement, base: number, min: number): void {
  el.style.fontSize = `${base}px`;
  const toks = Array.from(el.querySelectorAll<HTMLElement>(".fw-tok"));
  const widest = toks.reduce((w, t) => Math.max(w, t.getBoundingClientRect().width), 0);
  el.style.fontSize = `${fitSize(base, availableWidth(el), widest, min)}px`;
}

type Props = { text: string; base: number; min?: number; className?: string; testId?: string };

export function FitWord({ text, base, min = 14, className = "", testId }: Props) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const run = () => fit(el, base, min);
    run();
    const ro = new ResizeObserver(run);
    if (el.parentElement) ro.observe(el.parentElement);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) run();
    });
    document.fonts?.addEventListener("loadingdone", run);
    return () => {
      live = false;
      ro.disconnect();
      document.fonts?.removeEventListener("loadingdone", run);
    };
  }, [text, base, min]);
  const words = text.split(" ");
  return (
    <p ref={ref} className={`fit-word ${className}`} data-testid={testId} data-fit="" style={{ fontSize: base }}>
      {words.map((w, i) => (
        <span key={i}>
          <span className="fw-tok">{w}</span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </p>
  );
}
