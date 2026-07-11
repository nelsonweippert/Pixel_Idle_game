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
  const anim = flags.anim as string | undefined;
  const frameSize = flags.size ? Number(flags.size) : undefined;
  const spec = specFor(type);

  // 1) valida a ENTRADA
  const pre = await validate(file, { type, anim, frameSize });
  if (!pre.ok) {
    console.log(C.red("\n  ingest bloqueado — asset reprovado na entrada:\n"));
    printResult(file, pre);
    process.exit(1);
  }

  // 2) normaliza (clean ligado por padrão)
  const rel = anim ? `sprites/${id}.${anim}.png` : `sprites/${id}.png`;
  const outPath = path.join(ASSETS_DIR, rel);
  const targetStatic = !anim && flags.to ? Number(flags.to) : undefined;
  await normalize(file, outPath, {
    targetW: targetStatic,
    targetH: targetStatic,
    clean: !flags["no-clean"],
    snap: !!flags.snap,
    dither: !!flags.dither,
  });

  // 3) re-valida a SAÍDA
  const post = await validate(outPath, { type, anim, frameSize });
  if (!post.ok) {
    console.log(C.red("\n  normalização gerou saída inválida:\n"));
    printResult(outPath, post);
    process.exit(1);
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
    sheetRel = anim ? `sprites/${id}.${anim}.json` : undefined;
    await fs.writeFile(path.join(ASSETS_DIR, sheetRel!), JSON.stringify(sheet, null, 2) + "\n", "utf8");
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
    C.dim(
      `   id: ${id}${sheetRel ? " · sheet: " + sheetRel : ""}${flags.snap ? " · snap:master" : ""}\n`,
    ),
  );
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
    case "list":
      return cmdList();
    default:
      console.log("comandos: spec · validate · ingest · list");
      console.log("ex: forge ingest hero.png --type character --id knight --anim walk --size 48");
      process.exit(cmd ? 2 : 0);
  }
}

main().catch((e) => {
  console.error(C.red("erro: ") + (e as Error).message);
  process.exit(1);
});
