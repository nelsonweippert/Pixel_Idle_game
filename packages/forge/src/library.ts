/**
 * BIBLIOTECA DE ASSETS EXTERNOS — o pool classificado de arte de terceiros que
 * passou pela Forja e virou padrão nosso (64px, transparente, sem AA, snap
 * Resurrect 64). É SEPARADO do assets/manifest.json (o portão do JOGO): aqui é
 * a matéria-prima adaptada; um asset é "promovido" da biblioteca pro jogo quando
 * de fato for usado. Ver relatório de fontes/licenças (pesquisa 2026-07-11).
 *
 * IMPORTANTE (licença): passar pela Forja NÃO muda a licença do original. Cada
 * import guarda a proveniência (source) pra auditoria/créditos.
 *
 * Fluxo effect (packs tipo "Effect and FX"): cada sheet é uma grade
 * frames(colunas) × variantes-de-cor(linhas), célula 64. Split por linha → cada
 * cor vira um effect `play` de 64px (1 direção, N frames).
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { validate } from "./validate";
import { normalize } from "./normalize";
import { buildPixiSheet } from "./atlas";
import { anchorPoint, specFor } from "./spec";
import { PALETTE_NAME } from "./palette";
import { ASSETS_DIR } from "./manifest";

export const LIBRARY_DIR = path.join(ASSETS_DIR, "library");
export const LIB_INDEX = path.join(LIBRARY_DIR, "index.json");
const CELL = 64;

export interface LibEntry {
  id: string;
  kind: "effect";
  family: string; // nome semântico (via passe de visão); "" = a classificar
  motion?: string; // descrição curta do movimento (visão)
  color: string; // nome da cor detectada
  colorHex: string;
  path: string; // PNG relativo a assets/
  sheet: string; // Pixi JSON relativo a assets/
  size: number;
  frames: number;
  fps: number;
  colors: number;
  source: string; // arquivo de origem (proveniência)
  sourceSheet: string; // ex "Part 2/63"
  row: number;
  importedAt: string;
}

export interface LibIndex {
  version: number;
  palette: string;
  kind: string;
  count: number;
  byFamily: Record<string, string[]>;
  byColor: Record<string, string[]>;
  byFrames: Record<string, string[]>;
  bySource: Record<string, string[]>;
  entries: LibEntry[];
}

// ── nomes de cor p/ classificação (hue amplo) ──────────────────────────────
const NAMED: [string, number, number, number][] = [
  ["red", 200, 45, 45],
  ["orange", 232, 120, 32],
  ["yellow", 235, 210, 60],
  ["green", 70, 180, 70],
  ["teal", 40, 180, 160],
  ["cyan", 70, 195, 225],
  ["blue", 60, 110, 210],
  ["navy", 40, 55, 130],
  ["purple", 150, 70, 200],
  ["magenta", 210, 70, 180],
  ["pink", 235, 135, 190],
  ["brown", 140, 90, 52],
  ["grey", 150, 150, 150],
  ["white", 235, 235, 235],
  ["black", 40, 40, 40],
];

function nearestColorName(r: number, g: number, b: number): string {
  let best = NAMED[0][0];
  let bd = Infinity;
  for (const [name, nr, ng, nb] of NAMED) {
    const d = (r - nr) ** 2 + (g - ng) ** 2 + (b - nb) ** 2;
    if (d < bd) {
      bd = d;
      best = name;
    }
  }
  return best;
}

const hex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");

/** cor dominante de um strip: média ponderada dos pixels opacos mais saturados. */
async function dominantColor(file: string): Promise<{ name: string; hex: string; empty: boolean }> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let R = 0,
    G = 0,
    B = 0,
    W = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 200) continue;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    const sat = max - min; // pixels saturados definem a "cor" do efeito
    const w = 1 + sat;
    R += r * w;
    G += g * w;
    B += b * w;
    W += w;
  }
  if (W === 0) return { name: "empty", hex: "#000000", empty: true };
  const r = Math.round(R / W),
    g = Math.round(G / W),
    b = Math.round(B / W);
  return { name: nearestColorName(r, g, b), hex: hex(r, g, b), empty: false };
}

