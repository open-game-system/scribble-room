// The guess feed column: wrong guesses as text, correct guesses as a green toast that pops in
// ("Dee got it! +240", never the word), joins/skips as quiet info rows. Newest at the bottom.
import { Doodle } from "../brand";
import type { FeedEntry } from "../../shared/protocol";

const SHOWN = 14;

function Row({ f }: { f: FeedEntry }) {
  switch (f.kind) {
    case "correct":
      return (
        <li className="toast correct tv-feed-correct">
          <span className="tv-feed-name">{f.name} got it!</span>
          <span className="points">{f.text}</span>
        </li>
      );
    case "guess":
      return (
        <li className="feed-row tv-feed-guess">
          <b>{f.name}</b> <span>{f.text}</span>
        </li>
      );
    case "join":
      return <li className="feed-row tv-feed-info">{f.name} joined</li>;
    case "leave":
      return <li className="feed-row tv-feed-info">{f.name ? `${f.name} left` : "The drawer left"}</li>;
    case "skip":
      return <li className="feed-row tv-feed-info">Skipped by the host</li>;
    case "system":
      return <li className="feed-row tv-feed-info">{f.text}</li>;
  }
}

export function Feed({ feed, caption }: { feed: readonly FeedEntry[]; caption: string }) {
  const rows = feed.slice(-SHOWN);
  return (
    <section className="tv-feed" aria-label="Guesses">
      <header className="tv-feed-head">
        <span className="label">Guesses</span>
        <Doodle kind="squiggle" size={56} color="#1e6fe8" />
        <span className="tv-feed-caption">{caption}</span>
      </header>
      <ol className="tv-feed-list paper-ruled">
        {rows.length === 0 ? <li className="feed-row tv-feed-info">Type your guess on your phone</li> : null}
        {rows.map((f) => (
          <Row key={f.seq} f={f} />
        ))}
      </ol>
    </section>
  );
}
