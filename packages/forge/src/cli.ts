/**
 * CLI da Forja. Uso:
 *   forge spec
 *   forge validate <arquivo> --type character [--anim walk] [--size 48]
 *   forge ingest   <arquivo> --type creature  --id greenfields/cave-rat --anim walk --size 48 [--snap] [--dither] [--no-clean]
 *   forge list
 *
 * Regra de ouro: ingest SEMPRE valida (entrada e saída). Reprovou, não entra.
 * Saída de asset animado = PNG + spritesheet JSON pronto pro PixiJS.
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { anchorPoint, ART_SPEC, DIRECTION_ORDER, QUALITY, specFor, type AssetType } from "./spec";
import { PALETTE_NAME, RESURRECT_64 } from "./palette";
import { validate, type ValidateResult } from "./validate";
import { normalize } from "./normalize";
import { buildPixiSheet } from "./atlas";
import { ASSETS_DIR, readManifest, register } from "./manifest";
import { generate, type Brief, type AnimName } from "./generate";
import { importEffectDir, readIndex, applyFamilies } from "./library";
import { buildCatalog, readCatalog, findPacks, type FindQuery } from "./packs";
import { promote } from "./promote";
import { exportScene } from "./tmx";

const C = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  gold: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function parse(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else pos.push(a);
  }
  return { flags, pos };
}

function printResult(file: string, r: ValidateResult) {
  const geo = r.info.frames
    ? `${r.info.width}×${r.info.height} ${C.dim(`${r.info.frames}f×${r.info.directions}d @${r.info.frameW}px`)}`
    : `${r.info.width}×${r.info.height}`;
  const tag = `${r.type}${r.anim ? "/" + r.anim : ""}`;
  const q = C.dim(
    `${r.info.colors}c · AA ${(r.info.partialAlpha * 100).toFixed(1)}% · scale ${r.info.pixelScale}×`,
  );
  if (r.ok) console.log(`${C.green("✔ VÁLIDO")}  ${C.bold(tag)}  ${geo}  ${q}`);
  else {
    console.log(`${C.red("✘ REPROVADO")}  ${C.bold(tag)}  ${geo}  ${q}`);
    for (const v of r.violations) console.log(`   ${C.red("•")} ${C.gold(v.rule)}: ${v.detail}`);
  }
  console.log(C.dim(`   ${file}`));
}

async function cmdSpec() {
  console.log(C.bold(`\n  Forja — ART_SPEC  ${C.dim("(guardião de arte)")}`));
  console.log(`  paleta-mestra: ${C.gold(PALETTE_NAME)} (${RESURRECT_64.length} cores)`);
  console.log(
    C.dim(
      `  qualidade: AA ≤${(QUALITY.maxPartialAlphaRatio * 100).toFixed(1)}% · scale 1× obrigatório · direções ${DIRECTION_ORDER.join("→")}\n`,
    ),
  );
  for (const t of Object.keys(ART_SPEC) as AssetType[]) {
    const s = ART_SPEC[t];
    const sizes = s.sizes.map((z) => `${z.w}×${z.h}`).join(", ");
    console.log(`  ${C.bold(t.padEnd(10))} ${sizes}  ${C.dim("≤" + s.maxColors + " cores · " + s.anchor)}`);
    for (const a of s.animations)
      console.log(
        C.dim(
          `             ↳ ${a.name}: ${a.minFrames}–${a.maxFrames}f × ${a.directions}dir @ ${a.fps}fps${a.optional ? " (opc)" : ""}`,
        ),
      );
    console.log(C.dim(`             ${s.note}`));
  }
  console.log("");
}

async function cmdValidate(pos: string[], flags: Record<string, string | boolean>) {
  const file = pos[0];
  const type = flags.type as AssetType;
  if (!file || !type) {
    console.error("uso: forge validate <arquivo> --type <tipo> [--anim <anim>] [--size <px>]");
    process.exit(2);
  }
  specFor(type);
  const r = await validate(file, {
    type,
    anim: flags.anim as string | undefined,
    frameSize: flags.size ? Number(flags.size) : undefined,
  });
  printResult(file, r);
  process.exit(r.ok ? 0 : 1);
}

interface IngestOpts {
  file: string;
  type: AssetType;
  id: string;
  anim?: string;
  frameSize?: number;
  clean?: boolean;
  snap?: boolean;
  dither?: boolean;
  targetStatic?: number;
}

/** regras que a normalização CONSERTA (clean tira AA, snap reduz cores). Não
 *  bloqueiam a ENTRADA — são garantidas na SAÍDA. Todo o resto é estrutural
 *  (geometria/transparência/upscale) e normalize não conserta → gate de entrada. */
