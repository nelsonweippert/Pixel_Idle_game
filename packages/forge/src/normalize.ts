/**
 * O NORMALIZADOR — adapta o que dá pra caber na spec: garante alpha, resize
 * nearest (sem blur) e snap de paleta opcional. Não inventa arte; só padroniza.
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { snapToPalette } from "./image";

export interface NormalizeOpts {
  targetW?: number;
  targetH?: number;
  snap?: boolean;
}

export async function normalize(
  inPath: string,
  outPath: string,
  opts: NormalizeOpts = {},
): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  let pipe = sharp(inPath).ensureAlpha();
  if (opts.targetW && opts.targetH) {
    pipe = pipe.resize(opts.targetW, opts.targetH, { kernel: "nearest", fit: "fill" });
  }
  if (opts.snap) {
    const tmp = outPath + ".tmp.png";
    await pipe.png().toFile(tmp);
    await snapToPalette(tmp, outPath);
    await fs.unlink(tmp).catch(() => {});
  } else {
    await pipe.png().toFile(outPath);
  }
}
