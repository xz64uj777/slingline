/**
 * The ACES filmic curve three applies in `ACESFilmicToneMapping`, reproduced on
 * the CPU.
 *
 * The renderer tone-maps fog in the shader but writes the clear colour straight
 * from linear to sRGB, so a sky-coloured clear needs this curve applied first
 * or the horizon shows a band where the two disagree.
 */

export type Rgb = readonly [number, number, number];

function rrtAndOdtFit(v: number): number {
  const a = v * (v + 0.0245786) - 0.000090537;
  const b = v * (0.983729 * v + 0.432951) + 0.238081;
  return a / b;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** `color` is linear-sRGB, as the renderer's working space holds it. */
export function acesFilmic(color: Rgb, exposure: number): [number, number, number] {
  const scale = exposure / 0.6;
  const r = color[0] * scale;
  const g = color[1] * scale;
  const b = color[2] * scale;

  // ACES input matrix (columns as listed in the shader).
  const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const ig = 0.076 * r + 0.90834 * g + 0.01566 * b;
  const ib = 0.0284 * r + 0.13383 * g + 0.83777 * b;

  const tr = rrtAndOdtFit(ir);
  const tg = rrtAndOdtFit(ig);
  const tb = rrtAndOdtFit(ib);

  // ACES output matrix.
  return [
    clamp01(1.60475 * tr - 0.53108 * tg - 0.07367 * tb),
    clamp01(-0.10208 * tr + 1.10813 * tg - 0.00605 * tb),
    clamp01(-0.00327 * tr - 0.07276 * tg + 1.07602 * tb),
  ];
}
