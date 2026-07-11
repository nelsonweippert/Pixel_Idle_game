/** análise de imagem sobre o sharp — pixels, cor, alpha, e checagens de
 *  QUALIDADE de pixel art (anti-aliasing, upscale, bounds de conteúdo). */

import sharp from "sharp";

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

const ALPHA_MIN = 8;

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

/** os 4 cantos precisam estar vazios (sprite ancorado) */
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

/**
 * proporção de pixels com ALPHA PARCIAL (nem cheio nem vazio) — a assinatura do
 * anti-aliasing. Pixel art limpo é ~0. Arte de IA (Pixellab) costuma vazar AA.
 */
export function partialAlphaRatio(img: ImageData, tol = 16): number {
  const p = img.pixels;
  let partial = 0;
  const total = p.length / 4;
  for (let i = 3; i < p.length; i += 4) {
    const a = p[i];
    if (a > tol && a < 255 - tol) partial++;
  }
  return total ? partial / total : 0;
}

/**
 * detecta se a imagem é um UPSCALE: maior fator s (1..max) em que a imagem é
 * composta 100% por blocos s×s idênticos. s>1 ⇒ resolução real é (w/s)×(h/s).
 */
export function detectPixelScale(img: ImageData, maxScale = 8): number {
  const { width: w, height: h, pixels: p } = img;
  const ch = (x: number, y: number, c: number) => p[(y * w + x) * 4 + c];
  const uniformAt = (s: number): boolean => {
    if (s < 2 || w % s !== 0 || h % s !== 0) return false;
    for (let by = 0; by < h; by += s) {
      for (let bx = 0; bx < w; bx += s) {
        for (let c = 0; c < 4; c++) {
          const v = ch(bx, by, c);
          for (let y = 0; y < s; y++)
            for (let x = 0; x < s; x++) if (ch(bx + x, by + y, c) !== v) return false;
        }
      }
    }
    return true;
  };
  let best = 1;
  for (let s = 2; s <= maxScale; s++) if (uniformAt(s)) best = s;
  return best;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** caixa do conteúdo (pixels opacos). null se vazio. */
export function contentBounds(img: ImageData, tol = ALPHA_MIN): Bounds | null {
  const { width: w, height: h, pixels: p } = img;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (p[(y * w + x) * 4 + 3] >= tol) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
