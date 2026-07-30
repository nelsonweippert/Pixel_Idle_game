/**
 * catalog-mapkit.mts — CLASSIFICA a base de arte de MAPA (PixelWorld + tilesets Wang
 * do Pixellab, origem Wraithfall-idle) num catálogo estruturado pro MAP EDITOR.
 *
 * Divisão de trabalho (decisão do Nelson): o CLAUDE classifica, o Fable constrói o
 * editor, o Nelson desenha os mapas. Este script é a MINHA parte — a classificação.
 *
 * O que faz:
 *   1. Varre a base e classifica cada pasta em: category (wang | tile | prop),
 *      theme (forest/desert/snow/lava/dungeon/mountain/water/village/road/generic)
 *      e anchor (props = pé/bottom-center; tiles = topo-esq).
 *   2. COPIA os assets de mapa pra apps/web/public/mapkit/ (servíveis pelo editor+jogo).
 *   3. Emite apps/web/public/mapkit/catalog.json (packs → files, com dims + metadata,
 *      e p/ wang: tile_size + tiles[corners→bbox] + descrições de terreno).
 *
 * uso: npx tsx tools/catalog-mapkit.mts
 */
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const SRC = "C:/Users/Storming/Desktop/GItHubs/Wraithfall-idle/public/assets/sprites";
const DEST = path.resolve("apps/web/public/mapkit");

// ── classificação CURADA (Fable 5 olhando a arte real de cada pack) ──────────────
// tools/mapkit-themes.json: id → { theme, tags, desc, confidence }. Tem prioridade
// sobre as tabelas de palpite-por-nome abaixo. Gerado em tools/pack-sheets + agentes.
type Curated = { theme: string; tags: string[]; desc: string; confidence: string };
let CLASS: Record<string, Curated> = {};
try { CLASS = JSON.parse(await fs.readFile(path.resolve("tools/mapkit-themes.json"), "utf8")); }
catch { console.warn("⚠ tools/mapkit-themes.json ausente — usando só as tabelas de nome"); }

// rótulos PT-BR de cada tema (mostrados no editor). Ordem = agrupamento lógico.
const THEME_LABELS: Record<string, string> = {
  floresta: "Floresta", outono: "Floresta de Outono", deserto: "Deserto", neve: "Neve & Gelo",
  vulcanico: "Terras Vulcânicas", montanha: "Montanhas & Penhascos", agua: "Água",
  masmorra: "Masmorra & Caverna", cemiterio: "Cemitério & Cripta",
  vila: "Vila", castelo: "Castelo & Forte", elfico: "Arquitetura Élfica", templo: "Templo & Torre Arcana",
  ruinas: "Ruínas", fortificacao: "Muralhas & Estruturas", interior: "Interiores",
  estrada: "Estradas & Caminhos", tesouro: "Tesouro & Loot", decoracao: "Decoração & Obstáculos",
  sombra: "Sombras", generic: "Genérico",
};
const THEME_ORDER = Object.keys(THEME_LABELS);
// aplica a curadoria (ou cai no palpite por nome); devolve os campos de tema do pack
const classify = (id: string, fallback: string) => {
  const c = CLASS[id];
  const theme = c?.theme ?? fallback;
  return { theme, themeLabel: THEME_LABELS[theme] ?? theme, tags: c?.tags ?? [], desc: c?.desc ?? "" };
};

