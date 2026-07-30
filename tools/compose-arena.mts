/**
 * compose-arena.mts — monta a cena "arena" 30x18 a partir do Training_ground.tmx
 * (pixel-art-training-arena-tileset-for-rpg-games), TODO tile vindo do artista:
 *  - camadas estruturais (muro/areia/cerca/pavimento) expandidas por COSTURA
 *    (insere cópia de colunas/linhas de areia lisa — padrão periódico)
 *  - grupos de objetos re-posicionados INTEIROS (sem rasgar sprite multi-tile)
 *  - ringue de cordas reconstruído por NINE-SLICE dos tiles originais do ringue
 *    do artista (cantos/cordas/postes/tatame) num tamanho maior
 *  - battle = interior do tatame (nenhum floorGid pintado por cima!)
 *
 * uso: tsx compose-arena.mts <Training_ground.tmx> <outDir>
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { parseTmx, GID_MASK } from "../packages/forge/src/tmx.ts";

const [tmxPath, outDir] = process.argv.slice(2);
const parsed = await parseTmx(tmxPath);

const W = 30, H = 18;
// costura estrutural: insere cols 5-10 depois da col 10 (+6) e rows 11-12 depois da row 12 (+2)
const COL_AFTER = 10, COL_SRC0 = 5, COL_SRC1 = 10;
const ROW_AFTER = 12, ROW_SRC0 = 11, ROW_SRC1 = 12;
const COL_N = COL_SRC1 - COL_SRC0 + 1; // 6
const ROW_N = ROW_SRC1 - ROW_SRC0 + 1; // 2

type T = { x: number; y: number; raw: number };
const norm = (l: { tiles: { x: number; y: number; raw: number }[] }): T[] =>
  l.tiles.map((t) => ({ x: t.x - parsed.minX, y: t.y - parsed.minY, raw: t.raw >>> 0 }));

const layer = (name: string) => {
  const l = parsed.layers.find((x) => x.name === name);
  return l ? norm(l) : [];
};

/** expande por costura: originais deslocam depois do ponto; fonte é duplicada */
function seamExpand(tiles: T[]): T[] {
  const out: T[] = [];
  for (const t of tiles) {
    // passo 1: colunas
    const xs: number[] = [t.x <= COL_AFTER ? t.x : t.x + COL_N];
    if (t.x >= COL_SRC0 && t.x <= COL_SRC1) xs.push(COL_AFTER + 1 + (t.x - COL_SRC0));
    for (const x of xs) {
      // passo 2: linhas
      const ys: number[] = [t.y <= ROW_AFTER ? t.y : t.y + ROW_N];
      if (t.y >= ROW_SRC0 && t.y <= ROW_SRC1) ys.push(ROW_AFTER + 1 + (t.y - ROW_SRC0));
      for (const y of ys) if (x < W && y < H) out.push({ x, y, raw: t.raw });
    }
  }
  return out;
}

const offset = (tiles: T[], dx: number, dy: number): T[] => tiles.map((t) => ({ x: t.x + dx, y: t.y + dy, raw: t.raw }));
const splitCol = (tiles: T[], c: number): [T[], T[]] => [tiles.filter((t) => t.x < c), tiles.filter((t) => t.x >= c)];