async function stripFullyTransparent(file: string): Promise<boolean> {
  const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return false;
  return true;
}

export async function readIndex(): Promise<LibIndex> {
  try {
    return JSON.parse(await fs.readFile(LIB_INDEX, "utf8")) as LibIndex;
  } catch {
    return {
      version: 1,
      palette: PALETTE_NAME,
      kind: "effect",
      count: 0,
      byFamily: {},
      byColor: {},
      byFrames: {},
      bySource: {},
      entries: [],
    };
  }
}

function rebuildFacets(idx: LibIndex): void {
  idx.byFamily = {};
  idx.byColor = {};
  idx.byFrames = {};
  idx.bySource = {};
  for (const e of idx.entries) {
    if (e.family) (idx.byFamily[e.family] ??= []).push(e.id);
    (idx.byColor[e.color] ??= []).push(e.id);
    (idx.byFrames[String(e.frames)] ??= []).push(e.id);
    (idx.bySource[e.sourceSheet.split("/")[0]] ??= []).push(e.id);
  }
  idx.count = idx.entries.length;
}

/**
 * Aplica classificação semântica (do passe de visão) ao índice: mapeia por
 * sourceSheet → family/motion. Todas as 9 linhas-cor de um sheet herdam a família.
 */
export async function applyFamilies(
  items: { sheet: string; family: string; motion?: string }[],
  log?: (m: string) => void,
): Promise<{ updated: number; sheets: number }> {
  const idx = await readIndex();
  const bySheet = new Map(items.map((i) => [i.sheet, i] as const));
  let updated = 0;
  for (const e of idx.entries) {
    const m = bySheet.get(e.sourceSheet);
    if (!m) continue;
    e.family = m.family;
    if (m.motion) e.motion = m.motion;
    updated++;
  }
  await writeIndex(idx);
  log?.(`classificação aplicada: ${updated} effects de ${bySheet.size} sheets`);
  return { updated, sheets: bySheet.size };
}

async function writeIndex(idx: LibIndex): Promise<void> {
  idx.entries.sort((a, b) => a.id.localeCompare(b.id));
  rebuildFacets(idx);
  await fs.mkdir(LIBRARY_DIR, { recursive: true });
  await fs.writeFile(LIB_INDEX, JSON.stringify(idx, null, 2) + "\n", "utf8");
}

export interface ImportResult {
  imported: LibEntry[];
  skipped: { file: string; row?: number; reason: string }[];
}

/**
 * Importa UM sheet de efeitos (grade frames×cores, célula 64) → N effects `play`.
 * nowIso: timestamp injetado (scripts não têm Date.now()).
 */
