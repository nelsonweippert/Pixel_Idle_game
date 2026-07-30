/**
 * bake-lorencia-floor.mjs — assa o CHÃO REAL de um World do MU (top-down pixel) a partir
 * do .map/.att decodificado. `bakeRegion` faz blit RAW (rápido) de qualquer janela;
 * `bakeFloor` recorta a arena (praça/SafeZone); `bakeFullMap` assa o mapa inteiro 256×256.
 *   node tools/mu/bake-lorencia-floor.mjs [preview.png] [--full]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { decodeTerrain, TSIZE, cidx } from "./mu-terrain.mjs";
import { decodeToPngBuffer } from "./mu-textures.mjs";

const WORLD1 = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data/World1";
const TILE_FILES = { 0: "TileGrass01.OZJ", 1: "TileGrass02.OZJ", 2: "TileGround01.OZJ", 3: "TileGround02.OZJ", 4: "TileGround03.OZJ", 5: "TileWater01.OZJ", 6: "TileWood01.OZJ", 7: "TileRock01.OZJ", 8: "TileRock02.OZJ" };
const TEXELS_PER_CELL = 64;   // tile 256px cobre 4 células → 64 texels/célula (tiling contínuo do MU)
const LIGHT_BOOST = 1.28;     // compensa o escurecimento do lightmap (média ~0.53)
const LIGHT_FLOOR = 0.52;     // piso mínimo de luz (sombras nunca chapam preto → grama natural)

// ── RENDER de terreno por-pixel (fiel ao MU): amostra UV do tile (tiling contínuo) +
// blend bilinear da 2ª camada pela máscara de alpha + multiplica pelo lightmap assado.
// Devolve { png, W, H, cellpx, walkable, region }.
export async function bakeRegion(t, { cx0, cy0, regionW, regionH, cellpx }) {
  const W = regionW * cellpx, H = regionH * cellpx, S = TSIZE;
  // tiles em resolução cheia (256²) RGBA
  const used = new Set();
  for (let y = cy0; y < cy0 + regionH; y++) for (let x = cx0; x < cx0 + regionW; x++) { const i = cidx(x, y); used.add(t.layer1[i]); if (t.layer2[i] !== 255) used.add(t.layer2[i]); }
  const tiles = {};
  for (const idx of used) {
    const file = TILE_FILES[idx]; if (!file) continue;
    let png; try { png = await decodeToPngBuffer(file, await fs.readFile(path.join(WORLD1, file))); } catch { continue; }
    const { data } = await sharp(png).resize(256, 256, { kernel: "cubic" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    tiles[idx] = data;
  }
  const { layer1, layer2, alpha } = t, light = t.light ? t.light.data : null;
  const cell = (x, y) => (y < 0 ? 0 : y >= S ? S - 1 : y) * S + (x < 0 ? 0 : x >= S ? S - 1 : x);
  const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const big = new Uint8Array(W * H * 4);

  const walkable = [];
  for (let ry = 0; ry < regionH; ry++) { walkable.push([]); for (let rx = 0; rx < regionW; rx++) { const w = t.wall[cidx(cx0 + rx, cy0 + ry)]; walkable[ry].push((w & 0x4) || (w & 0x8) ? 0 : 1); } }

  for (let py = 0; py < H; py++) {
    const wy = cy0 + py / cellpx, iy = Math.floor(wy), fy = wy - iy;
    let sy = (wy * TEXELS_PER_CELL) % 256; if (sy < 0) sy += 256; sy |= 0;
    for (let px = 0; px < W; px++) {
      const wx = cx0 + px / cellpx, ix = Math.floor(wx), fx = wx - ix;
      let sx = (wx * TEXELS_PER_CELL) % 256; if (sx < 0) sx += 256; sx |= 0;
      const c00 = cell(ix, iy), c10 = cell(ix + 1, iy), c01 = cell(ix, iy + 1), c11 = cell(ix + 1, iy + 1);
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const sp = (sy * 256 + sx) * 4;
      // camada 1
      const t1 = tiles[layer1[c00]]; let r, g, b;
      if (t1) { r = t1[sp]; g = t1[sp + 1]; b = t1[sp + 2]; } else { r = 60; g = 62; b = 46; }
      // camada 2 (blend por alpha bilinear das 4 células vizinhas)
      const i2 = layer2[c00], t2 = tiles[i2];
      if (i2 !== 255 && t2) {
        const a = (alpha[c00] * w00 + alpha[c10] * w10 + alpha[c01] * w01 + alpha[c11] * w11) / 255;
        if (a > 0.004) { r = r * (1 - a) + t2[sp] * a; g = g * (1 - a) + t2[sp + 1] * a; b = b * (1 - a) + t2[sp + 2] * a; }
      }
      // lightmap assado (bilinear) × boost, SUAVIZADO: eleva o piso das sombras (min ~0.5)
      // pra não criar bandas diagonais duras na grama (deixava o terreno "não-fotográfico");
      // a variação relativa some as sombras, só sem os pretos chapados. Mantém o path bonito.
      if (light) {
        const q0 = c00 * 4, q1 = c10 * 4, q2 = c01 * 4, q3 = c11 * 4;
        const lr = (light[q0] * w00 + light[q1] * w10 + light[q2] * w01 + light[q3] * w11) / 255;
        const lg = (light[q0 + 1] * w00 + light[q1 + 1] * w10 + light[q2 + 1] * w01 + light[q3 + 1] * w11) / 255;
        const lb = (light[q0 + 2] * w00 + light[q1 + 2] * w10 + light[q2 + 2] * w01 + light[q3 + 2] * w11) / 255;
        const soft = (l) => LIGHT_FLOOR + (1 - LIGHT_FLOOR) * Math.min(1, l * LIGHT_BOOST);
        r = cl(r * soft(lr)); g = cl(g * soft(lg)); b = cl(b * soft(lb));
      }
      const o = (py * W + px) * 4; big[o] = r; big[o + 1] = g; big[o + 2] = b; big[o + 3] = 255;
    }
  }
  const png = await sharp(Buffer.from(big.buffer), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  return { png, W, H, cellpx, walkable, region: { cx0, cy0, regionW, regionH } };
}

async function loadWorld1() {
  return decodeTerrain(WORLD1, { att: "EncTerrain1.att", map: "EncTerrain1.map", obj: "EncTerrain1.obj" });
}

// arena: janela centrada na SafeZone (praça)
export async function bakeFloor({ regionW = 44, regionH = 26, cellpx = 22 } = {}) {
  const t = await loadWorld1();
  let sx = 0, sy = 0, sn = 0;
  for (let y = 0; y < TSIZE; y++) for (let x = 0; x < TSIZE; x++) if (t.wall[cidx(x, y)] & 0x1) { sx += x; sy += y; sn++; }
  const ccx = sn ? Math.round(sx / sn) : 135, ccy = sn ? Math.round(sy / sn) : 128;
  const cx0 = Math.max(0, Math.min(TSIZE - regionW, ccx - (regionW >> 1)));
  const cy0 = Math.max(0, Math.min(TSIZE - regionH, ccy - (regionH >> 1)));
  console.log(`praça (SafeZone) centro ≈ (${ccx},${ccy}) → janela [${cx0},${cy0}] ${regionW}×${regionH}`);
  const r = await bakeRegion(t, { cx0, cy0, regionW, regionH, cellpx });
  return { ...r, CELLPX: cellpx, objects: t.objects, mapNumber: t.mapNumber };
}

// mapa inteiro 256×256
export async function bakeFullMap({ cellpx = 6 } = {}) {
  const t = await loadWorld1();
  const r = await bakeRegion(t, { cx0: 0, cy0: 0, regionW: TSIZE, regionH: TSIZE, cellpx });
  return { ...r, CELLPX: cellpx, objects: t.objects, mapNumber: t.mapNumber, wall: t.wall };
}

// ── CLI ────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const full = process.argv.includes("--full");
  const out = process.argv.find((a) => a.endsWith(".png")) || (full ? "lorencia-full.png" : "lorencia-floor.png");
  const r = full ? await bakeFullMap({ cellpx: 6 }) : await bakeFloor();
  await fs.writeFile(out, r.png);
  const wc = r.walkable.flat().filter(Boolean).length;
  console.log(`✅ ${full ? "MAPA INTEIRO" : "arena"} ${r.W}×${r.H} → ${out} · caminhável ${wc}/${r.walkable.flat().length}`);
}