const NORMALIZABLE = new Set(["colors", "antialiasing"]);

/** NÚCLEO do ingest (o portão): valida entrada (estrutural) → normaliza →
 *  re-valida saída (tudo) → gera sheet Pixi → registra. Usado pelo CLI `ingest`
 *  e pelo `generate`. Retorna false (sem lançar) se reprovar. */
async function ingestOne(o: IngestOpts): Promise<boolean> {
  const { file, type, id, anim } = o;
  const frameSize = o.frameSize;
  const spec = specFor(type);

  // 1) valida a ENTRADA — só o estrutural (o que normalize NÃO conserta).
  //    cores/AA são sujeira esperada de arte crua (Pixellab) → a Forja limpa.
  const pre = await validate(file, { type, anim, frameSize });
  const structural = pre.violations.filter((x) => !NORMALIZABLE.has(x.rule));
  if (structural.length) {
    console.log(C.red("\n  ingest bloqueado — falha ESTRUTURAL na entrada (normalize não conserta):\n"));
    printResult(file, { ...pre, ok: false, violations: structural });
    return false;
  }

  // 2) normaliza (clean ligado por padrão)
  const rel = anim ? `sprites/${id}.${anim}.png` : `sprites/${id}.png`;
  const outPath = path.join(ASSETS_DIR, rel);
  await normalize(file, outPath, {
    targetW: o.targetStatic,
    targetH: o.targetStatic,
    clean: o.clean !== false,
    snap: !!o.snap,
    dither: !!o.dither,
  });

  // 3) re-valida a SAÍDA
  const post = await validate(outPath, { type, anim, frameSize });
  if (!post.ok) {
    console.log(C.red("\n  normalização gerou saída inválida:\n"));
    printResult(outPath, post);
    return false;
  }

  // 4) asset animado → gera spritesheet JSON pronto pro Pixi
  let sheetRel: string | undefined;
  let fps: number | undefined;
  const anchor = anchorPoint(spec.anchor);
  if (anim && post.info.frames && post.info.frameW) {
    const animRule = spec.animations.find((a) => a.name === anim)!;
    fps = animRule.fps;
    const sheet = buildPixiSheet({
      image: path.basename(rel),
      anim,
      frameW: post.info.frameW,
      frameH: post.info.frameH!,
      frames: post.info.frames,
      directions: post.info.directions!,
      anchor,
      fps,
    });
    sheetRel = `sprites/${id}.${anim}.json`;
    await fs.writeFile(path.join(ASSETS_DIR, sheetRel), JSON.stringify(sheet, null, 2) + "\n", "utf8");
  }

  // 5) registra no manifesto (o portão)
  await register({
    id,
    type,
    anim,
    path: rel,
    sheet: sheetRel,
    width: post.info.width,
    height: post.info.height,
    frameW: post.info.frameW,
    frameH: post.info.frameH,
    frames: post.info.frames,
    directions: post.info.directions,
    fps,
    anchor,
    colors: post.info.colors,
    pixelScale: post.info.pixelScale,
    partialAlpha: Number(post.info.partialAlpha.toFixed(4)),
    source: file,
    validatedAt: new Date().toISOString(),
  });

  console.log(C.green("\n  ✔ ingerido e registrado no manifesto:"));
  printResult(outPath, post);
  console.log(
    C.dim(`   id: ${id}${sheetRel ? " · sheet: " + sheetRel : ""}${o.snap ? " · snap:master" : ""}\n`),
  );
  return true;
}

async function cmdIngest(pos: string[], flags: Record<string, string | boolean>) {
  const file = pos[0];
  const type = flags.type as AssetType;
  const id = flags.id as string;
  if (!file || !type || !id) {
    console.error(
      "uso: forge ingest <arquivo> --type <tipo> --id <id> [--anim <a>] [--size <px>] [--snap] [--dither] [--no-clean]",
    );
    process.exit(2);
  }
  const ok = await ingestOne({
    file,
    type,
    id,
    anim: flags.anim as string | undefined,
    frameSize: flags.size ? Number(flags.size) : undefined,
    clean: !flags["no-clean"],
    snap: !!flags.snap,
    dither: !!flags.dither,
    targetStatic: !flags.anim && flags.to ? Number(flags.to) : undefined,
  });
  process.exit(ok ? 0 : 1);
}

