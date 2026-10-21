// Bucket fill on raw RGBA pixels (scanline flood fill). Pure: works on any {data,width,height}, so it
// is tested without a DOM. `tolerance` (0–255, max channel difference) lets the fill swallow the
// anti-aliased fringe of a brush stroke instead of leaving a halo.

export type Rgba = [number, number, number, number];
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

export function hexToRgba(hex: string): Rgba {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0, 0, 0, 255];
  return [Number.parseInt(m[1] ?? "0", 16), Number.parseInt(m[2] ?? "0", 16), Number.parseInt(m[3] ?? "0", 16), 255];
}

function at(img: Pixels, i: number): Rgba {
  const d = img.data;
  return [d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0, d[i + 3] ?? 0];
}

const near = (a: Rgba, b: Rgba, tol: number) =>
  Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol && Math.abs(a[3] - b[3]) <= tol;

/** Fills from (x, y); returns how many pixels changed. */
export function floodFill(img: Pixels, x0: number, y0: number, color: Rgba, tolerance: number): number {
  const { width: w, height: h } = img;
  const sx = Math.floor(x0);
  const sy = Math.floor(y0);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return 0;
  const target = at(img, (sy * w + sx) * 4);
  if (near(target, color, 0)) return 0;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [sx, sy];
  let filled = 0;
  const matches = (x: number, y: number) => {
    const p = y * w + x;
    return seen[p] === 0 && near(at(img, p * 4), target, tolerance);
  };
  while (stack.length > 0) {
    const y = stack.pop() ?? 0;
    let x = stack.pop() ?? 0;
    while (x > 0 && matches(x - 1, y)) x--;
    let up = false;
    let down = false;
    for (; x < w && matches(x, y); x++) {
      const p = y * w + x;
      seen[p] = 1;
      img.data.set(color, p * 4);
      filled++;
      if (y > 0) {
        const m = matches(x, y - 1);
        if (m && !up) stack.push(x, y - 1);
        up = m;
      }
      if (y < h - 1) {
        const m = matches(x, y + 1);
        if (m && !down) stack.push(x, y + 1);
        down = m;
      }
    }
  }
  return filled;
}
