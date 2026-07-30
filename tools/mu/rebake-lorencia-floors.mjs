/**
 * rebake-lorencia-floors.mjs — RE-BAKA os pisos de Lorência em ALTA QUALIDADE (backdrop
 * fotográfico). O artifact só tinha 960px/q84; aqui bakamos o terreno real a cellpx=64
 * (1 px por texel do MU = nitidez nativa máxima), que casa ~1:1 com a resolução física da
 * tela → foto crocante em vez de upscale borrado. Saída floor.jpg (q90) + scene.json com
 * `smooth:true` (o engine usa filtro LINEAR, foto lisa; não pixel-art).
 *   node tools/mu/rebake-lorencia-floors.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { decodeTerrain, TSIZE, cidx } from "./mu-terrain.mjs";
import { bakeRegion } from "./bake-lorencia-floor.mjs";
import sharp from "sharp";

const WORLD1 = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data/World1";
const OUT = "C:/Users/Storming/Desktop/GItHubs/Pixel_Idle_game/apps/web/public/tilesets";
const CELLPX = 64; // 1 px por texel (tiles do MU = 64 texels/célula) → nitidez nativa

// zonas idênticas às do explorer (mesma janela → mesma cena/arena)
const ZONES = [
  { key: "east",  name: "Bosque Leste",   x1: 180, x2: 226, y1: 90,  y2: 244 },
  { key: "north", name: "Campo Norte",    x1: 135, x2: 240, y1: 20,  y2: 88 },
  { key: "west",  name: "Planície Oeste", x1: 8,   x2: 94,  y1: 11,  y2: 244 },
  { key: "south", name: "Necrópole Sul",  x1: 95,  x2: 175, y1: 168, y2: 244 },
  { key: "nw",    name: "Ermo Noroeste",  x1: 8,   x2: 60,  y1: 11,  y2: 80 },
];

// bounding box das células walkable → arena (mesmo cálculo do extract original)
function arenaFromWalkable(walk, cols, rows) {
  let minX = cols, minY = rows, maxX = -1, maxY = -1;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (walk?.[y]?.[x] === 1) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) return { x: 1, y: 1, w: Math.max(1, cols - 2), h: Math.max(1, rows - 2) };
  const insX = Math.round((maxX - minX + 1) * 0.08), insY = Math.round((maxY - minY + 1) * 0.08);
  return { x: minX + insX, y: minY + insY, w: Math.max(1, maxX - minX + 1 - insX * 2), h: Math.max(1, maxY - minY + 1 - insY * 2) };
}

const t = await decodeTerrain(WORLD1, { att: "EncTerrain1.att", map: "EncTerrain1.map", obj: "EncTerrain1.obj" });
console.log("terreno decodificado.");

for (const z of ZONES) {
  const RW = Math.min(48, z.x2 - z.x1 + 1), RH = Math.min(30, z.y2 - z.y1 + 1);
  let cx0 = Math.round((z.x1 + z.x2) / 2 - RW / 2), cy0 = Math.round((z.y1 + z.y2) / 2 - RH / 2);
  cx0 = Math.max(z.x1, Math.min(z.x2 - RW + 1, cx0)); cy0 = Math.max(z.y1, Math.min(z.y2 - RH + 1, cy0));
  const r = await bakeRegion(t, { cx0, cy0, regionW: RW, regionH: RH, cellpx: CELLPX });
  const dir = path.join(OUT, `lorencia-${z.key}`);
  await fs.mkdir(dir, { recursive: true });
  // piso: JPEG q90 mozjpeg (foto opaca → bem menor que PNG, sem perda visível)
  await sharp(r.png).jpeg({ quality: 90, mozjpeg: true }).toFile(path.join(dir, "floor.jpg"));
  try { await fs.unlink(path.join(dir, "floor.png")); } catch {} // remove o pixelizado antigo
  const scene = {
    name: z.name,
    tileW: CELLPX, tileH: CELLPX,
    width: RW, height: RH,
    baked: "floor.jpg",
    pxW: r.W, pxH: r.H,
    battle: arenaFromWalkable(r.walkable, RW, RH),
    smooth: true, // engine usa filtro LINEAR (backdrop fotográfico liso)
  };
  await fs.writeFile(path.join(dir, "scene.json"), JSON.stringify(scene, null, 2));
  console.log(`  ✓ lorencia-${z.key.padEnd(6)} ${r.W}×${r.H} (${RW}×${RH} cél) battle=${JSON.stringify(scene.battle)}`);
}
console.log("✅ pisos re-bakeados em alta qualidade (backdrop fotográfico)");