/**
 * `forge generate` — o fluxo idea→asset completo. Gera pelo Pixellab, monta os
 * spritesheets e (por padrão) ingere cada um pela Forja. É o único comando que
 * fala com a API; tudo mais é offline.
 */
async function cmdGenerate(pos: string[], flags: Record<string, string | boolean>) {
  const id = (flags.id as string) ?? pos[0];
  const subject = flags.subject as string;
  if (!id || !subject) {
    console.error(
      'uso: forge generate --id knight --subject "knight in plate armor..." [--size 64] [--anims idle,walk,attack] [--type character] [--snap] [--no-ingest]',
    );
    process.exit(2);
  }
  const type = (flags.type as AssetType) ?? "character";
  const spec = specFor(type);
  const size = flags.size ? Number(flags.size) : spec.sizes[0].w;
  const anims = ((flags.anims as string) ?? "idle,walk,attack")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as AnimName[];

  const dirs = flags.dirs ? String(flags.dirs).split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const engine = flags.engine === "8d" ? "8d" : undefined; // default pixflux
  const brief: Brief = { id, subject, size, view: flags.view as string | undefined, anims, dirs, engine };
  console.log(C.bold(`\n  Forja · generate  ${C.gold(id)}  ${C.dim(type + " · " + size + "px · " + anims.join("+"))}`));
  console.log(C.dim(`  "${subject}"\n`));

  const sheets = await generate(brief, { log: (m) => console.log(C.dim("  " + m)) });

  if (flags["no-ingest"]) {
    console.log(C.gold("\n  --no-ingest: sheets gerados (não ingeridos):"));
    for (const s of sheets) console.log(C.dim(`   ${path.relative(ASSETS_DIR, s.file)}`));
    console.log("");
    return;
  }

  // ingere cada sheet pela Forja (o portão)
  let ingested = 0;
  for (const s of sheets) {
    const ok = await ingestOne({
      file: s.file,
      type,
      id,
      anim: s.anim,
      frameSize: size,
      clean: !flags["no-clean"],
      snap: !flags["no-snap"], // generate snapa por padrão: arte Pixellab sempre precisa
      dither: !!flags.dither,
    });
    if (ok) ingested++;
  }
  console.log(
    ingested === sheets.length
      ? C.green(`  ✔ ${ingested}/${sheets.length} animações no manifesto — ${id} pronto pro jogo.\n`)
      : C.gold(`  ⚠ ${ingested}/${sheets.length} passaram na Forja (ver reprovações acima).\n`),
  );
}

/**
 * `forge library <dir>` — importa assets externos (efeitos) pra BIBLIOTECA
 * classificada (assets/library/). Passa cada sheet pela Forja (valida→limpa→
 * snap→re-valida→sheet Pixi) e indexa por cor/frames/fonte. NÃO entra no
 * manifesto do jogo — é pool pra usar depois.
 */
async function cmdLibrary(pos: string[], flags: Record<string, string | boolean>) {
  const sub = pos[0];
  if (sub === "list") {
    const idx = await readIndex();
    const fam = Object.entries(idx.byFamily ?? {}).sort((a, b) => b[1].length - a[1].length);
    console.log(C.bold(`\n  biblioteca — ${idx.count} ${idx.kind}(s) · paleta ${C.gold(idx.palette)}`));
    if (fam.length)
      console.log(C.dim(`  famílias: ${fam.map(([f, ids]) => `${f}(${ids.length})`).join(" · ")}`));
    console.log(C.dim(`  cores: ${Object.entries(idx.byColor).map(([c, ids]) => `${c}(${ids.length})`).join(" · ")}`));
    console.log(C.dim(`  fontes: ${Object.entries(idx.bySource).map(([s, ids]) => `${s}(${ids.length})`).join(" · ")}\n`));
    return;
  }

  if (sub === "classify") {
    const file = pos[1];
    if (!file) {
      console.error("uso: forge library classify <arquivo.json>  (json = {items:[{sheet,family,motion}]} ou [ ... ])");
      process.exit(2);
    }
    const raw = JSON.parse(await fs.readFile(path.resolve(file), "utf8"));
    const items = Array.isArray(raw) ? raw : raw.items;
    const res = await applyFamilies(items, (m) => console.log(C.dim("  " + m)));
    console.log(C.green(`\n  ✔ ${res.updated} effects classificados de ${res.sheets} sheets\n`));
    return;
  }
  const dir = sub === "import" ? pos[1] : sub;
  if (!dir) {
    console.error('uso: forge library import <dir> [--no-snap]   |   forge library list');
    process.exit(2);
  }
  const abs = path.resolve(dir);
  console.log(C.bold(`\n  Forja · library import  ${C.dim(abs)}\n`));
  const res = await importEffectDir(abs, {
    snap: !flags["no-snap"],
    nowIso: new Date().toISOString(),
    log: (m) => console.log(C.dim("  " + m)),
  });
  console.log(
    C.green(`\n  ✔ ${res.imported} effects na biblioteca`) +
      C.dim(` · ${res.skipped} linhas puladas · índice: assets/library/index.json\n`),
  );
}

