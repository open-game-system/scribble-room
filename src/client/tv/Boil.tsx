// "Line boil": the hand-drawn wobble of Marker & Tape. Three displacement filters with different noise
// seeds; CSS steps between them at ~7 fps on outlines, tape and doodles (.boil targets in tv.css), so the
// stage never holds perfectly still. Never applied to the canvas or the hint mask (the focal area).
const SEEDS = [3, 11, 23] as const;

export function BoilFilters() {
  return (
    <svg className="tv-boil-defs" aria-hidden="true" width="0" height="0" focusable="false">
      <defs>
        {SEEDS.map((seed, i) => (
          <filter key={seed} id={`boil-${i}`} x="-2%" y="-2%" width="104%" height="104%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={seed} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={3} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}
