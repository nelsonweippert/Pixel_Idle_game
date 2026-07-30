/**
 * compose-biome-clearing.mts — compõe uma CLAREIRA/CÂMARA DE BATALHA top-down a
 * partir da base de arte PixelWorld + tilesets Wang do Pixellab (Wraithfall-idle).
 *
 * PRINCÍPIO (validado pelo usuário): a área de batalha só lê como espaço coerente
 * quando é ENCLAUSURADA e a beirada é NATURAL (sem retângulo duro). Aqui:
 *   - piso = tileset WANG dual-grid → um `stampDisk` carimba uma plataforma orgânica
 *     no centro e os tiles wang GERAM A BORDA FUNDIDA sozinhos (cura da "caixa dura").
 *   - moldura = anel de PROPS do tema (árvores / lápides…) = o enclausuramento.
 *   - centro aberto = onde os heróis lutam.
 *
 * Porta a lógica pura do `Wraithfall-idle/src/game/wang.ts` (makeGrid/stampDisk/
 * lookup por cantos NE_NW_SE_SW → bounding_box) para Node+sharp (sem Phaser),
 * bakando tudo num PNG. Verificação é VISUAL: renderiza e olha com os olhos.
 *
 * uso: npx tsx tools/compose-biome-clearing.mts <tema> <out.png> [seed]
 *   ex: npx tsx tools/compose-biome-clearing.mts forest out.png 7
 *       npx tsx tools/compose-biome-clearing.mts crypt  out.png 5
 */
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

// ── origem dos assets (Wraithfall-idle compartilha a base PixelWorld) ────────────
const WF = "C:/Users/Storming/Desktop/GItHubs/Wraithfall-idle/public/assets/sprites";
const TILESETS = `${WF}/tilesets`;
const PROPS = `${WF}/_pixelworld-raw/props`;
const BUILDINGS = `${WF}/_pixelworld-raw/buildings`;

// ── TEMAS: cada bioma = tileset wang (campo/plataforma) + pools de props (por porte).
//    `field` = terreno que preenche; `platform` = terreno do disco central (arena).
//    Pools: ring (moldura, props altos) · big (parede de fundo) · scatter (chão) · rock.
interface Band { dir: string; hMin: number; hMax: number; wMax?: number; }
interface Theme {
  tileset: string; field: "lower" | "upper"; platform: "lower" | "upper";
  ring: Band; big: Band; scatter: Band; rock: Band;
  nBig: number; fillDiv: number; // densidade
}
const THEMES: Record<string, Theme> = {
  forest: {
    tileset: "flagstone-mossgrass", field: "upper", platform: "lower",
    ring: { dir: `${PROPS}/Trees/frames`, hMin: 50, hMax: 140 },
    big: { dir: `${PROPS}/Trees/frames`, hMin: 175, hMax: 300 },
    scatter: { dir: `${PROPS}/Trees/frames`, hMin: 20, hMax: 46 },
    rock: { dir: `${PROPS}/Stone/frames`, hMin: 0, hMax: 60, wMax: 60 },
    nBig: 5, fillDiv: 14,
  },
  crypt: {
    // cripta = necrópole/cemitério: ardósia escura (campo) + mármore creme (plataforma),
    // moldura de lápides/mausoléus/estátuas, ossos/correntes/urnas no chão.
    tileset: "dirt-flagstone", field: "lower", platform: "upper",
    ring: { dir: `${BUILDINGS}/CemeterySprites/frames`, hMin: 42, hMax: 135 },
    big: { dir: `${BUILDINGS}/CemeterySprites/frames`, hMin: 100, hMax: 240 },
    scatter: { dir: `${BUILDINGS}/TortureChamber/frames`, hMin: 12, hMax: 42 },
    rock: { dir: `${BUILDINGS}/CemeterySprites/frames`, hMin: 20, hMax: 44, wMax: 44 },
    nBig: 3, fillDiv: 22,
  },
};

const [themeName = "forest", outPath = "clearing.png", seedArg = "7"] = process.argv.slice(2);
const theme = THEMES[themeName];
if (!theme) throw new Error(`tema desconhecido '${themeName}' — use: ${Object.keys(THEMES).join(", ")}`);
const SEED = Number(seedArg);
const tilesetOverride = process.argv[5]; // p/ testar tilesets wang rapidinho (compare com os olhos)
if (tilesetOverride) theme.tileset = tilesetOverride;

// RNG determinístico (mulberry32) — mesma seed → mesma cena (reprodutível)
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const jitter = (n: number) => (rnd() * 2 - 1) * n;