/**
 * `forge packs <catalog|stats|find>` — o FILTRO DE CLASSIFICAÇÃO do pool de packs
 * de terceiros (assets/_packs). catalog = classifica tudo; stats = panorama por
 * faceta; find = filtra pra compor mapas/cenas.
 */
async function cmdPacks(pos: string[], flags: Record<string, string | boolean>) {
  const sub = pos[0] ?? "stats";
  if (sub === "catalog") {
    const cat = await buildCatalog({ nowIso: new Date().toISOString(), log: (m) => console.log(C.dim("  " + m)) });
    printCatalogStats(cat);
    return;
  }
  const cat = await readCatalog();
  if (!cat) {
    console.error("sem catálogo — rode `forge packs catalog` primeiro.");
    process.exit(2);
  }
  if (sub === "stats") return printCatalogStats(cat);
  if (sub === "find") {
    const q: FindQuery = {
      kind: flags.kind as string | undefined,
      theme: flags.theme as string | undefined,
      perspective: flags.perspective as string | undefined,
      style: flags.style as string | undefined,
      tag: flags.tag as string | undefined,
      animated: flags.animated === true ? true : flags.animated === "false" ? false : undefined,
      usable: flags.usable === true ? true : flags.usable === "false" ? false : undefined,
    };
    const hits = findPacks(cat, q);
    const facets = Object.entries(q).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join(" · ") || "(sem filtro)";
    console.log(C.bold(`\n  packs · ${facets} → ${hits.length} resultado(s)\n`));
    for (const e of hits.slice(0, 200)) {
      const badges = C.dim(`${e.kind}/${e.theme}/${e.perspective}/${e.style}${e.animated ? "/anim" : ""}`);
      console.log(`  ${C.gold(e.slug)}  ${badges}  ${C.dim(e.sample ? e.sample.w + "×" + e.sample.h + " " + e.sample.colors + "c" : "")}`);
    }
    if (hits.length > 200) console.log(C.dim(`  … +${hits.length - 200}`));
    console.log("");
    return;
  }
  console.error("uso: forge packs <catalog|stats|find> [--kind --theme --perspective --style --tag --animated]");
  process.exit(2);
}

function printCatalogStats(cat: { count: number; animatedCount: number; usableCount: number; byKind: Record<string, string[]>; byTheme: Record<string, string[]>; byPerspective: Record<string, string[]>; byStyle: Record<string, string[]> }) {
  const line = (m: Record<string, string[]>) => Object.entries(m).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `${k}(${v.length})`).join(" · ");
  console.log(C.bold(`\n  catálogo de packs — ${cat.count} packs · ${cat.animatedCount} animados · ${C.green(cat.usableCount + " no Padrão Knight")}`));
  console.log(C.dim(`  kind:        `) + line(cat.byKind));
  console.log(C.dim(`  theme:       `) + line(cat.byTheme));
  console.log(C.dim(`  perspective: `) + line(cat.byPerspective));
  console.log(C.dim(`  style:       `) + line(cat.byStyle));
  console.log(C.dim(`\n  filtre: forge packs find --kind creature --theme graveyard --style pixel --animated\n`));
}

