/**
 * CATÁLOGO DE PACKS (assets/_packs) — o "filtro de classificação" pra compor
 * mapas e cenas. Varre os packs de terceiros baixados, classifica cada um por
 * FACETAS (kind / theme / perspective / style / animated / tags) e escreve um
 * índice pesquisável. NÃO fatia sprite nem entra no jogo — é o mapa do pool.
 *
 * Classificação = TÍTULO (pista mais forte; CraftPix nomeia descritivamente)
 * + ESTRUTURA de pastas (frames numerados = animado) + AMOSTRA de imagem
 * (dimensão + nº de cores → separa pixel / 1-bit / hd, tile / background / ícone).
 *
 * Promoção pro jogo (fatiar em sheet Pixi via receita) é um passo SEPARADO,
 * feito só quando um asset é escolhido pra cena.
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ASSETS_DIR } from "./manifest";

export const PACKS_DIR = path.join(ASSETS_DIR, "_packs");
export const CATALOG = path.join(PACKS_DIR, "catalog.json");

export type PackKind =
  | "character" | "creature" | "tileset" | "background" | "prop" | "decoration"
  | "icon" | "ui" | "effect" | "unknown";

export interface PackEntry {
  slug: string;
  title: string;
  dir: string; // relativo a assets/
  sourceCategory: string; // rótulo do crawl (não confiável, só referência)
  kind: PackKind;
  theme: string; // dungeon/cave/forest/graveyard/desert/snow/lava/swamp/city/castle/water/generic
  perspective: "top-down" | "side" | "isometric" | "unknown";
  style: "pixel" | "onebit" | "hd" | "unknown";
  animated: boolean;
  usable: boolean; // passa no PADRÃO KNIGHT (ver isKnightStandard) → entra na biblioteca de cena
  viaVision?: boolean; // faceta refinada por passe de visão (sobrepõe o nome)
  tags: string[];
  pngCount: number;
  animFolders: number;
  sample?: { path: string; w: number; h: number; colors: number };
  catalogedAt: string;
}

export interface Catalog {
  version: number;
  count: number;
  byKind: Record<string, string[]>;
  byTheme: Record<string, string[]>;
  byPerspective: Record<string, string[]>;
  byStyle: Record<string, string[]>;
  byTag: Record<string, string[]>;
  animatedCount: number;
  usableCount: number; // packs no Padrão Knight (biblioteca de cena)
  entries: PackEntry[];
}

// ── mapas de palavra-chave (título/pastas → faceta). ordem = precedência ─────
const KIND_KW: [PackKind, string[]][] = [
  ["character", ["character", "hero", "knight", "warrior", "swordsman", "mage", "wizard", "archer", "rogue", "paladin", "barbarian", "class", "player", "protagonist", "soldier", "villager", "npc"]],
  ["creature", ["monster", "enemy", "creature", "skeleton", "zombie", "undead", "lich", "orc", "goblin", "slime", "dragon", "demon", "beast", "spider", "rat", "wolf", "bat", "ghost", "ghoul", "golem", "boss", "mob", "vampire", "werewolf", "minotaur", "troll", "imp"]],
  ["tileset", ["tileset", "tilemap", "tiles", "tile set", "map ", "rpg tile", "dungeon tile", "cave tile", "ground"]],
  ["background", ["background", "backgrounds", "parallax", "backdrop", "scene", "skybox"]],
  ["decoration", ["decoration", "decor", "furniture", "object", "props pack", "plant", "tree", "bush", "rock", "barrel", "chest", "crystal", "torch", "grave", "tombstone", "statue", "pillar", "fountain", "banner"]],
  ["prop", ["prop", "props", "item pack", "interactive"]],
  ["icon", ["icon", "icons", "item", "items", "loot", "potion", "inventory", "weapon icon", "armor icon", "spell icon", "gem", "coin"]],
  ["ui", ["gui", " ui ", "ui ", "interface", "hud", "button", "panel", "menu", "window", "frame pack", "cursor", "healthbar", "progress bar"]],
  ["effect", ["effect", "effects", "fx", "vfx", "explosion", "magic circle", "spell effect", "slash", "impact", "aura", "smoke"]],
];

const THEME_KW: [string, string[]][] = [
  ["dungeon", ["dungeon"]],
  ["cave", ["cave", "cavern", "mine", "underground"]],
  ["graveyard", ["graveyard", "cemetery", "crypt", "tomb", "necro", "undead", "death"]],
  ["forest", ["forest", "woods", "jungle", "grove", "nature", "tree"]],
  ["desert", ["desert", "sand", "wasteland", "dune", "oasis"]],
  ["snow", ["snow", "ice", "winter", "frozen", "arctic", "frost", "glacier"]],
  ["lava", ["lava", "volcano", "magma", "hell", "inferno", "fire cave"]],
  ["swamp", ["swamp", "marsh", "bog", "poison"]],
  ["castle", ["castle", "fortress", "keep", "throne", "royal"]],
  ["city", ["city", "town", "village", "urban", "street", "medieval town"]],
  ["water", ["ocean", "sea", "water", "beach", "underwater", "harbor", "ship"]],
  ["ruins", ["ruins", "ancient", "temple", "abandoned"]],
];

const PERSP_KW: [PackEntry["perspective"], string[]][] = [
  ["top-down", ["top-down", "top down", "topdown", "top_down", "birds eye", "bird's eye"]],
  ["isometric", ["isometric", "iso "]],
  ["side", ["side-scroller", "side scroller", "sidescroller", "platformer", "side view", "side-view"]],
];

/**
 * PADRÃO KNIGHT — a "regra de similaridade" da Forja (cravada 2026-07-12 pelo Nelson:
 * o Knight importado do CraftPix é o exemplo PERFEITO do que queremos). Um pack só é
 * USÁVEL na biblioteca de cena se casa com o Knight:
 *   • top-down (não side/iso/plano)
 *   • pixel art DE VERDADE (paleta contida, sem ruído/HD/AA) — corta hd/onebit
 *   • kind que vai NA cena — corta ícone/avatar-rosto/UI/background/effect
 * Tudo que foge disso é marcado usable=false (fica no disco, some da biblioteca).
 */
