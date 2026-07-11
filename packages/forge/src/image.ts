/** helpers de imagem sobre o sharp — leitura de pixels, contagem de cor, alpha */

import sharp from "sharp";
import { nearestPaletteColor } from "./palette";

export interface ImageData {
  width: number;
  height: number;
  channels: number;
  pixels: Buffer; // RGBA, sempre 4 canais
}

export async function loadImage(path: string): Promise<ImageData> {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: 4, pixels: data };
}

const ALPHA_MIN = 8; // abaixo disso considera transparente

/** cores únicas entre pixels opacos */
export function countColors(img: ImageData): number {
  const set = new Set<number>();
  const p = img.pixels;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < ALPHA_MIN) continue;
    set.add((p[i] << 16) | (p[i + 1] << 8) | p[i + 2]);
  }
  return set.size;
}

export function hasAnyTransparency(img: ImageData): boolean {
  const p = img.pixels;
  for (let i = 3; i < p.length; i += 4) if (p[i] < ALPHA_MIN) return true;
  return false;
}

/** os 4 cantos precisam estar vazios (sprite ancorado tem cantos transparentes) */
export function cornersTransparent(img: ImageData): boolean {
  const { width: w, height: h, pixels: p } = img;
  const a = (x: number, y: number) => p[(y * w + x) * 4 + 3];
  return (
    a(0, 0) < ALPHA_MIN &&
    a(w - 1, 0) < ALPHA_MIN &&
    a(0, h - 1) < ALPHA_MIN &&
    a(w - 1, h - 1) < ALPHA_MIN
  );
}

/** snap opcional: mapeia cada pixel opaco pra cor mais próxima da master */
export async function snapToPalette(inPath: string, outPath: string): Promise<void> {
  const img = await loadImage(inPath);
  const p = Buffer.from(img.pixels);
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < ALPHA_MIN) continue;
    const c = nearestPaletteColor({ r: p[i], g: p[i + 1], b: p[i + 2] });
    p[i] = c.r;
    p[i + 1] = c.g;
    p[i + 2] = c.b;
  }
  await sharp(p, { raw: { width: img.width, height: img.height, channels: 4 } })
    .png()
    .toFile(outPath);
}
