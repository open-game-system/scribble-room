// The screens of a turn: the drawer picks and draws; everyone else waits, then guesses on the mirror.
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import type { CanvasView, PlayerView } from "../../shared/protocol";
import { sfx } from "../audio";
import type { OutMsg } from "../net";
import { DrawPad } from "./DrawPad";
import { wordSize } from "./geometry";
import type { Notice } from "./notices";
import { canSkip } from "./route";
import { Mirror } from "./Sheet";
import { Btn, Chip, ConfirmBtn, FeedRows, Mask, NoticeToast, TimerRing } from "./ui";

type Props = { view: PlayerView; canvas: CanvasView; send: (m: OutMsg) => void };

const nameOf = (view: PlayerView, id: string): string => view.players.find((p) => p.id === id)?.name ?? "Someone";

export function SkipControl({ view, send }: { view: PlayerView; send: (m: OutMsg) => void }) {
  if (!canSkip(view)) return null;
  return <ConfirmBtn className="skip" testId="skip" label="Skip drawing" confirmLabel="Skip it?" onConfirm={() => send({ type: "SKIP" })} />;
}

function Bar({ view, send, children }: { view: PlayerView; send: (m: OutMsg) => void; children: ReactNode }) {
  return (
    <header className="bar">
      <div className="bar-main">{children}</div>
      <SkipControl view={view} send={send} />
      <TimerRing endsAt={view.endsAt} startedAt={view.startedAt} />
    </header>
  );
}

export function Pick({ view, send }: Omit<Props, "canvas">) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <main className="screen pick" data-screen="pick">
      <Bar view={view} send={send}>
        <p className="headline">Your turn to draw!</p>
      </Bar>
      <p className="label pick-label">Pick a word</p>
      <div className="choices">
        {view.me.choices.map((c, i) => (
          <Btn
            key={c.word}
            className={`choice tilt-${i % 2 ? "r" : "l"}`}
            testId={`choice-${i}`}
            label={`Draw ${c.word} (${c.difficulty})`}
            selected={picked === i}
            disabled={picked !== null}
            sound={sfx.pick}
            onPress={() => {
              setPicked(i);
              send({ type: "PICK", index: i });
            }}
          >
            <span className="choice-word display" style={{ "--choice-fs": wordSize(c.word, 36) }}>
              {c.word}
            </span>
            <span className={`tag diff-${c.difficulty}`}>{c.difficulty}</span>
          </Btn>
        ))}
      </div>
      <p className="hint">If the clock runs out, you get the middle one.</p>
    </main>
  );
}

export function Choosing({ view, send }: Omit<Props, "canvas">) {
  const drawer = view.players.find((p) => p.id === view.drawerId);
  return (
    <main className="screen choosing" data-screen="choosing">
      <Bar view={view} send={send}>
        <p className="label">
          Round {view.round} of {view.settings.rounds}
        </p>
      </Bar>
      <div className="choosing-body">
        {drawer ? <Chip seat={drawer} drawing /> : null}
        <p className="headline">{drawer?.name ?? "Someone"} is choosing a word…</p>
        <p className="hint">Get ready to guess!</p>
      </div>
    </main>
  );
}

export function Draw({ view, canvas, send }: Props) {
  const guessers = view.players.filter((p) => p.id !== view.me.id && p.connected);
  const got = guessers.filter((p) => p.guessed).length;
  return (
    <main className="screen draw" data-screen="draw">
      <Bar view={view} send={send}>
        <p className="label">Draw this</p>
        <p className="word display" data-testid="draw-word" style={{ "--word-fs": wordSize(view.me.word, 34) }}>
          {view.me.word}
        </p>
        <p className="got" data-testid="got-count">
          {got} of {guessers.length} got it
        </p>
      </Bar>
      <DrawPad canvas={canvas} send={send} />
    </main>
  );
}

export function Guess({ view, canvas, send, notice }: Props & { notice: Notice | null }) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const drawer = nameOf(view, view.drawerId);
  const doSend = () => {
    const t = text.trim();
    if (!t) return;
    send({ type: "GUESS", text: t.slice(0, 60) });
    sfx.tap();
    setText("");
    input.current?.focus();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    doSend();
  };
  return (
    <main className="screen guess" data-screen="guess">
      <Bar view={view} send={send}>
        {view.me.guessed ? (
          <p className="word display" data-testid="guess-word" style={{ "--word-fs": wordSize(view.me.word, 34) }}>
            {view.me.word}
          </p>
        ) : (
          <Mask mask={view.mask} />
        )}
      </Bar>
      <p className="drawer-line">
        <b>{drawer}</b> is drawing
      </p>
      <Mirror canvas={canvas} />
      <FeedRows feed={view.feed} max={3} />
      <NoticeToast notice={notice} />
      {view.me.guessed ? (
        <div className="got-it" data-testid="got-it">
          <p>
            You got it: <span className="highlight green">{view.me.word}</span>
          </p>
          <p className="hint">Waiting for the others…</p>
        </div>
      ) : (
        <form className="guessbar" onSubmit={submit}>
          <input
            ref={input}
            className="input"
            data-testid="guess-input"
            aria-label="Your guess"
            placeholder="Type a guess"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={60}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="send"
          />
          <Btn className="primary send" testId="guess-send" label="Send guess" keepFocus disabled={!text.trim()} onPress={doSend}>
            Send
          </Btn>
        </form>
      )}
    </main>
  );
}
