/**
 * mu-textures.mjs — decodifica texturas do cliente MU pra PNG.
 *   OZJ = header 24 bytes + JPEG puro
 *   OZT = header (nx@16, ny@18, depth@20) + pixels @22, BGRA/BGR, linhas bottom-up
 */
import sharp from "sharp";

export async function ozjToPng(buf) {
  return sharp(buf.subarray(24)).png().toBuffer();
}

export async function oztToPng(buf) {
  const nx = buf.readInt16LE(16), ny = buf.readInt16LE(18), depth = buf[20];
  const ch = depth >= 32 ? 4 : 3;
  const src = buf.subarray(22, 22 + nx * ny * ch);
  // BGR(A) → RGBA
  const rgba = Buffer.alloc(nx * ny * 4);
  for (let i = 0, j = 0; i < nx * ny; i++) {
    const o = i * ch;
    rgba[j++] = src[o + 2]; rgba[j++] = src[o + 1]; rgba[j++] = src[o]; rgba[j++] = ch === 4 ? src[o + 3] : 255;
  }
  return sharp(rgba, { raw: { width: nx, height: ny, channels: 4 } }).flip().png().toBuffer(); // flip = bottom-up→top-down
}

// resolve o nome citado no BMD ('helmat_01.jpg' / 'npc_a_clothes.tga') → arquivo OZJ/OZT
export function textureFileFor(texPath) {
  const base = texPath.replace(/\.(jpg|jpeg)$/i, "").replace(/\.(tga)$/i, "").replace(/\.(bmp)$/i, "");
  if (/\.tga$/i.test(texPath)) return { base, exts: ["OZT", "ozt"] };
  return { base, exts: ["OZJ", "ozj", "OZT", "ozt"] };
}

export async function decodeToPngBuffer(filePath, buf) {
  return /\.ozt$/i.test(filePath) ? oztToPng(buf) : ozjToPng(buf);
}