// ---- ringue por nine-slice ----
// template do artista: região cols 13..21, rows 5..11 (border = cordas/postes; straw = tatame)
// destino: cols 9..24 (16), rows 5..14 (10): topo y5 · interior y6..12 · corda de baixo y13 · sombra do tatame y14
const RX = 9, RY = 5, RW = 16, RH = 10;
const TX = 13, TY = 5, TW = 9, TH = 7;
function nineSlice(tiles: T[], dropGids = new Set<number>()): T[] {
  const grid = new Map<string, number>();
  for (const t of tiles) {
    if (t.x >= TX && t.x < TX + TW && t.y >= TY && t.y < TY + TH && !dropGids.has(t.raw & GID_MASK)) {
      grid.set(`${t.x - TX},${t.y - TY}`, t.raw);
    }
  }
  // mapeia índice de destino → índice do template preservando MARGENS (2 col/1 row
  // de cada lado ficam fiéis ao artista; só o miolo liso é ciclado) — evita que
  // tiles decorados da borda do tatame reapareçam no meio como costura visível
  const mapIdx = (i: number, target: number, tpl: number, margin: number) => {
    if (i < margin) return i; // borda esquerda/topo intactas (inclui canto)
    if (i >= target - margin) return tpl - (target - i); // borda direita/baixo
    const core0 = margin, core1 = tpl - margin - 1; // miolo do template
    return core0 + ((i - margin) % (core1 - core0 + 1));
  };
  const out: T[] = [];
  for (let j = 0; j < RH; j++) {
    const tj = mapIdx(j, RH, TH, 2);
    for (let i = 0; i < RW; i++) {
      const ti = mapIdx(i, RW, TW, 3);
      const raw = grid.get(`${ti},${tj}`);
      if (raw !== undefined) out.push({ x: RX + i, y: RY + j, raw });
    }
  }
  return out;
}

// ---- monta as layers de saída (ordem = ordem de desenho) ----
const outLayers: { name: string; tiles: T[] }[] = [];
const push = (name: string, tiles: T[]) => { if (tiles.length) outLayers.push({ name, tiles }); };

push("Floor", seamExpand(layer("Floor")));
push("Walls_sand", seamExpand(layer("Walls_sand")));
push("ring_mat", nineSlice(layer("straw")));
push("details", seamExpand(layer("details")));
push("Targets", layer("Targets"));
{ // caixas: engradados (esq) ficam; pilha de armaduras (dir) desloca junto com a expansão
  const [crates, armor] = splitCol(layer("boxes"), 11);
  push("boxes", [...offset(crates, 0, ROW_N), ...offset(armor, COL_N, ROW_N)]);
}
for (const n of ["weapon stand1", "weapon stand2", "weapon stand3", "weapon stand4", "shield stand1", "shield stand2"]) push(n, layer(n));
push("ring_ropes", nineSlice(layer("border"), new Set([401]))); // 401 = nó da corda-barreira (descartada)
push("fence_top", seamExpand(layer("fence_top")));
{ // bandeiras: cada mastro é um grupo — esquerda fica, direita acompanha a expansão
  const [l, r] = splitCol(layer("flags"), 11);
  push("flags", [...offset(l, 0, ROW_N), ...offset(r, COL_N, ROW_N)]);
}

// ---- tilesets usados + scene.json ----
const used = new Set<number>();
const tsFor = (gid: number) => { const s = parsed.tilesets; for (let i = s.length - 1; i >= 0; i--) if (gid >= s[i].firstgid) return s[i]; return undefined; };
for (const l of outLayers) for (const t of l.tiles) { const ts = tsFor(t.raw & GID_MASK); if (ts) used.add(ts.firstgid); }

await fs.mkdir(outDir, { recursive: true });
const tilesets: any[] = [];
for (const ts of parsed.tilesets) {
  if (!used.has(ts.firstgid)) continue;
  const image = path.basename(ts.imagePath);
  await fs.copyFile(ts.imagePath, path.join(outDir, image));
  tilesets.push({ firstgid: ts.firstgid, name: ts.name, image, columns: ts.columns, tilecount: ts.tilecount, tileW: ts.tileW, tileH: ts.tileH });
}

const doc = {
  name: "arena",
  tileW: parsed.tileW, tileH: parsed.tileH,
  width: W, height: H,
  tilesets,
  layers: outLayers.map((l) => ({ name: l.name, tiles: l.tiles.flatMap((t) => [t.x, t.y, t.raw]) })),
  battle: { x: 10, y: 6, w: 14, h: 7 }, // interior do tatame — SEM floorGid: o chão é o do artista
};
await fs.writeFile(path.join(outDir, "scene.json"), JSON.stringify(doc));
console.log(`OK ${outDir}/scene.json (${W}x${H}, battle 14x7 no tatame, ${tilesets.length} tilesets)`);
