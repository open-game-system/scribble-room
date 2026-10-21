// Simple, recognizable pictures for the gameplay-video bot, in CANVAS units (1200×900).
// A picture is a list of ops: pen strokes (palette index, brush 0..2, polyline) and bucket fills.
// Palette: 0 ink, 1 white, 2 red, 3 orange, 4 yellow, 5 green, 6 blue, 7 purple, 8 pink, 9 brown, 10 grey, 11 sky.

export type Pt = readonly [number, number];
export type StrokeOp = { kind: "stroke"; color: number; size: number; pts: Pt[] };
export type FillOp = { kind: "fill"; color: number; at: Pt };
export type Op = StrokeOp | FillOp;

const INK = 0;
const RED = 2;
const ORANGE = 3;
const YELLOW = 4;
const GREEN = 5;
const BLUE = 6;
const PURPLE = 7;
const PINK = 8;
const BROWN = 9;
const GREY = 10;
const SKY = 11;

const s = (pts: Pt[], color = INK, size = 1): StrokeOp => ({ kind: "stroke", color, size, pts });
const fill = (x: number, y: number, color: number): FillOp => ({ kind: "fill", color, at: [x, y] });

/** Points along an ellipse arc, angles in degrees (0 = right, 90 = down). */
function arcPts(cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = 360): Pt[] {
  const len = (Math.abs(a1 - a0) / 360) * Math.PI * (rx + ry);
  const n = Math.max(6, Math.round(len / 22));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a))];
  });
}
const circle = (cx: number, cy: number, r: number, color = INK, size = 1) => s(arcPts(cx, cy, r, r), color, size);
const ellipse = (cx: number, cy: number, rx: number, ry: number, color = INK, size = 1) => s(arcPts(cx, cy, rx, ry), color, size);
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, color = INK, size = 1) => s(arcPts(cx, cy, r, r, a0, a1), color, size);
const line = (pts: Pt[], color = INK, size = 1) => s(pts, color, size);
const closed = (pts: Pt[], color = INK, size = 1) => s([...pts, ...pts.slice(0, 1)], color, size);
const rect = (x: number, y: number, w: number, h: number, color = INK, size = 1) =>
  closed([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], color, size);
const dot = (x: number, y: number, color = INK) => s([[x, y], [x + 2, y + 2]], color, 2);

function starPts(cx: number, cy: number, r: number, inner: number, points = 5): Pt[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const rr = i % 2 ? inner : r;
    const a = (Math.PI * i) / points - Math.PI / 2;
    return [Math.round(cx + rr * Math.cos(a)), Math.round(cy + rr * Math.sin(a))];
  });
}
function rays(cx: number, cy: number, r0: number, r1: number, n: number, color: number): StrokeOp[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return line([[cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)], [cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]].map(round), color, 1);
  });
}
const round = (p: readonly number[]): Pt => [Math.round(p[0] ?? 0), Math.round(p[1] ?? 0)];
function wave(x0: number, x1: number, y: number, amp: number, period: number, color = INK, size = 1): StrokeOp {
  const n = Math.round((x1 - x0) / 18);
  return s(Array.from({ length: n + 1 }, (_, i) => round([x0 + ((x1 - x0) * i) / n, y + amp * Math.sin((2 * Math.PI * i) / n / period)])), color, size);
}
const face = (cx: number, cy: number, r: number): Op[] => [
  dot(cx - r * 0.35, cy - r * 0.15),
  dot(cx + r * 0.35, cy - r * 0.15),
  arc(cx, cy + r * 0.1, r * 0.45, 20, 160),
];

