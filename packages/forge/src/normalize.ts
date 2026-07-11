/**
 * O NORMALIZADOR — adapta o asset pra caber na spec sem inventar arte:
 *   • clean:  binariza o alpha (mata o anti-aliasing do Pixellab) — LIGADO por padrão
 *   • resize: nearest, sem blur (só sprite estático)
 *   • snap:   quantiza pra Resurrect 64 via image-q (CIEDE2000, opcional dither)
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import * as iq from "image-q";
import { RESURRECT_64_RGB } from "./palette";
import { QUALITY } from "./spec";

export interface NormalizeOpts {
  targetW?: number;
  targetH?: number;
  clean?: boolean; // binariza alpha (default true)
  snap?: boolean; // quantiza p/ master
  dither?: boolean;
  alphaThreshold?: number;
}

function cleanAlphaInPlace(buf: Buffer, threshold: number) {
  for (let i = 3; i < buf.length; i += 4) {
    if (buf[i] < threshold) {
      buf[i] = 0;
      buf[i - 1] = 0;
      buf[i - 2] = 0;
      buf[i - 3] = 0;
    } else {
      buf[i] = 255;
    }
  }
}

let _palette: iq.utils.Palette | null = null;
function masterPalette(): iq.utils.Palette {
  if (_palette) return _palette;
  const pal = new iq.utils.Palette();
  for (const c of RESURRECT_64_RGB) pal.add(iq.utils.Point.createByRGBA(c.r, c.g, c.b, 255));
  _palette = pal;
  return pal;
}

/** snap RGB pra master preservando o alpha original */
function snapBuffer(buf: Buffer, w: number, h: number, dither: boolean): Buffer {
  const inPC = iq.utils.PointContainer.fromUint8Array(buf, w, h);
  const outPC = iq.applyPaletteSync(inPC, masterPalette(), {
    colorDistanceFormula: "ciede2000",
    imageQuantization: dither ? "floyd-steinberg" : "nearest",
  });
  const out = Buffer.from(outPC.toUint8Array());
  for (let i = 3; i < out.length; i += 4) out[i] = buf[i]; // restaura alpha
  return out;
}

export async function normalize(
  inPath: string,
  outPath: string,
  opts: NormalizeOpts = {},
): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const clean = opts.clean !== false;

  let pipe = sharp(inPath).ensureAlpha();
  if (opts.targetW && opts.targetH) {
    pipe = pipe.resize(opts.targetW, opts.targetH, { kernel: "nearest", fit: "fill" });
  }
  const { data, info } = await pipe.raw().toBuffer({ resolveWithObject: true });
  let buf = Buffer.from(data);
  const { width, height } = info;

  if (clean) cleanAlphaInPlace(buf, opts.alphaThreshold ?? QUALITY.cleanAlphaThreshold);
  if (opts.snap) buf = snapBuffer(buf, width, height, !!opts.dither);

  await sharp(buf, { raw: { width, height, channels: 4 } }).png().toFile(outPath);
}