// ── tabela de TEMA por pasta (a inteligência da classificação) ───────────────────
// chave = nome da pasta (dentro de tiles/ props/ buildings/ scenery/); valor = tema.
const THEME: Record<string, string> = {
  // grama / floresta
  TileGrass: "forest", TileHighGrass: "forest", Trees: "forest", TreeAndStoneSprites: "forest",
  BonusFantasyTrees: "forest", NatureFantasySpriteSheet: "forest", Stone: "forest",
  RoadsAndGrassSprites: "road", RoadsFantasySpriteSheet: "road", GreenPuddle: "forest",
  TilesFantasyLands_Fall: "autumn",
  // deserto
  DesertTiles: "desert", DesertElements: "desert",
  // neve / gelo
  TileSnow: "snow", TileSnowCliffs: "snow", TileIceBonus: "snow", SnowTreesSpriteSheet: "snow",
  SnowPile: "snow", PalisadeSnow: "snow", BuildingsSnowSpriteSheet: "snow",
  // lava / terras malignas
  TileLava: "lava", TileEvilCliffs: "lava", TilesEvilLands: "lava", TilesEvilTile: "lava",
  EvilEnvironmentElements: "lava", RoadsEvilSpriteSheet: "lava",
  // masmorra / cripta
  TileDungeon: "dungeon", TileDungeonBonus: "dungeon", TileDungeon_Cliff: "dungeon",
  Dungeon: "dungeon", Dungeon2: "dungeon", CemeterySprites: "dungeon", TortureChamber: "dungeon",
  Ruins: "dungeon", MineSprites: "dungeon", CaveSprites: "dungeon",
  // montanha / penhasco
  TileCliff: "mountain", TileCliffMountains: "mountain", TileFantasyCliffs: "mountain",
  TilesMountains: "mountain", MountainsAndRoads: "mountain",
  // água
  TileWaterAnimated: "water", TileDarkWaterAnimated: "water", RiverLakeSprites: "water",
  BoatWaves: "water", Bridges: "water",
  // vila / castelo / estruturas
  CastleEnglish: "village", CastleLimestone: "village", CastleStone: "village",
  PremadeBuildingsBrick: "village", PremadeBuildingsStone: "village", PremadeBuildingsStoneWood: "village",
  PremadeBuildingsWood: "village", VillageBuildingSprites: "village", TownSprites: "village",
  TentAndVillageElem: "village", TentSprites: "village", ElvenBarracks: "village",
  ElvenBuildings_Village: "village", FortBuildings: "village", GateAndTowerSprites: "village",
  Towers: "village", MageTowerSpriteSheet: "village", MonasterySprites: "village",
  DestroyedHouseSprites: "village", PumpkinsFarm: "village", DragonsTreasure: "village",
  ElvenChest: "village", StoneCastleBonus: "village", FarmSprites: "village",
  ModularBonusRoofElements: "structure", ModularStoneElements: "structure", ModularWoodenElements: "structure",
  StoneWalls: "structure", BonusWalls: "structure", Palisade: "structure",
  WoodenElements: "structure", WoodenElements2: "structure", WoodenElementsSpriteSheet: "structure",
  StatueandFenceSpriteSheet: "structure", ObstacleAndPropsSprites: "generic",
  // estradas
  Roads: "road", StoneAndRoadsSpriteSheet: "road",
  // interiores (menos úteis p/ mapa externo, mas classificados)
  InteriorElementsSpriteSheet: "interior", InteriorItems: "interior", InteriorSprites: "interior",
};

// tema por prefixo de nome do tileset WANG (o 2º termo dá o "de→para")
const WANG_THEME: Record<string, string> = {
  "grass-wood": "forest", "stone-grass": "forest", "flagstone-mossgrass": "forest",
  "cherry-petals": "forest", "clay-jade": "forest",
  "sand-stones": "desert", "cobble-sandstone": "desert",
  "frost-snow": "snow",
  "stone-cinnabar": "lava", "basalt-monochrome": "lava", "obsidian-gold": "lava",
  "dirt-flagstone": "dungeon", "slate-gravel": "dungeon", "slate-marble": "dungeon",
  "water-flagstone": "water", "wood-bronze": "structure",
};

interface FileEntry { path: string; w: number; h: number; }
interface Pack {
  id: string; name: string; category: "wang" | "tile" | "prop";
  theme: string; themeLabel: string; tags: string[]; desc: string;
  anchor: "feet" | "topleft"; tileW?: number; tileH?: number;
  wang?: { tileW: number; tileH: number; lower: string; upper: string; tiles: { key: string; x: number; y: number; w: number; h: number }[] };
  files: FileEntry[];
}

async function dims(file: string) { const m = await sharp(file).metadata(); return { w: m.width ?? 0, h: m.height ?? 0 }; }
async function copyFile(from: string, toRel: string) {
  const to = path.join(DEST, toRel);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
  return `/mapkit/${toRel.replace(/\\/g, "/")}`;
}

const packs: Pack[] = [];

