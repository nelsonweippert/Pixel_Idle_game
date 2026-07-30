/**
 * render-scene.mts — achata um scene.json (saída do `forge tmx-export`) num PNG
 * plano, do jeitinho que o TiledMap desenha no Pixi (mesma ordem de layers, mesmos
 * flips). Serve pra INSPECIONAR o mapa com os próprios olhos antes de definir a
 * área de batalha — e pra conferir o resultado depois. Não entra no jogo.
 *
 * uso: npx tsx tools/render-scene.mts <scene.json> <out.png> [--grid] [--battle x,y,w,h]
 */
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const FLIP_H = 0x80000000, FLIP_V = 0x40000000, FLIP_D = 0x20000000, GID_MASK = 0x1fffffff;

const [scenePath, outPath, ...rest] = process.argv.slice(2);
if (!scenePath || !outPath) {
  console.error("uso: npx tsx tools/render-scene.mts <scene.json> <out.png> [--grid] [--battle x,y,w,h]");
  process.exit(1);
}
const drawGrid = rest.includes("--grid");
const battleArg = rest[rest.indexOf("--battle") + 1];
const battle = rest.includes("--battle") && battleArg ? battleArg.split(",").map(Number) : null;
const floorArg = rest[rest.indexOf("--floor") + 1];
const floorGid = rest.includes("--floor") && floorArg ? Number(floorArg) : null;

const doc = JSON.parse(await fs.readFile(scenePath, "utf8"));
const baseDir = path.dirname(scenePath);
const TW = doc.tileW, TH = doc.tileH;
const W = doc.width * TW, H = doc.height * TH;

// carrega cada atlas em RGBA cru, uma vez
const atlases = new Map<number, { data: Buffer; w: number; h: number; ts: any }>();
for (const ts of doc.tilesets) {
  const img = sharp(path.join(baseDir, ts.image)).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  atlases.set(ts.firstgid, { data, w: info.width, h: info.height, ts });
}
const sorted = [...doc.tilesets].sort((a: any, b: any) => a.firstgid - b.firstgid);
const tsFor = (gid: number) => {
  for (let i = sorted.length - 1; i >= 0; i--) if (gid >= sorted[i].firstgid) return sorted[i];
  return null;
};

const out = Buffer.alloc(W * H * 4, 0); // RGBA, transparente

function blit(rawGid: number, tx: number, ty: number) {
  const gid = rawGid & GID_MASK;
  if (!gid) return;
  const ts = tsFor(gid);
  if (!ts) return;
  const atlas = atlases.get(ts.firstgid);
  if (!atlas) return;
  const local = gid - ts.firstgid;
  if (local >= ts.tilecount) return;
  const ax = (local % ts.columns) * TW, ay = Math.floor(local / ts.columns) * TH;
  const H_ = !!(rawGid & FLIP_H), V_ = !!(rawGid & FLIP_V), D_ = !!(rawGid & FLIP_D);
  const dx0 = tx * TW, dy0 = ty * TH;
  for (let py = 0; py < TH; py++) {
    for (let px = 0; px < TW; px++) {
      let sx = px, sy = py;
      if (D_) { const t = sx; sx = sy; sy = t; }
      if (H_) sx = TW - 1 - sx;
      if (V_) sy = TH - 1 - sy;
      const si = ((ay + sy) * atlas.w + (ax + sx)) * 4;
      const sa = atlas.data[si + 3];
      if (!sa) continue;
      const di = ((dy0 + py) * W + (dx0 + px)) * 4;
      if (sa === 255) {
        out[di] = atlas.data[si]; out[di + 1] = atlas.data[si + 1];
        out[di + 2] = atlas.data[si + 2]; out[di + 3] = 255;
      } else { // over alpha
        const a = sa / 255, ia = 1 - a;
        out[di] = atlas.data[si] * a + out[di] * ia;
        out[di + 1] = atlas.data[si + 1] * a + out[di + 1] * ia;
        out[di + 2] = atlas.data[si + 2] * a + out[di + 2] * ia;
        out[di + 3] = Math.min(255, sa + out[di + 3] * ia);
      }
    }
  }
}

for (const layer of doc.layers) {
  const t = layer.tiles;
  for (let i = 0; i < t.length; i += 3) blit(t[i + 2] >>> 0, t[i], t[i + 1]);
}

// overlays de inspeção
function hline(y: number, r: number, g: number, b: number) {
  if (y < 0 || y >= H) return;
  for (let x = 0; x < W; x++) { const di = (y * W + x) * 4; out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = 255; }
}
function vline(x: number, r: number, g: number, b: number) {
  if (x < 0 || x >= W) return;
  for (let y = 0; y < H; y++) { const di = (y * W + x) * 4; out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = 255; }
}
if (drawGrid) {
  for (let tx = 0; tx <= doc.width; tx += 2) vline(tx * TW, 60, 60, 60);
  for (let ty = 0; ty <= doc.height; ty += 2) hline(ty * TH, 60, 60, 60);
}
const b = battle ?? (doc.battle ? [doc.battle.x, doc.battle.y, doc.battle.w, doc.battle.h] : null);
// simula o floorGid do TiledMap: forra a área de batalha com o chão limpo (opaco, por cima)
const fg = floorGid ?? doc.battle?.floorGid ?? null;
if (b && fg) {
  const [bx, by, bw, bh] = b;
  for (let ty = by; ty < by + bh; ty++) for (let tx = bx; tx < bx + bw; tx++) blit(fg, tx, ty);
}
if (b) {
  const [bx, by, bw, bh] = b;
  for (let x = bx * TW; x < (bx + bw) * TW; x++) { hline(by * TH, 255, 40, 40); hline((by + bh) * TH - 1, 255, 40, 40); }
  for (let y = by * TH; y < (by + bh) * TH; y++) { vline(bx * TW, 255, 40, 40); vline((bx + bw) * TW - 1, 255, 40, 40); }
  // preenche fraco pra enxergar a área
  for (let y = by * TH; y < (by + bh) * TH; y++) for (let x = bx * TW; x < (bx + bw) * TW; x++) {
    const di = (y * W + x) * 4; out[di] = Math.min(255, out[di] + 40); out[di + 3] = Math.max(out[di + 3], 90);
  }
}

await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(outPath);
console.log(`render ${doc.name}: ${W}x${H}px (${doc.width}x${doc.height} tiles, ${doc.layers.length} layers) → ${outPath}`);