const USABLE_KINDS = new Set<PackKind>(["character", "creature", "tileset", "prop", "decoration"]);
function isKnightStandard(e: { perspective: string; style: string; kind: PackKind }): boolean {
  return e.perspective === "top-down" && e.style === "pixel" && USABLE_KINDS.has(e.kind);
}

const norm = (s: string) => " " + s.toLowerCase().replace(/[_\-/]+/g, " ").replace(/\s+/g, " ") + " ";
// match por PALAVRA/FRASE INTEIRA (hay é " tok tok … " c/ espaços): evita que
// "rat" case dentro de "decorative"/"generation". keyword com hífen vira espaço.
const matchKw = (hay: string, kws: string[]) => kws.some((k) => hay.includes(" " + k.trim().replace(/[-_/]+/g, " ") + " "));

function classifyName(title: string, folderNames: string[]): {
  kind: PackKind; theme: string; perspective: PackEntry["perspective"]; tags: string[];
} {
  const hay = norm(title + " " + folderNames.join(" "));
  let kind: PackKind = "unknown";
  for (const [k, kws] of KIND_KW) if (matchKw(hay, kws)) { kind = k; break; }
  let theme = "generic";
  for (const [t, kws] of THEME_KW) if (matchKw(hay, kws)) { theme = t; break; }
  let perspective: PackEntry["perspective"] = "unknown";
  for (const [p, kws] of PERSP_KW) if (matchKw(hay, kws)) { perspective = p; break; }
  const tags = Array.from(new Set(hay.trim().split(" ").filter((w) => w.length >= 3 && !/^\d+$/.test(w)))).slice(0, 24);
  return { kind, theme, perspective, tags };
}

// ── varredura de arquivos do pack ───────────────────────────────────────────
const IGNORE_DIR = new Set(["__macosx", "psd"]);
const isPng = (n: string) => n.toLowerCase().endsWith(".png");
const isJunkPng = (n: string) => /orig_big\.png$/i.test(n); // versão 4× ampliada = dup