async function cmdList() {
  const m = await readManifest();
  console.log(C.bold(`\n  manifesto — ${m.assets.length} asset(s) · paleta ${C.gold(m.palette)}\n`));
  if (!m.assets.length) console.log(C.dim("  (vazio — nada ingerido ainda)\n"));
  for (const a of m.assets) {
    const g = a.frames ? `${a.width}×${a.height} ${C.dim(`${a.frames}f×${a.directions}d`)}` : `${a.width}×${a.height}`;
    const sheet = a.sheet ? C.dim(" · pixi:" + path.basename(a.sheet)) : "";
    console.log(`  ${C.gold(a.id)}  ${C.dim(a.type + (a.anim ? "/" + a.anim : ""))}  ${g}${sheet}`);
  }
  console.log("");
}

async function cmdPromote(pos: string[], flags: Record<string, string | boolean>) {
  const packDir = pos[0];
  if (!packDir) {
    console.error("uso: forge promote <pack-dir> --id <id> [--level N] [--anims idle,walk,attack]");
    process.exit(2);
  }
  const id = typeof flags.id === "string" ? flags.id : "";
  if (!id) {
    console.error("faltou --id <id>");
    process.exit(2);
  }
  const level = typeof flags.level === "string" ? Number(flags.level) : undefined;
  const variant = typeof flags.variant === "string" ? flags.variant : undefined;
  const anims =
    typeof flags.anims === "string"
      ? flags.anims.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
  const results = await promote({ packDir, id, level, variant, anims, log: (m) => console.log(m) });
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} anims promovidas pra '${id}'`);
  if (ok < results.length) process.exitCode = 1;
}

/**
 * forge tmx-export <mapa.tmx> --name <cena> --out <dir> [--crop x,y,w,h]
 * Exporta um mapa COMPOSTO PELO ARTISTA (Tiled) pro formato do jogo:
 * scene.json + PNGs de tileset usados. Crop em coords normalizadas (tiles).
 * ex: forge tmx-export assets/_packs/.../Dungeon3.tmx --name crypt \
 *       --out apps/web/public/tilesets/crypt --crop 5,7,30,18
 */
async function cmdTmxExport(pos: string[], flags: Record<string, string | boolean>) {
  const tmxPath = pos[0];
  if (!tmxPath) throw new Error("uso: forge tmx-export <mapa.tmx> --name <cena> --out <dir> [--crop x,y,w,h]");
  const name = typeof flags.name === "string" ? flags.name : path.basename(tmxPath, ".tmx").toLowerCase();
  const outDir = typeof flags.out === "string" ? flags.out : path.join("apps/web/public/tilesets", name);
  let crop: { x: number; y: number; w: number; h: number } | undefined;
  if (typeof flags.crop === "string") {
    const [x, y, w, h] = flags.crop.split(",").map(Number);
    if ([x, y, w, h].some((n) => !Number.isFinite(n))) throw new Error("--crop precisa ser x,y,w,h numéricos");
    crop = { x, y, w, h };
  }
  const { doc, warnings } = await exportScene(tmxPath, { name, outDir, crop });
  for (const w of new Set(warnings)) console.log(C.gold("aviso: ") + w);
  const placements = doc.layers.reduce((s, l) => s + l.tiles.length / 3, 0);
  console.log(
    `${C.green("ok")} cena '${name}': ${doc.width}x${doc.height} tiles @${doc.tileW}px, ` +
      `${doc.layers.length} layers, ${doc.tilesets.length} tilesets, ${placements} tiles → ${outDir}`,
  );
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, pos } = parse(rest);
  switch (cmd) {
    case "spec":
      return cmdSpec();
    case "validate":
      return cmdValidate(pos, flags);
    case "ingest":
      return cmdIngest(pos, flags);
    case "generate":
      return cmdGenerate(pos, flags);
    case "library":
      return cmdLibrary(pos, flags);
    case "packs":
      return cmdPacks(pos, flags);
    case "promote":
      return cmdPromote(pos, flags);
    case "tmx-export":
      return cmdTmxExport(pos, flags);
    case "list":
      return cmdList();
    default:
      console.log("comandos: spec · validate · ingest · generate · library · packs · promote · tmx-export · list");
      console.log("ex: forge ingest hero.png --type character --id knight --anim walk --size 48");
      process.exit(cmd ? 2 : 0);
  }
}

main().catch((e) => {
  console.error(C.red("erro: ") + (e as Error).message);
  process.exit(1);
});
