import { describe, expect, it } from "vitest";
import { floodFill, hexToRgba } from "./fill";

/** A w×h RGBA image, all white, with optional black pixels. */
function img(w: number, h: number, black: Array<[number, number]> = []) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [x, y] of black) {
    const i = (y * w + x) * 4;
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
  }
  return { data, width: w, height: h };
}
const px = (im: ReturnType<typeof img>, x: number, y: number) => Array.from(im.data.slice((y * im.width + x) * 4, (y * im.width + x) * 4 + 4));

describe("flood fill", () => {
  it("fills the open region and stops at a wall", () => {
    // a vertical wall at x=2 splits a 5x3 image
    const im = img(5, 3, [
      [2, 0],
      [2, 1],
      [2, 2],
    ]);
    const n = floodFill(im, 0, 0, [255, 0, 0, 255], 0);
    expect(n).toBe(6);
    expect(px(im, 1, 2)).toEqual([255, 0, 0, 255]);
    expect(px(im, 3, 1)).toEqual([255, 255, 255, 255]);
    expect(px(im, 2, 1)).toEqual([0, 0, 0, 255]);
  });

  it("does nothing when the seed already has the colour", () => {
    const im = img(3, 3);
    expect(floodFill(im, 1, 1, [255, 255, 255, 255], 0)).toBe(0);
  });

  it("does nothing outside the image", () => {
    const im = img(3, 3);
    expect(floodFill(im, 5, 1, [0, 0, 0, 255], 0)).toBe(0);
    expect(floodFill(im, -1, 1, [0, 0, 0, 255], 0)).toBe(0);
  });

  it("tolerance absorbs anti-aliased edge pixels", () => {
    const im = img(3, 1);
    const i = 2 * 4;
    im.data[i] = 230;
    im.data[i + 1] = 230;
    im.data[i + 2] = 230;
    expect(floodFill(im, 0, 0, [0, 0, 255, 255], 40)).toBe(3);
    expect(floodFill(img(3, 1, [[1, 0]]), 0, 0, [0, 0, 255, 255], 40)).toBe(1);
  });

  it("parses hex colours", () => {
    expect(hexToRgba("#ff8000")).toEqual([255, 128, 0, 255]);
    expect(hexToRgba("nope")).toEqual([0, 0, 0, 255]);
  });
});