const PICTURES: Record<string, () => Op[]> = {
  apple: () => [ellipse(600, 520, 210, 200), fill(600, 520, RED), line([[600, 320], [620, 190]], BROWN, 2), closed([[620, 240], [720, 180], [760, 230]], GREEN), fill(700, 215, GREEN)],
  heart: () => [closed(Array.from({ length: 48 }, (_, i) => { const a = (2 * Math.PI * i) / 48; return round([600 + 22 * 16 * Math.sin(a) ** 3, 420 - 22 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))]); }), RED), fill(600, 450, RED)],
  lemon: () => [closed([[290, 470], ...arcPts(600, 470, 280, 200, 185, 355).slice(1), [910, 470], ...arcPts(600, 470, 280, 200, 5, 175)]), fill(600, 470, YELLOW)],
  sun: () => [circle(600, 450, 150), fill(600, 450, YELLOW), ...rays(600, 450, 190, 290, 10, ORANGE)],
  moon: () => [closed([...arcPts(600, 450, 220, 220, 60, 300), ...arcPts(690, 450, 170, 170, 240, 120)]), fill(430, 450, YELLOW), closed(starPts(950, 220, 50, 20)), fill(950, 220, YELLOW)],
  star: () => [closed(starPts(600, 470, 300, 125)), fill(600, 470, YELLOW)],
  cat: () => [
    circle(600, 500, 220),
    closed([[430, 370], [440, 160], [560, 290]]),
    closed([[770, 370], [760, 160], [640, 290]]),
    ellipse(520, 460, 22, 34), ellipse(680, 460, 22, 34),
    closed([[580, 540], [620, 540], [600, 565]], PINK),
    line([[600, 565], [600, 600], [560, 630]]), line([[600, 600], [640, 630]]),
    line([[480, 560], [300, 530]]), line([[480, 590], [300, 610]]), line([[720, 560], [900, 530]]), line([[720, 590], [900, 610]]),
  ],
  dog: () => [
    circle(600, 470, 200),
    ellipse(400, 470, 60, 150, BROWN), fill(370, 470, BROWN), ellipse(800, 470, 60, 150, BROWN), fill(830, 470, BROWN),
    dot(530, 430), dot(670, 430), ellipse(600, 520, 40, 28), fill(600, 520, INK), arc(600, 560, 60, 20, 160),
  ],
  fish: () => [ellipse(560, 450, 260, 150), closed([[810, 450], [1010, 300], [1010, 600]]), fill(560, 470, ORANGE), fill(950, 450, ORANGE), dot(420, 410), arc(620, 450, 100, 120, 240), wave(150, 1050, 760, 20, 0.25, SKY)],
  bird: () => [ellipse(600, 500, 200, 140), circle(780, 360, 90), closed([[860, 350], [960, 380], [860, 400]], ORANGE), fill(600, 520, SKY), dot(800, 340), arc(560, 470, 110, 160, 20), line([[560, 640], [550, 760]]), line([[640, 640], [650, 760]])],
  tree: () => [rect(540, 520, 120, 320, BROWN), fill(600, 700, BROWN), circle(600, 360, 250, GREEN), fill(600, 360, GREEN), dot(520, 300, RED), dot(680, 380, RED), dot(580, 450, RED)],
  flower: () => [
    ...[0, 60, 120, 180, 240, 300].map((a) => circle(600 + 130 * Math.cos((a * Math.PI) / 180), 330 + 130 * Math.sin((a * Math.PI) / 180), 75, PINK)),
    circle(600, 330, 75, ORANGE), fill(600, 330, YELLOW),
    line([[600, 470], [600, 860]], GREEN, 2), ellipse(690, 680, 80, 35, GREEN), fill(690, 680, GREEN),
  ],
  house: () => [rect(330, 420, 540, 400), closed([[290, 430], [600, 150], [910, 430]]), fill(600, 330, RED), rect(540, 620, 120, 200), fill(600, 720, BROWN), rect(400, 500, 100, 100), rect(700, 500, 100, 100), fill(450, 550, SKY), fill(750, 550, SKY)],
  car: () => [
    closed([[220, 600], [220, 480], [380, 470], [460, 340], [760, 340], [860, 470], [990, 490], [990, 600]]),
    fill(600, 540, RED),
    closed([[490, 370], [590, 370], [590, 460], [430, 460]]), closed([[630, 370], [740, 370], [810, 460], [630, 460]]),
    fill(530, 430, SKY), fill(690, 430, SKY),
    circle(380, 620, 75), fill(380, 620, INK), circle(820, 620, 75), fill(820, 620, INK),
  ],
  ball: () => [circle(600, 450, 260), fill(600, 450, RED), arc(600, 450, 260, 180, 360, INK, 1), arc(600, 190, 260, 60, 120)],
  hat: () => [rect(470, 220, 260, 380), fill(600, 400, INK), ellipse(600, 610, 300, 60), line([[470, 520], [730, 520]], RED, 2)],
  cake: () => [rect(330, 470, 540, 330), fill(600, 650, PINK), wave(330, 870, 470, 25, 0.2, BROWN, 2), rect(580, 300, 40, 160, BLUE), s([[600, 300], [570, 250], [600, 190], [630, 250], [600, 300]], ORANGE), fill(600, 260, YELLOW)],
  egg: () => [ellipse(600, 470, 210, 280), fill(600, 470, YELLOW), ellipse(600, 790, 340, 50, GREY)],
  cup: () => [s([[380, 280], [420, 760], [760, 760], [800, 280]]), line([[380, 280], [800, 280]]), fill(600, 520, BLUE), arc(800, 500, 110, 270, 450, INK, 2), line([[540, 230], [560, 150]], GREY), line([[640, 230], [660, 140]], GREY)],
  boat: () => [closed([[260, 560], [940, 560], [820, 720], [380, 720]]), fill(600, 640, BROWN), line([[600, 560], [600, 140]], INK, 2), closed([[610, 160], [610, 520], [880, 520]]), fill(700, 440, RED), wave(100, 1100, 770, 22, 0.15, BLUE, 2)],
  cloud: () => [closed([...arcPts(420, 520, 130, 130, 90, 270), ...arcPts(560, 380, 160, 160, 180, 340), ...arcPts(780, 440, 140, 140, 230, 400), ...arcPts(600, 560, 240, 70, 20, 160)], SKY), fill(600, 470, SKY)],
  rainbow: () => [RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE].map((c, i) => arc(600, 760, 470 - i * 45, 180, 360, c, 2)),
  kite: () => [closed([[600, 120], [800, 360], [600, 640], [400, 360]]), fill(600, 360, RED), line([[600, 120], [600, 640]]), line([[400, 360], [800, 360]]), s([[600, 640], [560, 700], [640, 740], [560, 790], [640, 840]], BLUE)],
  balloon: () => [ellipse(600, 360, 190, 240), fill(600, 360, RED), closed([[600, 600], [575, 640], [625, 640]]), s([[600, 640], [570, 700], [630, 770], [590, 860]])],
  circle: () => [circle(600, 450, 300, BLUE, 2)],
  square: () => [rect(330, 180, 540, 540, PURPLE, 2)],
  triangle: () => [closed([[600, 150], [920, 750], [280, 750]], GREEN, 2)],
  snail: () => [
    s(Array.from({ length: 60 }, (_, i) => round([620 + (12 + i * 3) * Math.cos(i * 0.32), 420 + (12 + i * 3) * Math.sin(i * 0.32)])), BROWN, 1),
    s([[400, 600], [900, 600], [960, 560], [940, 450]]), line([[920, 470], [900, 360]]), line([[950, 460], [990, 370]]),
  ],
  snake: () => [wave(200, 920, 500, 120, 0.5, GREEN, 2), circle(960, 500, 50, GREEN), fill(960, 500, GREEN), line([[1010, 500], [1080, 480]], RED), line([[1010, 500], [1080, 520]], RED)],
  key: () => [circle(380, 450, 130), fill(380, 450, YELLOW), circle(380, 450, 40), line([[510, 450], [960, 450]], INK, 2), line([[880, 450], [880, 560]], INK, 2), line([[800, 450], [800, 530]], INK, 2)],
  clock: () => [circle(600, 450, 290), ...Array.from({ length: 12 }, (_, i) => line([[600 + 250 * Math.cos((i * Math.PI) / 6), 450 + 250 * Math.sin((i * Math.PI) / 6)], [600 + 275 * Math.cos((i * Math.PI) / 6), 450 + 275 * Math.sin((i * Math.PI) / 6)]].map(round))), line([[600, 450], [600, 260]], INK, 2), line([[600, 450], [740, 520]], RED, 2)],
  crown: () => [closed([[300, 700], [300, 320], [430, 500], [600, 260], [770, 500], [900, 320], [900, 700]]), fill(600, 580, YELLOW), dot(450, 620, RED), dot(600, 620, BLUE), dot(750, 620, GREEN)],
  ring: () => [ellipse(600, 560, 200, 190, YELLOW, 2), closed([[530, 360], [600, 260], [670, 360], [600, 300]], SKY), closed([[520, 230], [680, 230], [600, 370]], SKY), fill(600, 270, SKY)],
  pizza: () => [closed([[600, 800], [300, 220], [900, 220]]), arc(600, 240, 300, 180, 360, BROWN, 2), fill(600, 400, YELLOW), circle(560, 350, 40, RED), circle(680, 380, 40, RED), circle(600, 560, 40, RED)],
  lollipop: () => [s(Array.from({ length: 50 }, (_, i) => round([600 + (8 + i * 4) * Math.cos(i * 0.4), 350 + (8 + i * 4) * Math.sin(i * 0.4)])), PINK, 2), line([[600, 560], [600, 870]], GREY, 2)],
  "ice cream": () => [closed([[460, 420], [740, 420], [600, 860]]), fill(600, 560, ORANGE), circle(600, 330, 150), fill(600, 330, PINK), dot(600, 170, RED)],
  cupcake: () => [closed([[420, 480], [780, 480], [730, 800], [470, 800]]), fill(600, 640, BLUE), s([[420, 480], ...arcPts(600, 480, 180, 200, 180, 360).slice(1)]), fill(600, 400, PINK), dot(600, 270, RED)],
  donut: () => [circle(600, 450, 270), circle(600, 450, 90), fill(600, 260, PINK), dot(520, 290, BLUE), dot(720, 350, YELLOW), dot(470, 560, GREEN)],
  umbrella: () => [s([...arcPts(600, 420, 360, 260, 180, 360), [960, 420], [840, 400], [720, 420], [600, 400], [480, 420], [360, 400], [240, 420]]), fill(600, 300, PURPLE), line([[600, 420], [600, 780]], INK, 2), arc(650, 780, 50, 0, 180, INK, 2)],
  ladder: () => [line([[460, 100], [460, 860]], BROWN, 2), line([[740, 100], [740, 860]], BROWN, 2), ...[180, 320, 460, 600, 740].map((y) => line([[460, y], [740, y]], BROWN, 2))],
  tent: () => [closed([[200, 780], [600, 200], [1000, 780]]), fill(400, 650, ORANGE), closed([[520, 780], [600, 520], [680, 780]]), fill(600, 700, INK), line([[100, 780], [1100, 780]], GREEN, 2)],
  snowman: () => [circle(600, 680, 170), circle(600, 400, 120), circle(600, 210, 85), dot(570, 195), dot(630, 195), closed([[600, 215], [680, 230], [600, 240]], ORANGE), dot(600, 380), dot(600, 430), rect(530, 70, 140, 70), fill(600, 105, INK)],
  rocket: () => [closed([[520, 700], [520, 330], [600, 140], [680, 330], [680, 700]]), circle(600, 400, 45), fill(600, 400, SKY), closed([[520, 560], [430, 720], [520, 700]], RED), closed([[680, 560], [770, 720], [680, 700]], RED), s([[540, 710], [600, 860], [660, 710]], ORANGE, 2)],
  plane: () => [ellipse(600, 450, 420, 70), closed([[540, 440], [400, 180], [480, 180], [700, 440]]), closed([[540, 470], [400, 720], [480, 720], [700, 470]]), closed([[230, 440], [190, 300], [260, 300], [320, 430]]), fill(600, 450, GREY)],
  bike: () => [circle(370, 600, 150), circle(830, 600, 150), s([[370, 600], [520, 400], [760, 400], [830, 600]], RED, 2), line([[520, 400], [600, 600], [760, 400]], RED, 2), line([[490, 360], [560, 360]], INK, 2), line([[760, 400], [740, 330], [800, 320]], INK, 2)],
  truck: () => [rect(180, 300, 520, 330), fill(440, 460, BLUE), closed([[700, 400], [880, 400], [980, 500], [980, 630], [700, 630]]), fill(820, 560, RED), closed([[730, 420], [860, 420], [930, 500], [730, 500]]), circle(330, 650, 70), circle(830, 650, 70), fill(330, 650, INK), fill(830, 650, INK)],
  bus: () => [rect(160, 260, 880, 400), fill(600, 600, YELLOW), ...[220, 400, 580, 760].map((x) => rect(x, 320, 140, 120)), rect(920, 320, 90, 220), circle(320, 680, 70), circle(860, 680, 70), fill(320, 680, INK), fill(860, 680, INK)],
  door: () => [rect(420, 100, 360, 760), fill(600, 480, BROWN), circle(720, 500, 25), fill(720, 500, YELLOW), rect(470, 160, 260, 220)],
  window: () => [rect(330, 180, 540, 540), fill(450, 300, SKY), fill(750, 300, SKY), fill(450, 600, SKY), fill(750, 600, SKY), line([[600, 180], [600, 720]], INK, 2), line([[330, 450], [870, 450]], INK, 2)],
  table: () => [closed([[200, 380], [1000, 380], [1000, 440], [200, 440]]), fill(600, 410, BROWN), line([[260, 440], [260, 800]], BROWN, 2), line([[940, 440], [940, 800]], BROWN, 2)],
  chair: () => [line([[430, 150], [430, 820]], BROWN, 2), line([[430, 500], [780, 500], [780, 820]], BROWN, 2), line([[430, 150], [520, 150], [520, 500]], BROWN, 2), line([[430, 300], [520, 300]], BROWN, 2)],
  bed: () => [rect(200, 480, 800, 200), fill(600, 580, BLUE), line([[200, 300], [200, 820]], BROWN, 2), line([[1000, 400], [1000, 820]], BROWN, 2), ellipse(310, 450, 90, 40), fill(310, 450, PINK)],
  book: () => [closed([[600, 280], [300, 220], [300, 700], [600, 760]]), closed([[600, 280], [900, 220], [900, 700], [600, 760]]), fill(450, 480, SKY), fill(750, 480, SKY), ...[340, 420, 500].map((y) => line([[360, y], [540, y + 30]])), ...[340, 420, 500].map((y) => line([[660, y + 30], [840, y]]))],
  bell: () => [s([[380, 680], ...arcPts(600, 330, 160, 190, 180, 360).slice(0), [820, 680]]), line([[340, 680], [860, 680]], INK, 2), fill(600, 500, YELLOW), circle(600, 740, 45), fill(600, 740, ORANGE), line([[600, 140], [600, 90]], INK, 2)],
  drum: () => [ellipse(600, 380, 260, 80), s([[340, 380], [340, 720], ...arcPts(600, 720, 260, 80, 180, 0), [860, 380]]), fill(600, 580, RED), line([[480, 200], [620, 340]], BROWN, 2), line([[760, 190], [640, 330]], BROWN, 2)],
  cookie: () => [circle(600, 450, 270), fill(600, 450, ORANGE), ...[[520, 350], [680, 390], [560, 540], [720, 560], [470, 460], [620, 640]].map(([x, y]) => dot(x ?? 0, y ?? 0, BROWN))],
  bowl: () => [s([[260, 420], ...arcPts(600, 420, 340, 300, 180, 0).slice(1)]), line([[260, 420], [940, 420]]), fill(600, 560, BLUE), line([[540, 360], [520, 260]], GREY), line([[660, 360], [680, 250]], GREY)],
  spoon: () => [ellipse(600, 280, 110, 160), fill(600, 280, GREY), line([[600, 440], [600, 860]], GREY, 2)],
  fork: () => [line([[600, 420], [600, 860]], GREY, 2), s([[480, 160], [480, 400], [720, 400], [720, 160]], GREY, 2), line([[560, 160], [560, 400]], GREY, 2), line([[640, 160], [640, 400]], GREY, 2)],
  pencil: () => [closed([[200, 380], [860, 380], [1000, 450], [860, 520], [200, 520]]), fill(500, 450, YELLOW), line([[860, 380], [860, 520]]), rect(140, 380, 60, 140, PINK), fill(170, 450, PINK)],
  eye: () => [s([...arcPts(600, 750, 420, 420, 220, 320), ...arcPts(600, 150, 420, 420, 40, 140)]), circle(600, 450, 120), fill(600, 450, BLUE), circle(600, 450, 50), fill(600, 450, INK)],
  smile: () => [circle(600, 450, 280), fill(600, 450, YELLOW), ...face(600, 450, 280)],
  whale: () => [s([[200, 500], ...arcPts(520, 500, 320, 220, 180, 360).slice(1), [840, 500], [980, 380], [990, 600], [840, 520], ...arcPts(520, 500, 320, 140, 0, 180).slice(1)]), fill(520, 450, BLUE), dot(320, 470), line([[460, 280], [440, 160]], SKY, 2), line([[460, 280], [520, 170]], SKY, 2)],
  turtle: () => [s([[300, 600], ...arcPts(600, 600, 300, 260, 180, 360).slice(1)]), line([[300, 600], [900, 600]]), fill(600, 480, GREEN), circle(960, 560, 70), fill(960, 560, GREEN), dot(980, 545), ellipse(400, 640, 50, 40), ellipse(800, 640, 50, 40)],
  bee: () => [ellipse(600, 500, 230, 150), fill(600, 500, YELLOW), line([[540, 360], [540, 640]], INK, 2), line([[650, 360], [650, 640]], INK, 2), ellipse(540, 280, 90, 110, SKY), ellipse(680, 280, 90, 110, SKY), dot(780, 470), closed([[370, 480], [300, 500], [370, 520]])],
  spider: () => [circle(600, 470, 150), fill(600, 470, INK), circle(600, 270, 70), fill(600, 270, INK), ...[-1, 1].flatMap((d) => [380, 440, 500, 560].map((y, i) => line([[600 + d * 140, y], [600 + d * (300 + i * 20), y - 90 + i * 40], [600 + d * (380 + i * 20), y + 60 + i * 40]], INK, 1))), line([[600, 200], [600, 30]])],
  butterfly: () => [ellipse(450, 330, 150, 170, PURPLE), ellipse(750, 330, 150, 170, PURPLE), ellipse(470, 610, 110, 120, PINK), ellipse(730, 610, 110, 120, PINK), fill(450, 330, PURPLE), fill(750, 330, PURPLE), fill(470, 620, PINK), fill(730, 620, PINK), line([[600, 200], [600, 760]], INK, 2), line([[600, 200], [540, 100]]), line([[600, 200], [660, 100]])],
  ladybug: () => [circle(600, 500, 260), fill(600, 500, RED), circle(600, 210, 90), fill(600, 210, INK), line([[600, 300], [600, 760]], INK, 2), dot(480, 420), dot(720, 420), dot(470, 580), dot(730, 580)],
  worm: () => [wave(200, 1000, 500, 90, 0.33, PINK, 2), dot(1000, 490)],
  owl: () => [ellipse(600, 480, 240, 330), fill(600, 700, BROWN), circle(510, 380, 85), circle(690, 380, 85), fill(510, 380, YELLOW), fill(690, 380, YELLOW), dot(510, 380), dot(690, 380), closed([[570, 470], [630, 470], [600, 530]], ORANGE), closed([[400, 220], [430, 120], [490, 200]]), closed([[800, 220], [770, 120], [710, 200]])],
  pig: () => [circle(600, 460, 260), fill(600, 640, PINK), ellipse(600, 520, 100, 70), fill(600, 520, PINK), dot(570, 520), dot(630, 520), dot(520, 400), dot(680, 400), closed([[400, 280], [400, 160], [500, 220]]), closed([[800, 280], [800, 160], [700, 220]])],
  mouse: () => [circle(600, 520, 200), circle(390, 290, 120), circle(810, 290, 120), fill(390, 290, PINK), fill(810, 290, PINK), dot(530, 500), dot(670, 500), dot(600, 590, PINK), line([[500, 600], [380, 580]]), line([[700, 600], [820, 580]])],
  rabbit: () => [circle(600, 560, 200), ellipse(520, 230, 55, 160), ellipse(680, 230, 55, 160), fill(520, 230, PINK), fill(680, 230, PINK), dot(530, 530), dot(670, 530), closed([[580, 600], [620, 600], [600, 625]], PINK), arc(600, 620, 50, 20, 160)],
  bear: () => [circle(600, 500, 230), circle(420, 300, 80), circle(780, 300, 80), fill(600, 650, BROWN), fill(420, 290, BROWN), fill(780, 290, BROWN), ellipse(600, 570, 90, 65), dot(530, 450), dot(670, 450), dot(600, 545)],
  lion: () => [closed(starPts(600, 470, 330, 250, 14)), fill(600, 170, ORANGE), circle(600, 470, 200), fill(600, 470, YELLOW), ...face(600, 470, 200)],
  frog: () => [s([[300, 520], ...arcPts(470, 340, 90, 90, 160, 360).slice(1), ...arcPts(730, 340, 90, 90, 180, 380).slice(1), [900, 520], ...arcPts(600, 520, 300, 230, 0, 180).slice(1)]), fill(600, 560, GREEN), circle(470, 330, 40), circle(730, 330, 40), fill(470, 330, INK), fill(730, 330, INK), arc(600, 480, 200, 30, 150, RED, 2)],
  nest: () => [ellipse(500, 470, 90, 120, SKY), ellipse(700, 470, 90, 120, SKY), fill(500, 470, SKY), fill(700, 470, SKY), s([[220, 520], ...arcPts(600, 520, 380, 280, 180, 0).slice(1)], BROWN, 2), wave(240, 960, 600, 20, 0.12, BROWN, 1), wave(280, 920, 680, 20, 0.12, BROWN, 1)],
  sock: () => [closed([[480, 120], [700, 120], [700, 560], [820, 640], [820, 780], [540, 780], [480, 700]]), fill(600, 400, RED), line([[480, 220], [700, 220]], INK, 2)],
  mitten: () => [closed([[420, 800], [420, 300], ...arcPts(560, 300, 140, 160, 180, 360).slice(1), [700, 420], [780, 360], [840, 420], [700, 600], [700, 800]]), fill(560, 500, BLUE), rect(400, 720, 320, 80, INK, 1)],
  glove: () => [closed([[420, 800], [420, 300], ...arcPts(560, 300, 140, 160, 180, 360).slice(1), [700, 420], [780, 360], [840, 420], [700, 600], [700, 800]]), fill(560, 500, GREEN), rect(400, 720, 320, 80, INK, 1)],
  bag: () => [rect(330, 360, 540, 440), fill(600, 580, PURPLE), arc(600, 360, 140, 180, 360, INK, 2)],
  box: () => [rect(330, 360, 400, 400), closed([[330, 360], [470, 230], [870, 230], [730, 360]]), closed([[730, 360], [870, 230], [870, 630], [730, 760]]), fill(530, 560, BROWN)],
  bucket: () => [closed([[380, 340], [820, 340], [760, 800], [440, 800]]), fill(600, 560, RED), arc(600, 340, 220, 180, 360, INK, 1)],
  cherry: () => [circle(470, 620, 120), circle(740, 640, 120), fill(470, 620, RED), fill(740, 640, RED), s([[470, 500], [580, 180], [740, 520]], GREEN), ellipse(650, 200, 80, 30, GREEN)],
  grape: () => [...[[520, 300], [680, 300], [440, 430], [600, 430], [760, 430], [520, 560], [680, 560], [600, 690]].map(([x, y]) => circle(x ?? 0, y ?? 0, 75, PURPLE)), ...[[520, 300], [680, 300], [440, 430], [600, 430], [760, 430], [520, 560], [680, 560], [600, 690]].map(([x, y]) => fill(x ?? 0, y ?? 0, PURPLE)), line([[600, 230], [620, 120]], BROWN, 2)],
  pear: () => [closed([...arcPts(600, 330, 120, 140, 180, 360), ...arcPts(600, 600, 230, 230, -20, 200)]), fill(600, 600, GREEN), line([[600, 190], [620, 110]], BROWN, 2)],
  orange: () => [circle(600, 480, 260), fill(600, 480, ORANGE), ellipse(660, 200, 80, 35, GREEN), fill(660, 200, GREEN), dot(600, 225)],
  watermelon: () => [s([[200, 300], ...arcPts(600, 300, 400, 450, 180, 0).slice(1), [200, 300]], GREEN, 2), arc(600, 300, 340, 0, 180, GREEN, 1), fill(600, 450, RED), ...[[480, 400], [600, 450], [720, 400], [560, 560], [660, 560]].map(([x, y]) => dot(x ?? 0, y ?? 0))],
  strawberry: () => [s([[330, 340], ...arcPts(600, 340, 270, 120, 180, 360).slice(1), [600, 820], [330, 340]]), fill(600, 480, RED), closed(starPts(600, 250, 130, 50, 6), GREEN), fill(600, 250, GREEN), ...[[520, 420], [680, 420], [600, 520], [540, 620], [660, 620]].map(([x, y]) => dot(x ?? 0, y ?? 0, YELLOW))],
  tomato: () => [circle(600, 500, 270), fill(600, 520, RED), closed(starPts(600, 250, 110, 40, 5), GREEN), fill(600, 250, GREEN)],
  fire: () => [s([[600, 120], [760, 400], [820, 620], [720, 820], [480, 820], [380, 620], [460, 440], [520, 560], [600, 120]], RED, 2), fill(620, 650, ORANGE), s([[600, 560], [680, 700], [600, 800], [520, 700], [600, 560]], YELLOW), fill(600, 700, YELLOW)],
  rain: () => [s([...arcPts(420, 360, 120, 120, 90, 270), ...arcPts(600, 260, 160, 140, 180, 360), ...arcPts(780, 360, 120, 120, 270, 450), [420, 480]], GREY), fill(600, 360, GREY), ...[[420, 560], [560, 620], [700, 560], [480, 720], [640, 760], [780, 700]].map(([x, y]) => line([[x ?? 0, y ?? 0], [(x ?? 0) - 20, (y ?? 0) + 70]], BLUE, 2))],
  snow: () => [...[0, 60, 120].map((a) => line([[600 - 300 * Math.cos((a * Math.PI) / 180), 450 - 300 * Math.sin((a * Math.PI) / 180)], [600 + 300 * Math.cos((a * Math.PI) / 180), 450 + 300 * Math.sin((a * Math.PI) / 180)]].map(round), SKY, 2)), ...rays(600, 450, 190, 230, 6, SKY)],
  bone: () => [circle(300, 380, 80), circle(300, 520, 80), circle(900, 380, 80), circle(900, 520, 80), rect(330, 400, 540, 100), fill(600, 450, GREY)],
  tooth: () => [s([[380, 300], ...arcPts(490, 300, 110, 90, 180, 360).slice(1), ...arcPts(710, 300, 110, 90, 180, 360), [800, 700], [700, 780], [620, 560], [580, 560], [500, 780], [400, 700], [380, 300]]), dot(560, 380, SKY)],
  lamp: () => [closed([[460, 200], [740, 200], [840, 440], [360, 440]]), fill(600, 320, YELLOW), line([[600, 440], [600, 760]], INK, 2), ellipse(600, 780, 160, 40), fill(600, 780, GREY)],
  robot: () => [rect(420, 160, 360, 260), fill(600, 380, GREY), rect(380, 450, 440, 360), fill(600, 700, BLUE), circle(520, 260, 40), circle(680, 260, 40), fill(520, 260, RED), fill(680, 260, RED), line([[540, 360], [660, 360]], INK, 2), line([[600, 160], [600, 80]], INK, 2), dot(600, 70, RED)],
  sandwich: () => [closed([[300, 360], [900, 360], [940, 440], [260, 440]]), fill(600, 400, ORANGE), wave(260, 940, 470, 20, 0.12, GREEN, 2), rect(270, 490, 660, 40, RED, 1), fill(600, 510, RED), closed([[260, 560], [940, 560], [900, 640], [300, 640]]), fill(600, 600, ORANGE)],
  candy: () => [ellipse(600, 450, 170, 120), fill(600, 450, PINK), closed([[430, 450], [260, 330], [260, 570]]), closed([[770, 450], [940, 330], [940, 570]]), fill(320, 450, PINK), fill(880, 450, PINK)],
  bread: () => [s([[320, 760], [320, 440], ...arcPts(600, 400, 300, 200, 180, 360).slice(1), [880, 760], [320, 760]]), fill(600, 560, ORANGE)],
  cheese: () => [closed([[240, 620], [960, 400], [960, 700], [240, 760]]), closed([[240, 620], [800, 300], [960, 400]]), fill(600, 650, YELLOW), fill(800, 380, YELLOW), circle(500, 680, 30), circle(780, 600, 40)],
  milk: () => [closed([[440, 820], [440, 320], [520, 180], [680, 180], [760, 320], [760, 820]]), line([[440, 320], [760, 320]]), fill(600, 560, SKY), rect(560, 120, 80, 60)],
  comb: () => [rect(240, 340, 720, 90), fill(600, 380, BLUE), ...Array.from({ length: 14 }, (_, i) => line([[280 + i * 50, 430], [280 + i * 50, 600]], BLUE, 1))],
  toothbrush: () => [rect(200, 520, 640, 60), fill(500, 550, BLUE), ...Array.from({ length: 6 }, (_, i) => line([[820 + i * 25, 520], [820 + i * 25, 400]], SKY, 1)), rect(820, 400, 140, 60, SKY)],
  crayon: () => [closed([[240, 380], [840, 380], [980, 450], [840, 520], [240, 520]]), fill(500, 450, RED), line([[320, 380], [320, 520]]), line([[760, 380], [760, 520]])],
  shovel: () => [line([[600, 80], [600, 520]], BROWN, 2), line([[540, 80], [660, 80]], BROWN, 2), s([[460, 520], [740, 520], [740, 700], [600, 840], [460, 700], [460, 520]], GREY, 2), fill(600, 650, GREY)],
  swing: () => [line([[220, 820], [360, 140], [840, 140], [980, 820]], RED, 2), line([[520, 140], [520, 620]]), line([[680, 140], [680, 620]]), rect(490, 620, 220, 40), fill(600, 640, BROWN)],
  king: () => [circle(600, 560, 220), ...face(600, 560, 220), closed([[400, 360], [400, 120], [500, 240], [600, 100], [700, 240], [800, 120], [800, 360]]), fill(600, 290, YELLOW)],
  queen: () => [circle(600, 560, 220), ...face(600, 560, 220), closed([[420, 360], [440, 160], [520, 260], [600, 140], [680, 260], [760, 160], [780, 360]]), fill(600, 300, YELLOW), dot(600, 220, PINK), line([[380, 560], [360, 840]], ORANGE, 2), line([[820, 560], [840, 840]], ORANGE, 2)],
  shark: () => [s([[160, 520], [440, 380], [560, 160], [620, 360], [900, 400], [1060, 300], [1000, 500], [1060, 680], [900, 560], [440, 620], [160, 520]]), fill(600, 480, GREY), dot(300, 480), wave(100, 1100, 760, 20, 0.15, BLUE, 2)],
  penguin: () => [ellipse(600, 470, 220, 340), fill(600, 200, INK), ellipse(600, 540, 140, 230), dot(550, 240, YELLOW), dot(650, 240, YELLOW), closed([[570, 300], [630, 300], [600, 350]], ORANGE), ellipse(520, 830, 70, 25, ORANGE), ellipse(680, 830, 70, 25, ORANGE)],
  elephant: () => [ellipse(560, 500, 300, 210), fill(560, 500, GREY), circle(840, 400, 130), fill(840, 400, GREY), s([[930, 460], [960, 640], [1010, 760], [1060, 740]], GREY, 2), ellipse(760, 380, 70, 110), dot(870, 370), ...[340, 460, 640, 760].map((x) => line([[x, 680], [x, 830]], GREY, 2))],
  monkey: () => [circle(600, 470, 220), fill(600, 300, BROWN), circle(380, 470, 70), circle(820, 470, 70), fill(380, 470, BROWN), fill(820, 470, BROWN), ellipse(600, 540, 140, 100), dot(540, 420), dot(660, 420), arc(600, 560, 60, 20, 160)],
  tiger: () => [circle(600, 480, 240), fill(600, 650, ORANGE), closed([[420, 330], [430, 200], [520, 270]]), closed([[780, 330], [770, 200], [680, 270]]), line([[600, 260], [600, 330]], INK, 2), line([[400, 450], [470, 470]], INK, 2), line([[800, 450], [730, 470]], INK, 2), ...face(600, 480, 240)],
  fox: () => [closed([[320, 260], [420, 120], [500, 300], [700, 300], [780, 120], [880, 260], [820, 480], [600, 780], [380, 480]]), fill(600, 400, ORANGE), dot(500, 420), dot(700, 420), dot(600, 740)],
  sheep: () => [s([...arcPts(600, 480, 300, 200).map((p, i): Pt => (i % 2 ? [Math.round(600 + (p[0] - 600) * 1.12), Math.round(480 + (p[1] - 480) * 1.12)] : p))], GREY), ellipse(900, 380, 80, 110), fill(900, 380, INK), ...[440, 560, 680, 780].map((x) => line([[x, 680], [x, 820]], INK, 2))],
  chicken: () => [circle(560, 520, 210), circle(760, 300, 100), fill(560, 520, YELLOW), fill(760, 300, YELLOW), closed([[850, 300], [940, 330], [850, 350]], ORANGE), dot(780, 280), s([[720, 210], [740, 160], [770, 200], [800, 160], [810, 220]], RED, 2), line([[520, 720], [500, 840]], ORANGE, 2), line([[620, 720], [640, 840]], ORANGE, 2)],
  cow: () => [ellipse(560, 480, 300, 190), fill(400, 560, INK), ellipse(560, 480, 300, 190), ellipse(900, 420, 110, 90), ellipse(920, 470, 70, 40, PINK), dot(870, 390), closed([[840, 330], [820, 260], [870, 320]]), ...[340, 460, 660, 780].map((x) => line([[x, 640], [x, 820]], INK, 2))],
  horse: () => [ellipse(560, 480, 260, 140), closed([[760, 400], [860, 180], [980, 200], [990, 270], [860, 330], [800, 460]]), fill(560, 480, BROWN), fill(880, 250, BROWN), s([[840, 190], [760, 280], [740, 380]], INK, 2), ...[380, 460, 660, 740].map((x) => line([[x, 590], [x, 820]], BROWN, 2)), s([[300, 450], [200, 600]], INK, 2)],
  giraffe: () => [ellipse(520, 560, 220, 120), fill(520, 560, YELLOW), line([[680, 500], [800, 140]], YELLOW, 2), line([[720, 520], [840, 150]], YELLOW, 2), ellipse(860, 130, 90, 50, YELLOW), fill(860, 130, YELLOW), ...[380, 460, 600, 680].map((x) => line([[x, 660], [x, 860]], YELLOW, 2)), dot(460, 540, BROWN), dot(580, 580, BROWN), dot(520, 500, BROWN)],
  zebra: () => [ellipse(560, 480, 260, 140), closed([[760, 400], [860, 180], [980, 200], [990, 270], [860, 330], [800, 460]]), ...[420, 500, 580, 660].map((x) => line([[x, 360], [x + 20, 600]], INK, 2)), ...[380, 460, 660, 740].map((x) => line([[x, 590], [x, 820]], INK, 2))],
  dolphin: () => [s([[180, 480], ...arcPts(560, 560, 400, 260, 180, 330).slice(1), [1000, 380], [960, 460], [900, 450], ...arcPts(560, 460, 340, 120, 0, 160).slice(1), [180, 480]]), fill(560, 400, SKY), closed([[540, 300], [600, 180], [660, 310]]), fill(600, 270, SKY), dot(320, 430), wave(100, 1100, 760, 20, 0.15, BLUE, 2)],
  "teddy bear": () => [circle(600, 300, 150), circle(470, 170, 55), circle(730, 170, 55), ellipse(600, 620, 200, 230), fill(600, 620, BROWN), fill(600, 300, BROWN), ellipse(600, 350, 55, 40), dot(550, 270), dot(650, 270), dot(600, 340)],
  corn: () => [ellipse(600, 430, 120, 320), fill(600, 430, YELLOW), ...[300, 400, 500, 600].map((y) => line([[490, y], [710, y]], ORANGE, 1)), s([[600, 840], [420, 600], [470, 480]], GREEN, 2), s([[600, 840], [780, 600], [730, 480]], GREEN, 2)],
  plate: () => [ellipse(600, 450, 380, 200), ellipse(600, 450, 260, 130), fill(600, 450, SKY)],
  slide: () => [line([[300, 820], [300, 260], [420, 260]], RED, 2), ...[360, 460, 560, 660, 760].map((y) => line([[260, y], [340, y]], RED, 2)), s([[420, 260], [700, 640], [980, 820]], BLUE, 2), s([[420, 340], [680, 700], [960, 860]], BLUE, 2)],
  hand: () => [closed([[420, 820], [420, 520], [280, 360], [330, 320], [430, 420], [430, 200], [490, 200], [500, 400], [520, 150], [580, 150], [590, 400], [610, 170], [670, 170], [680, 420], [700, 240], [760, 240], [760, 820]]), fill(600, 650, ORANGE)],
};

export function canDraw(word: string): boolean {
  return word in PICTURES;
}

/** The picture for `word`, or a mystery scribble (a question mark) when the library has none. */
export function pictureFor(word: string): Op[] {
  const make = PICTURES[word];
  if (make) return make();
  return [arc(600, 340, 160, 180, 400, PURPLE, 2), line([[600, 500], [600, 600]], PURPLE, 2), dot(600, 720, PURPLE)];
}

/** A stray line the drawer undoes. */
export const STRAY: StrokeOp = s([[120, 820], [400, 700], [700, 840], [1080, 720]], RED, 2);

export const LIBRARY_WORDS = Object.keys(PICTURES);