// ── grid Wang (porta de wang.ts) ─────────────────────────────────────────────────
type Corner = "lower" | "upper";
type Grid = Corner[][];
function makeGrid(rows: number, cols: number, fill: Corner): Grid {
  const g: Grid = [];
  for (let r = 0; r <= rows; r++) { const row: Corner[] = []; for (let c = 0; c <= cols; c++) row.push(fill); g.push(row); }
  return g;
}
function stampDisk(g: Grid, dcx: number, dcy: number, radius: number, terrain: Corner, squash = 1) {
  const rows = g.length - 1, cols = g[0].length - 1, r2 = radius * radius;
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const dx = c - dcx, dy = (r - dcy) / squash;
    if (dx * dx + dy * dy <= r2) g[r][c] = terrain;
  }
}

// ── carrega raw RGBA de um PNG ─────────────────────────────────────────────────
type Img = { data: Buffer; w: number; h: number };
async function loadRaw(file: string): Promise<Img> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
/** carrega uma pasta e filtra por porte (banda) → pool de props */
async function loadBand(b: Band): Promise<Img[]> {
  const files = (await fs.readdir(b.dir)).filter((f) => f.endsWith(".png"));
  const out: Img[] = [];
  for (const f of files) {
    const im = await loadRaw(path.join(b.dir, f));
    if (im.h >= b.hMin && im.h <= b.hMax && (b.wMax === undefined || im.w <= b.wMax)) out.push(im);
  }
  return out;
}
// alpha-over blit de src (offset sx,sy, tam tw×th) em dst (dx,dy)
function blit(dst: Buffer, DW: number, DH: number, src: Img, sx: number, sy: number, tw: number, th2: number, dx: number, dy: number) {
  for (let y = 0; y < th2; y++) for (let x = 0; x < tw; x++) {
    const px = dx + x, py = dy + y;
    if (px < 0 || py < 0 || px >= DW || py >= DH) continue;
    const si = ((sy + y) * src.w + (sx + x)) * 4, sa = src.data[si + 3];
    if (!sa) continue;
    const di = (py * DW + px) * 4;
    if (sa === 255) { dst[di] = src.data[si]; dst[di + 1] = src.data[si + 1]; dst[di + 2] = src.data[si + 2]; dst[di + 3] = 255; }
    else { const a = sa / 255, ia = 1 - a;
      dst[di] = src.data[si] * a + dst[di] * ia; dst[di + 1] = src.data[si + 1] * a + dst[di + 1] * ia;
      dst[di + 2] = src.data[si + 2] * a + dst[di + 2] * ia; dst[di + 3] = Math.min(255, sa + dst[di + 3] * ia); }
  }
}

// ── dimensões da cena ─────────────────────────────────────────────────────────
const COLS = 40, ROWS = 26, TILE = 16;         // 640×416 px nativos (+margem = zoom-out)
const W = COLS * TILE, H = ROWS * TILE;
const cx = COLS / 2, cy = ROWS / 2;

// ── 1) piso WANG: campo (theme.field) + plataforma orgânica (theme.platform) ──────
const meta = JSON.parse(await fs.readFile(`${TILESETS}/${theme.tileset}.json`, "utf8"));
const wang = await loadRaw(`${TILESETS}/${theme.tileset}.png`);
const tw = meta.tile_size.width, th = meta.tile_size.height;
const lookup = new Map<string, { x: number; y: number; width: number; height: number }>();
for (const t of meta.tileset_data.tiles) lookup.set(`${t.corners.NE}_${t.corners.NW}_${t.corners.SE}_${t.corners.SW}`, t.bounding_box);

const grid = makeGrid(ROWS, COLS, theme.field);
stampDisk(grid, cx, cy, 8.2, theme.platform, 1.18);   // disco achatado (perspectiva top-down)

const out = Buffer.alloc(W * H * 4, 0);
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const NW = grid[r][c], NE = grid[r][c + 1], SW = grid[r + 1][c], SE = grid[r + 1][c + 1];
  const bb = lookup.get(`${NE}_${NW}_${SE}_${SW}`);
  if (!bb) continue;
  blit(out, W, H, wang, bb.x, bb.y, tw, th, c * TILE, r * TILE);
}

// ── 2) props: MOLDURA densa (enclausuramento) + entrada + scatter ────────────────
const ringP = await loadBand(theme.ring);
const bigP = await loadBand(theme.big);
const scatterP = await loadBand(theme.scatter);
const rockP = await loadBand(theme.rock);

type Placed = { im: Img; x: number; y: number };
const placed: Placed[] = [];
const platR = 8.0;                                   // raio (tiles) livre no centro p/ a batalha
const push = (im: Img, tx: number, ty: number) => placed.push({ im, x: tx * TILE, y: ty * TILE });
const onPlatform = (tx: number, ty: number) => { const dx = tx - cx, dy = (ty - cy) / 1.35; return Math.hypot(dx, dy) < platR; };
const inEntrance = (tx: number, ty: number) => ty > cy && Math.abs(tx - cx) < 4.5; // boca aberta no fundo

