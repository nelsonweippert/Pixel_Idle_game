/**
 * compose-crypt-room.mts (v3) — câmara da cripta 30x18 por NINE-SLICE da sala do
 * santuário do Dungeon3 (template x2..11, y2..15, verificado tile a tile).
 * A sala original ABRE pra corredores (paredes laterais do artista terminam em
 * y9): as colunas laterais são estendidas repetindo o padrão vertical do próprio
 * artista (Walls 4478/4498 + Walls2 4081/4098). Alcovas e pilares repetem como
 * arcada. Mobília removida; estátuas de tocha no topo; tochas nos pilares de
 * baixo; placa circular central como marca da arena.
 *
 * uso: tsx compose-crypt-room.mts <Dungeon3.tmx> <outDir>
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { parseTmx, GID_MASK } from "../packages/forge/src/tmx.ts";

const [tmxPath, outDir] = process.argv.slice(2);
const parsed = await parseTmx(tmxPath);

const TX0 = 2, TX1 = 11;
const RW = 22, RH = 18;
const OX = 4, OY = 0;
const CORE_J0 = 7, CORE_J1 = 12; // linhas de chão liso (template y10)

const colMap = (i: number): number => {
  if (i < 3) return TX0 + i;                  // x2..4
  if (i >= RW - 3) return TX1 - (RW - 1 - i); // x9..11
  return 5 + ((i - 3) % 4);                   // x5..8 (alcova/pilar → arcada)
};
const rowMap = (j: number): number => {
  if (j < CORE_J0) return 2 + j;              // y2..8 (cap+face+zona das estátuas)
  if (j > CORE_J1) return 11 + (j - CORE_J1 - 1); // y11..15 (pilares+chão+parede)
  return 10;                                  // chão liso
};

type T = { x: number; y: number; raw: number };
const norm = (name: string): T[] => {
  const l = parsed.layers.find((x) => x.name === name);
  return l ? l.tiles.map((t) => ({ x: t.x - parsed.minX, y: t.y - parsed.minY, raw: t.raw >>> 0 })) : [];
};

// fora do slice: estátuas de tocha, tochas de parede, armadilha (re-postos como grupos)
const DROP = new Set([5418, 5419, 5432, 5433, 5446, 5447, 5666, 5667, 5670, 5671, 6968, 6969, 6992, 6993]);

function slice(tiles: T[], skip?: (x: number, y: number) => boolean): T[] {
  const grid = new Map<string, number>();
  for (const t of tiles) {
    if (t.x >= TX0 && t.x <= TX1 && t.y >= 2 && t.y <= 15 && !DROP.has(t.raw & GID_MASK) && !(skip && skip(t.x, t.y))) {
      grid.set(`${t.x},${t.y}`, t.raw);
    }
  }
  const out: T[] = [];
  for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
    let tx = colMap(i);
    // a parede de baixo (y15) termina em x10 no original — canto direito usa x8..x10
    if (j === RH - 1 && i >= RW - 3) tx = 8 + (i - (RW - 3));
    const raw = grid.get(`${tx},${rowMap(j)}`);
    if (raw !== undefined) out.push({ x: OX + i, y: OY + j, raw });
  }
  return out;
}

function group(name: string, x0: number, y0: number, x1: number, y1: number, wx: number, wy: number): T[] {
  return norm(name)
    .filter((t) => t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1)
    .map((t) => ({ x: wx + (t.x - x0), y: wy + (t.y - y0), raw: t.raw }));
}

const outLayers: { name: string; tiles: T[] }[] = [];
const push = (name: string, tiles: T[]) => { if (tiles.length) outLayers.push({ name, tiles }); };

push("Floor2", slice(norm("Floor2")));
// moldura do medalhão fica pra trás (mobília do santuário) — chão liso na arena
push("floor2_dark", slice(norm("floor2_dark"), (x, y) => x >= 5 && x <= 8 && y >= 7 && y <= 9));

// paredes laterais estendidas nas linhas de chão (padrão vertical do artista)
const sideWalls: T[] = [];
const sideWalls2: T[] = [];
for (let j = CORE_J0; j <= CORE_J1; j++) {
  const alt = (j - CORE_J0) % 2 === 0;
  sideWalls.push({ x: OX + 0, y: j, raw: alt ? 4478 : 4498 }, { x: OX + RW - 1, y: j, raw: alt ? 4484 : 4504 });
  sideWalls2.push({ x: OX + 1, y: j, raw: alt ? 4081 : 4098 }, { x: OX + RW - 2, y: j, raw: alt ? 4081 : 4098 });
}
push("Walls2", [...slice(norm("Walls2")), ...sideWalls2]);
push("Walls", [...slice(norm("Walls")), ...sideWalls]);

push("Objects0", [
  // estátuas de tocha do topo (posição relativa original: x3..4 y6..8 → j4..6)
  ...group("Objects0", 3, 6, 4, 8, OX + 1, 4),
  ...group("Objects0", 9, 6, 10, 8, OX + 19, 4),
  // tochas de parede nos pilares de baixo (original x4..5 y11..12)
  ...group("Objects0", 4, 11, 5, 12, OX + 6, 13),
  ...group("Objects0", 4, 11, 5, 12, OX + 14, 13),
]);

const used = new Set<number>();
const tsFor = (gid: number) => { const s = parsed.tilesets; for (let i = s.length - 1; i >= 0; i--) if (gid >= s[i].firstgid) return s[i]; return undefined; };
for (const l of outLayers) for (const t of l.tiles) { const ts = tsFor(t.raw & GID_MASK); if (ts) used.add(ts.firstgid); }

await fs.mkdir(outDir, { recursive: true });
const tilesets: any[] = [];
const nameToPath = new Map<string, string>();
for (const ts of parsed.tilesets) {
  if (!used.has(ts.firstgid)) continue;
  let image = path.basename(ts.imagePath);
  const claimed = nameToPath.get(image);
  if (claimed && claimed !== ts.imagePath) image = `${ts.firstgid}-${image}`;
  else nameToPath.set(image, ts.imagePath);
  await fs.copyFile(ts.imagePath, path.join(outDir, image));
  tilesets.push({ firstgid: ts.firstgid, name: ts.name, image, columns: ts.columns, tilecount: ts.tilecount, tileW: ts.tileW, tileH: ts.tileH });
}

const doc = {
  name: "crypt-chamber",
  tileW: parsed.tileW, tileH: parsed.tileH,
  width: 30, height: 18,
  tilesets,
  layers: outLayers.map((l) => ({ name: l.name, tiles: l.tiles.flatMap((t) => [t.x, t.y, t.raw]) })),
  battle: { x: 7, y: 6, w: 16, h: 7 }, // chão aberto entre paredes — SEM floorGid
};
await fs.writeFile(path.join(outDir, "scene.json"), JSON.stringify(doc));
console.log(`OK ${outDir}/scene.json (30x18, sala 22 cols, battle 16x7, ${tilesets.length} tilesets)`);