export async function importEffectSheet(
  file: string,
  o: { srcRoot: string; snap?: boolean; family?: string; nowIso: string; log?: (m: string) => void },
): Promise<ImportResult> {
  const log = o.log ?? (() => {});
  const spec = specFor("effect");
  const anim = "play";
  const meta = await sharp(file).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const rel = path.relative(o.srcRoot, file).replace(/\\/g, "/");
  const sourceSheet = rel.replace(/\.png$/i, "");
  const partSlug = (sourceSheet.split("/")[0] || "part").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const num = path.basename(file).replace(/\.png$/i, "");

  if (w % CELL !== 0 || h % CELL !== 0)
    return { imported: [], skipped: [{ file: rel, reason: `${w}×${h} não é grade de ${CELL}px` }] };

  const cols = w / CELL;
  const rows = h / CELL;
  const tmpDir = path.join(LIBRARY_DIR, "_tmp");
  await fs.mkdir(tmpDir, { recursive: true });

  const imported: LibEntry[] = [];
  const skipped: ImportResult["skipped"] = [];

  for (let r = 0; r < rows; r++) {
    const strip = path.join(tmpDir, `${partSlug}_${num}_r${r}.png`);
    await sharp(file)
      .extract({ left: 0, top: r * CELL, width: w, height: CELL })
      .png()
      .toFile(strip);

    if (await stripFullyTransparent(strip)) continue; // linha vazia

    const dom = await dominantColor(strip);
    const color = dom.empty ? `row${r}` : dom.name;
    // row no id garante unicidade (2 linhas podem cair no mesmo nome de cor);
    // a cor fica como metadado pro facet byColor. slug = base do arquivo.
    const slug = `${partSlug}_${num}_r${r}_${color}`;
    const id = `fx/${slug}`;

    // valida ENTRADA (estrutural) — effect play, célula 64
    const pre = await validate(strip, { type: "effect", anim, frameSize: CELL });
    const structural = pre.violations.filter((x) => x.rule !== "colors" && x.rule !== "antialiasing");
    if (structural.length) {
      skipped.push({ file: rel, row: r, reason: structural.map((s) => s.rule).join(",") });
      continue;
    }

    // normaliza → biblioteca
    const outRel = `library/effects/${slug}.png`;
    const outPath = path.join(ASSETS_DIR, outRel);
    await normalize(strip, outPath, { clean: true, snap: o.snap !== false });

    // re-valida SAÍDA (tudo)
    const post = await validate(outPath, { type: "effect", anim, frameSize: CELL });
    if (!post.ok) {
      skipped.push({ file: rel, row: r, reason: "saída:" + post.violations.map((v) => v.rule).join(",") });
      continue;
    }

    const animRule = spec.animations.find((a) => a.name === anim)!;
    const anchor = anchorPoint(spec.anchor);
    const sheet = buildPixiSheet({
      image: path.basename(outRel),
      anim,
      frameW: CELL,
      frameH: CELL,
      frames: post.info.frames!,
      directions: 1,
      anchor,
      fps: animRule.fps,
    });
    const sheetRel = `library/effects/${slug}.json`;
    await fs.writeFile(path.join(ASSETS_DIR, sheetRel), JSON.stringify(sheet, null, 2) + "\n", "utf8");

    imported.push({
      id,
      kind: "effect",
      family: o.family ?? "",
      color,
      colorHex: dom.hex,
      path: outRel,
      sheet: sheetRel,
      size: CELL,
      frames: post.info.frames!,
      fps: animRule.fps,
      colors: post.info.colors,
      source: file,
      sourceSheet,
      row: r,
      importedAt: o.nowIso,
    });
  }

  log(`${rel}: ${cols}f×${rows}lin → ${imported.length} effects${skipped.length ? ` (${skipped.length} pulados)` : ""}`);
  return { imported, skipped };
}

async function walkPngs(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkPngs(full)));
    else if (e.name.toLowerCase().endsWith(".png")) out.push(full);
  }
  return out;
}

/** Importa um diretório inteiro de sheets de efeito → biblioteca + índice. */
export async function importEffectDir(
  dir: string,
  o: { snap?: boolean; nowIso: string; log?: (m: string) => void },
): Promise<{ imported: number; skipped: number; entries: LibEntry[] }> {
  const log = o.log ?? (() => {});
  const files = (await walkPngs(dir)).sort();
  const idx = await readIndex();
  const byId = new Map(idx.entries.map((e) => [e.id, e] as const));
  let skipped = 0;
  const fresh: LibEntry[] = [];
  for (const f of files) {
    const res = await importEffectSheet(f, { srcRoot: dir, snap: o.snap, nowIso: o.nowIso, log });
    skipped += res.skipped.length;
    for (const e of res.imported) {
      byId.set(e.id, e); // upsert por id (re-import atualiza)
      fresh.push(e);
    }
  }
  idx.entries = [...byId.values()];
  await writeIndex(idx);
  // limpa temporários
  await fs.rm(path.join(LIBRARY_DIR, "_tmp"), { recursive: true, force: true }).catch(() => {});
  log(`\nbiblioteca: ${idx.entries.length} effects no total · ${fresh.length} novos/atualizados · ${skipped} linhas puladas`);
  return { imported: fresh.length, skipped, entries: idx.entries };
}
