// Small shared phone pieces: buttons with instant press feedback, a two-tap confirm, the timer ring,
// the hint mask, the feed and the private notice toast.
import { type CSSProperties, type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { initials, playerHue } from "../brand";
import type { FeedEntry, Seat } from "../../shared/protocol";
import { sfx } from "../audio";
import { useSecondsLeft } from "../net";
import { type Notice, noticeText, toneOf } from "./notices";

export const PRESSED = "is-pressed";

/** Pressed look on pointerdown itself (no waiting for React), plus the tap sound. */
export function pressOn(e: PointerEvent<HTMLElement>, sound: () => void = sfx.tap): void {
  const el = e.currentTarget;
  el.classList.add(PRESSED);
  sound();
  const off = () => {
    el.classList.remove(PRESSED);
    window.removeEventListener("pointerup", off);
    window.removeEventListener("pointercancel", off);
  };
  window.addEventListener("pointerup", off);
  window.addEventListener("pointercancel", off);
}

type BtnProps = {
  className?: string;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
  label?: string;
  testId?: string;
  selected?: boolean;
  style?: CSSProperties;
  /** Keep the keyboard up: don't take focus from the input on press. */
  keepFocus?: boolean;
  sound?: () => void;
};

export function Btn({ className = "", onPress, disabled, children, label, testId, selected, style, keepFocus, sound }: BtnProps) {
  return (
    <button
      type="button"
      className={`btn ${className}${selected ? " is-selected" : ""}`}
      aria-label={label}
      aria-pressed={selected === undefined ? undefined : selected}
      data-testid={testId}
      disabled={disabled}
      style={style}
      onPointerDown={(e) => {
        if (keepFocus) e.preventDefault();
        if (!disabled) pressOn(e, sound);
      }}
      onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
      onClick={() => {
        if (!disabled) onPress();
      }}
    >
      {children}
    </button>
  );
}

/** A dangerous action: the first tap arms it ("Tap again to …"), the second within 3 s does it. */
export function ConfirmBtn({ className = "", label, confirmLabel, onConfirm, testId }: { className?: string; label: string; confirmLabel: string; onConfirm: () => void; testId?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Btn
      className={`${className}${armed ? " danger is-armed" : ""}`}
      testId={testId}
      label={armed ? confirmLabel : label}
      onPress={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : label}
    </Btn>
  );
}

export function TimerRing({ endsAt, startedAt, testId = "timer" }: { endsAt: number; startedAt: number; testId?: string }) {
  const left = useSecondsLeft(endsAt);
  const total = endsAt && startedAt ? Math.max(1, Math.round((endsAt - startedAt) / 1000)) : 1;
  const p = endsAt ? Math.min(1, left / total) : 0;
  const urgent = endsAt > 0 && left <= 10;
  return (
    <div className={`timer-ring${urgent ? " urgent" : ""}`} style={{ "--p": p }} data-testid={testId} aria-label={`${left} seconds left`} role="timer">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="track" cx="50" cy="50" r="42" />
        <circle className="fill" cx="50" cy="50" r="42" pathLength="100" />
      </svg>
      <span className="timer-num">{endsAt ? left : ""}</span>
    </div>
  );
}

/** The hint mask: one box per letter, revealed letters stamped in, spaces as gaps. */
export function Mask({ mask }: { mask: string }) {
  const letters = [...mask].filter((c) => c !== " ").filter((c) => /[\p{L}\p{N}_]/u.test(c)).length;
  const words = mask.split(" ");
  return (
    <div className="mask" data-testid="mask" aria-label={`Word: ${letters} letters`}>
      {words.map((w, wi) => (
        <span className="mask-word" key={wi}>
          {[...w].map((c, i) => {
            const hidden = c === "_";
            const fixed = !hidden && !/[\p{L}\p{N}]/u.test(c);
            return (
              <span key={i} className={`mask-letter${hidden ? "" : fixed ? " is-fixed" : " is-revealed"}`}>
                {hidden ? "" : c}
              </span>
            );
          })}
        </span>
      ))}
      <span className="mask-count">{letters}</span>
    </div>
  );
}

export function FeedRows({ feed, max = 4 }: { feed: readonly FeedEntry[]; max?: number }) {
  const rows = feed.slice(-max);
  return (
    <ul className="feed" data-testid="feed" aria-live="polite">
      {rows.map((f) => (
        <li key={f.seq} className={`feed-row kind-${f.kind}`}>
          {feedLine(f)}
        </li>
      ))}
    </ul>
  );
}

function feedLine(f: FeedEntry): ReactNode {
  switch (f.kind) {
    case "guess":
      return (
        <>
          <b>{f.name}</b> {f.text}
        </>
      );
    case "correct":
      return (
        <>
          <b>{f.name}</b> guessed it! <span className="points">{f.text}</span>
        </>
      );
    case "join":
      return (
        <>
          <b>{f.name}</b> joined
        </>
      );
    case "leave":
      return (
        <>
          <b>{f.name}</b> left
        </>
      );
    case "skip":
      return <>The host skipped the drawing</>;
    case "system":
      return f.text;
  }
}

export function NoticeToast({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  const tone = toneOf(notice.kind);
  return (
    <div key={notice.seq} className={`toast notice ${tone === "info" ? "info" : tone}`} role="status" data-testid="notice">
      {noticeText(notice)}
    </div>
  );
}

/** A player chip: avatar blob (OGS image or initials) + name (+ score). */
export function Chip({ seat, score, me, drawing, className = "" }: { seat: Seat; score?: boolean; me?: boolean; drawing?: boolean; className?: string }) {
  const cls = `chip${seat.connected ? "" : " is-away"}${seat.guessed ? " is-correct" : ""}${drawing ? " is-drawing" : ""}${me ? " is-me" : ""} ${className}`;
  return (
    <span className={cls} data-testid="player-chip">
      <span className="chip-avatar" style={{ "--hue": playerHue(seat.id) }}>
        {seat.avatar ? <img src={seat.avatar} alt="" /> : initials(seat.name)}
      </span>
      <span className="chip-name">
        {seat.name}
        {me ? " (you)" : ""}
      </span>
      {score ? <span className="chip-score">{seat.score}</span> : null}
    </span>
  );
}

/** Remembers the last value of `v` across renders (for "did it change" effects). */
export function usePrevious<T>(v: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = v;
  });
  return ref.current;
}