// ── 1) WANG tilesets ─────────────────────────────────────────────────────────────
const wangFiles = (await fs.readdir(`${SRC}/tilesets`)).filter((f) => f.endsWith(".json"));
for (const jf of wangFiles) {
  const id = jf.replace(/\.json$/, "");
  const meta = JSON.parse(await fs.readFile(`${SRC}/tilesets/${jf}`, "utf8"));
  const pngRel = await copyFile(`${SRC}/tilesets/${id}.png`, `wang/${id}.png`);
  const { w, h } = await dims(`${SRC}/tilesets/${id}.png`);
  packs.push({
    id: `wang/${id}`, name: id.replace(/-/g, " → "), category: "wang",
    ...classify(`wang/${id}`, WANG_THEME[id] ?? "generic"), anchor: "topleft",
    tileW: meta.tile_size.width, tileH: meta.tile_size.height,
    wang: {
      tileW: meta.tile_size.width, tileH: meta.tile_size.height,
      lower: meta.lower_description ?? "", upper: meta.upper_description ?? "",
      tiles: meta.tileset_data.tiles.map((t: any) => ({
        key: `${t.corners.NE}_${t.corners.NW}_${t.corners.SE}_${t.corners.SW}`,
        x: t.bounding_box.x, y: t.bounding_box.y, w: t.bounding_box.width, h: t.bounding_box.height,
      })),
    },
    files: [{ path: pngRel, w, h }],
  });
}

// ── 2) tiles / props / buildings / scenery ───────────────────────────────────────
const CATS = ["tiles", "props", "buildings", "scenery"] as const;
for (const cat of CATS) {
  let sub: string[];
  try { sub = await fs.readdir(`${SRC}/_pixelworld-raw/${cat}`); } catch { continue; }
  for (const folder of sub) {
    const framesDir = `${SRC}/_pixelworld-raw/${cat}/${folder}/frames`;
    let frames: string[];
    try { frames = (await fs.readdir(framesDir)).filter((f) => f.endsWith(".png")); } catch { continue; }
    if (!frames.length) continue;

    // classifica category: pasta "tiles/" ou dims 32×32 dominante = tile pintável; senão prop
    const sampleDims = await Promise.all(frames.slice(0, 24).map((f) => dims(`${framesDir}/${f}`)));
    const sq32 = sampleDims.filter((d) => d.w === 32 && d.h === 32).length;
    const isTile = cat === "tiles" || sq32 > sampleDims.length * 0.6;
    const category = isTile ? "tile" : "prop";
    const fallback = THEME[folder] ?? (cat === "scenery" ? "estrada" : "decoracao");

    const files: FileEntry[] = [];
    for (const f of frames) {
      const { w, h } = await dims(`${framesDir}/${f}`);
      const rel = await copyFile(`${framesDir}/${f}`, `${cat}/${folder}/${f}`);
      files.push({ path: rel, w, h });
    }
    packs.push({
      id: `${cat}/${folder}`, name: folder.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/Sprites?|SpriteSheet/g, "").trim(),
      category, ...classify(`${cat}/${folder}`, fallback), anchor: category === "tile" ? "topleft" : "feet",
      tileW: isTile ? 32 : undefined, tileH: isTile ? 32 : undefined,
      files,
    });
  }
}

// ── 3) emite catalog.json ────────────────────────────────────────────────────────
const byCat = (c: string) => packs.filter((p) => p.category === c).length;
const used = new Set(packs.map((p) => p.theme));
const themes = THEME_ORDER.filter((t) => used.has(t)); // só os temas realmente usados, na ordem lógica
const themeLabels = Object.fromEntries(themes.map((t) => [t, THEME_LABELS[t] ?? t]));
const catalog = {
  version: 2,
  generatedFrom: "PixelWorld + Pixellab Wang (Wraithfall-idle) · classificação curada por Fable 5 (visão)",
  counts: { packs: packs.length, wang: byCat("wang"), tile: byCat("tile"), prop: byCat("prop"), files: packs.reduce((s, p) => s + p.files.length, 0) },
  themes, themeLabels,
  packs: packs.sort((a, b) => (a.category.localeCompare(b.category) || THEME_ORDER.indexOf(a.theme) - THEME_ORDER.indexOf(b.theme) || a.id.localeCompare(b.id))),
};
await fs.mkdir(DEST, { recursive: true });
await fs.writeFile(path.join(DEST, "catalog.json"), JSON.stringify(catalog, null, 2));

console.log(`✅ mapkit: ${catalog.counts.packs} packs (${catalog.counts.wang} wang · ${catalog.counts.tile} tile · ${catalog.counts.prop} prop) · ${catalog.counts.files} arquivos`);
console.log(`   temas: ${themes.join(", ")}`);
console.log(`   → ${path.join(DEST, "catalog.json")}`);