// (a) parede de FUNDO: grandes atrás + fileira de props altos no topo (profundidade)
for (let i = 0; i < theme.nBig; i++) push(pick(bigP), 2 + (i / Math.max(1, theme.nBig - 1)) * (COLS - 4) + jitter(1.5), 1.2 + jitter(0.8));
for (let tx = 1; tx < COLS - 0.5; tx += 1.6) push(pick(ringP), tx + jitter(0.5), 2.4 + jitter(0.7));

// (b) LATERAIS: colunas densas nas duas bordas
for (let ty = 3; ty < ROWS - 1; ty += 1.5) {
  push(pick(ringP), 1.4 + jitter(0.5), ty + jitter(0.4));
  push(pick(ringP), COLS - 1.6 + jitter(0.5), ty + jitter(0.4));
}

// (c) FUNDO da cena: fileira de baixo, deixando a boca de entrada aberta
for (let tx = 1.5; tx < COLS - 1; tx += 1.7) { if (inEntrance(tx, ROWS - 1)) continue; push(pick(ringP), tx + jitter(0.4), ROWS - 1.4 + jitter(0.4)); }

// (d) ANEL colado na plataforma: enclausura a arena de perto (pula o arco da entrada)
const nRing = 22;
for (let i = 0; i < nRing; i++) {
  const a = (i / nRing) * Math.PI * 2;
  const rr = platR + 1.1 + rnd() * 1.2;
  const tx = cx + Math.cos(a) * rr, ty = cy + Math.sin(a) * rr * 0.82;
  if (tx < 1 || tx > COLS - 1 || ty < 1 || ty > ROWS - 1) continue;
  if (inEntrance(tx, ty)) continue;                  // não fecha a entrada
  push(pick(rnd() < 0.7 ? ringP : scatterP), tx, ty);
}

// (e) preenche o campo entre a plataforma e a parede (densidade do tema)
const nFill = Math.round((COLS * ROWS) / theme.fillDiv);
for (let i = 0; i < nFill; i++) {
  const tx = 1.5 + rnd() * (COLS - 3), ty = 1.5 + rnd() * (ROWS - 3);
  const dx = tx - cx, dy = (ty - cy) / 1.18, d = Math.hypot(dx, dy);
  if (d < platR + 1.3 || onPlatform(tx, ty) || inEntrance(tx, ty)) continue; // deixa a plaza e a boca livres
  push(pick(rnd() < 0.6 ? ringP : scatterP), tx, ty);
}
// entulho/pedras soltas no campo
for (let i = 0; i < 8; i++) {
  const tx = 2 + rnd() * (COLS - 4), ty = 2 + rnd() * (ROWS - 4);
  const d = Math.hypot(tx - cx, (ty - cy) / 1.18);
  if (d < platR + 1.5 || inEntrance(tx, ty)) continue;
  push(pick(rockP), tx, ty);
}
// (f) detalhe de chão DENTRO da plataforma, só na beirada (centro livre p/ a batalha)
for (let i = 0; i < 4; i++) { const a = (rnd() < 0.5 ? -0.4 : Math.PI + 0.4) + jitter(0.6); const rr = platR * (0.8 + rnd() * 0.14);
  push(pick(rnd() < 0.5 ? rockP : scatterP), cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.6); }

placed.sort((a, b) => a.y - b.y);                    // depth: fundo primeiro
for (const p of placed) blit(out, W, H, p.im, 0, 0, p.im.w, p.im.h, Math.round(p.x - p.im.w / 2), Math.round(p.y - p.im.h));

await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(outPath);
// área de batalha (em tiles) = o disco central da plataforma
const battle = { x: Math.round(cx - platR * 0.72), y: Math.round(cy - platR * 0.5), w: Math.round(platR * 1.44), h: Math.round(platR) };

// emite scene.json BAKADO ao lado do PNG (shape lido por loadTiledScene: campo `baked`)
const outDir = path.dirname(outPath);
const scene = { name: themeName, baked: path.basename(outPath), pxW: W, pxH: H, tileW: TILE, tileH: TILE, tilesets: [], layers: [], battle };
await fs.writeFile(path.join(outDir, "scene.json"), JSON.stringify(scene, null, 2));

console.log(`cena '${themeName}' (${theme.tileset}) seed ${SEED}: ${W}x${H}px, ${placed.length} props → ${outPath}`);
console.log(`pools: ring=${ringP.length} big=${bigP.length} scatter=${scatterP.length} rock=${rockP.length}`);
console.log(`battle(tiles) ≈`, JSON.stringify(battle));
