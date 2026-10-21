// Small TV building blocks: the timer ring, the hint mask, a count-up number, a player row.
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Avatar } from "../brand";
import type { Seat } from "../../shared/protocol";
import { letterCounts, maskScale, maskWords } from "./derive";

type Vars = CSSProperties & Record<`--${string}`, string>;

export function TimerRing({ seconds, fraction, urgent, label }: { seconds: number; fraction: number; urgent: boolean; label: string }) {
  const style: Vars = { "--p": fraction.toFixed(3) };
  return (
    <div className="tv-timer">
      <div className={urgent ? "timer-ring urgent" : "timer-ring"} style={style} role="timer" aria-label={`${seconds} seconds left`}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="track" cx="50" cy="50" r="42" />
          <circle className="fill" cx="50" cy="50" r="42" pathLength="100" />
        </svg>
        {/* Keyed by the second so the urgency pulse restarts in step with the tick. */}
        <span className="timer-num" key={urgent ? seconds : "calm"}>
          {seconds}
        </span>
      </div>
      <span className="tv-timer-label">{label}</span>
    </div>
  );
}

export function Mask({ mask }: { mask: string }) {
  const words = maskWords(mask);
  const counts = letterCounts(mask);
  const style: Vars = { "--mask-k": maskScale(mask).toFixed(3) };
  return (
    <div className="tv-mask" style={style} aria-label={`${counts.join(" and ")} letters`}>
      <div className="mask">
        {words.map((w, wi) => (
          <span className="tv-mask-word" key={wi}>
            {w.map((c, ci) =>
              c.kind === "hidden" ? (
                <span className="mask-letter" key={ci} />
              ) : c.kind === "fixed" ? (
                <span className="mask-letter is-fixed" key={ci}>
                  {c.ch}
                </span>
              ) : (
                <span className="mask-letter is-revealed" key={ci}>
                  {c.ch}
                </span>
              ),
            )}
          </span>
        ))}
      </div>
      <span className="tv-mask-count">{counts.join(" + ")} letters</span>
    </div>
  );
}

/** Counts from 0 to `to` over `ms` (the reveal's gains). */
export function CountUp({ to, ms = 600, delay = 0, prefix = "" }: { to: number; ms?: number; delay?: number; prefix?: string }) {
  const [n, setN] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now() + delay;
    const step = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / ms));
      setN(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [to, ms, delay]);
  return (
    <span className="tabular">
      {prefix}
      {n}
    </span>
  );
}

export function PlayerAvatar({ seat, size }: { seat: Pick<Seat, "id" | "name" | "avatar">; size: number }) {
  return <Avatar name={seat.name} id={seat.id} src={seat.avatar || null} size={size} />;
}