async function scanPack(dir: string): Promise<{ pngs: string[]; folders: string[]; animFolders: number }> {
  const pngs: string[] = [];
  const folders = new Set<string>();
  let animFolders = 0;
  async function walk(d: string) {
    let ents;
    try { ents = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    const localNums: number[] = [];
    for (const e of ents) {
      if (e.isDirectory()) {
        if (IGNORE_DIR.has(e.name.toLowerCase())) continue;
        folders.add(e.name);
        await walk(path.join(d, e.name));
      } else if (isPng(e.name) && !isJunkPng(e.name)) {
        pngs.push(path.join(d, e.name));
        const m = e.name.match(/^(\d+)\.png$/i);
        if (m) localNums.push(Number(m[1]));
      }
    }
    if (localNums.length >= 3) animFolders++; // pasta com 1.png,2.png,3.png… = animação
  }
  await walk(dir);
  return { pngs, folders: [...folders], animFolders };
}

/** amostra: pega uma imagem representativa (nem minúscula nem gigante) → dims + nº cores aprox. */
async function sampleImage(pngs: string[]): Promise<PackEntry["sample"] | undefined> {
  // prefere "orig.png" (composição do pack) senão a 1ª razoável
  const pick = pngs.find((p) => /orig\.png$/i.test(p)) ?? pngs.find((p) => !/\borig/i.test(p)) ?? pngs[0];
  if (!pick) return undefined;
  try {
    const meta = await sharp(pick).metadata();
    const w = meta.width ?? 0, h = meta.height ?? 0;
    // conta cores num downsample (NEAREST — lanczos inventaria cores e quebraria
    // a separação 1-bit/pixel/hd). 96px dá amostra suficiente sem custo alto.
    const { data } = await sharp(pick).resize(96, 96, { fit: "inside", kernel: "nearest" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const set = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      set.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    return { path: path.relative(ASSETS_DIR, pick).replace(/\\/g, "/"), w, h, colors: set.size };
  } catch { return undefined; }
}

function refineWithStructure(
  base: ReturnType<typeof classifyName>,
  s: { pngCount: number; animFolders: number; sample?: PackEntry["sample"] },
): { kind: PackKind; style: PackEntry["style"]; animated: boolean } {
  let kind = base.kind;
  const sample = s.sample;
  const w = sample?.w ?? 0, h = sample?.h ?? 0, colors = sample?.colors ?? 0;
  const aspect = w && h ? w / h : 1;

  // estilo por nº de cores da amostra
  let style: PackEntry["style"] = "unknown";
  if (colors > 0) {
    if (colors <= 4) style = "onebit";
    else if (colors <= 90 && Math.max(w, h) <= 2048) style = "pixel";
    else style = "hd";
  }

  // desempate estrutural quando o nome não decidiu
  if (kind === "unknown") {
    if (s.animFolders >= 1) kind = "creature"; // sequência animada isolada → provável criatura/char
    else if (aspect >= 1.8 || aspect <= 0.55) kind = "background"; // muito panorâmico
    else if (Math.max(w, h) <= 64 && s.pngCount >= 8) kind = "icon"; // muitos quadradinhos
    else if (Math.max(w, h) >= 512) kind = "tileset";
  }
  const animated = s.animFolders >= 1;
  return { kind, style, animated };
}

async function readProvTitles(): Promise<Map<string, string>> {
  try {
    const prov = JSON.parse(await fs.readFile(path.join(PACKS_DIR, "PROVENANCE.json"), "utf8"));
    return new Map(Object.entries(prov.entries ?? {}).map(([slug, v]: any) => [slug, v.title || slug]));
  } catch { return new Map(); }
}

/** overrides de VISÃO (slug → facetas). Sobrevive ao rebuild do catálogo. */
export interface VisionOverride { perspective?: PackEntry["perspective"]; kind?: PackKind; theme?: string; style?: PackEntry["style"]; }
export const VISION_FILE = path.join(PACKS_DIR, "vision.json");
async function readVision(): Promise<Record<string, VisionOverride>> {
  try { return JSON.parse(await fs.readFile(VISION_FILE, "utf8")); } catch { return {}; }
}

/** varre assets/_packs/<categoria>/<slug>, classifica e escreve catalog.json. */
export async function buildCatalog(o: { nowIso: string; log?: (m: string) => void }): Promise<Catalog> {
  const log = o.log ?? (() => {});
  const titles = await readProvTitles();
  const vision = await readVision();
  const entries: PackEntry[] = [];

  let cats;
  try { cats = await fs.readdir(PACKS_DIR, { withFileTypes: true }); } catch { cats = []; }
  for (const cat of cats) {
    if (!cat.isDirectory() || cat.name.startsWith("_")) continue; // pula _zips
    const catDir = path.join(PACKS_DIR, cat.name);
    const packDirs = (await fs.readdir(catDir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory());
    for (const pk of packDirs) {
      const dir = path.join(catDir, pk.name);
      const { pngs, folders, animFolders } = await scanPack(dir);
      if (!pngs.length) continue;
      const title = titles.get(pk.name) ?? pk.name.replace(/-/g, " ");
      const named = classifyName(title, folders);
      const sample = await sampleImage(pngs);
      const ref = refineWithStructure(named, { pngCount: pngs.length, animFolders, sample });
      const ov = vision[pk.name]; // visão sobrepõe o nome quando existe
      const kind = ov?.kind ?? ref.kind, theme = ov?.theme ?? named.theme;
      const perspective = ov?.perspective ?? named.perspective, style = ov?.style ?? ref.style;
      entries.push({
        slug: pk.name,
        title,
        dir: path.relative(ASSETS_DIR, dir).replace(/\\/g, "/"),
        sourceCategory: cat.name,
        kind,
        theme,
        perspective,
        style,
        animated: ref.animated,
        usable: isKnightStandard({ perspective, style, kind }),
        viaVision: !!ov,
        tags: named.tags,
        pngCount: pngs.length,
        animFolders,
        sample,
        catalogedAt: o.nowIso,
      });
    }
  }
  const cat = facet(entries);
  await fs.writeFile(CATALOG, JSON.stringify(cat, null, 2) + "\n", "utf8");
  log(`catalogados ${entries.length} packs → ${path.relative(ASSETS_DIR, CATALOG)}`);
  return cat;
}

function facet(entries: PackEntry[]): Catalog {
  entries.sort((a, b) => a.slug.localeCompare(b.slug));
  const push = (m: Record<string, string[]>, k: string, id: string) => { (m[k] ??= []).push(id); };
  // objetos SEM protótipo: tags são palavras livres e podem colidir com chaves
  // herdadas (constructor, toString…) — Object.create(null) elimina isso.
  const byKind: Record<string, string[]> = Object.create(null), byTheme: Record<string, string[]> = Object.create(null),
    byPerspective: Record<string, string[]> = Object.create(null), byStyle: Record<string, string[]> = Object.create(null), byTag: Record<string, string[]> = Object.create(null);
  let animatedCount = 0, usableCount = 0;
  for (const e of entries) {
    push(byKind, e.kind, e.slug);
    push(byTheme, e.theme, e.slug);
    push(byPerspective, e.perspective, e.slug);
    push(byStyle, e.style, e.slug);
    for (const t of e.tags) push(byTag, t, e.slug);
    if (e.animated) animatedCount++;
    if (e.usable) usableCount++;
  }
  return { version: 1, count: entries.length, byKind, byTheme, byPerspective, byStyle, byTag, animatedCount, usableCount, entries };
}

export async function readCatalog(): Promise<Catalog | null> {
  try { return JSON.parse(await fs.readFile(CATALOG, "utf8")) as Catalog; } catch { return null; }
}

export interface FindQuery {
  kind?: string; theme?: string; perspective?: string; style?: string; animated?: boolean; tag?: string; usable?: boolean;
}

/** filtra o catálogo por facetas (AND). É o "filtro pra compor mapas/cenas". */
export function findPacks(cat: Catalog, q: FindQuery): PackEntry[] {
  return cat.entries.filter((e) =>
    (!q.kind || e.kind === q.kind) &&
    (!q.theme || e.theme === q.theme) &&
    (!q.perspective || e.perspective === q.perspective) &&
    (!q.style || e.style === q.style) &&
    (q.animated === undefined || e.animated === q.animated) &&
    (q.usable === undefined || e.usable === q.usable) &&
    (!q.tag || e.tags.includes(q.tag.toLowerCase())),
  );
}
