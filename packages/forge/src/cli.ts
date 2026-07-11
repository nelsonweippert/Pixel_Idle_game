/**
 * CLI da Forja. Uso:
 *   forge spec
 *   forge validate <arquivo> --type character [--anim walk]
 *   forge ingest   <arquivo> --type creature --id greenfields/cave-rat [--anim walk] [--snap] [--to 48]
 *   forge list
 *
 * Regra de ouro: ingest SEMPRE valida antes. Asset reprovado não entra.
 */

import path from "node:path";
import { ART_SPEC, specFor, type AssetType } from "./spec";
import { PALETTE_NAME, RESURRECT_64 } from "./palette";
import { validate, type ValidateResult } from "./validate";
import { normalize } from "./normalize";
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
    ? `${r.info.width}×${r.info.height}  ${C.dim(`${r.info.frames}f × ${r.info.directions}dir`)}`
    : `${r.info.width}×${r.info.height}`;
  const tag = `${r.type}${r.anim ? "/" + r.anim : ""}`;
  if (r.ok) {
    console.log(`${C.green("✔ VÁLIDO")}  ${C.bold(tag)}  ${geo}  ${C.dim(r.info.colors + " cores")}`);
  } else {
    console.log(`${C.red("✘ REPROVADO")}  ${C.bold(tag)}  ${geo}  ${C.dim(r.info.colors + " cores")}`);
    for (const v of r.violations) console.log(`   ${C.red("•")} ${C.gold(v.rule)}: ${v.detail}`);
  }
  console.log(C.dim(`   ${file}`));
}

async function cmdSpec() {
  console.log(C.bold(`\n  Forja — ART_SPEC  ${C.dim("(guardião de arte)")}`));
  console.log(`  paleta-mestra: ${C.gold(PALETTE_NAME)} (${RESURRECT_64.length} cores)\n`);
  for (const t of Object.keys(ART_SPEC) as AssetType[]) {
    const s = ART_SPEC[t];
    const sizes = s.sizes.map((z) => `${z.w}×${z.h}`).join(", ");
    console.log(`  ${C.bold(t.padEnd(10))} ${sizes}  ${C.dim("≤" + s.maxColors + " cores · " + s.anchor)}`);
    if (s.animations.length) {
      for (const a of s.animations) {
        console.log(
          C.dim(
            `             ↳ ${a.name}: ${a.minFrames}–${a.maxFrames}f × ${a.directions}dir @ ${a.fps}fps${
              a.optional ? " (opcional)" : ""
            }`,
          ),
        );
      }
    }
    console.log(C.dim(`             ${s.note}`));
  }
  console.log("");
}

async function cmdValidate(pos: string[], flags: Record<string, string | boolean>) {
  const file = pos[0];
  const type = flags.type as AssetType;
  if (!file || !type) {
    console.error("uso: forge validate <arquivo> --type <tipo> [--anim <anim>]");
    process.exit(2);
  }
  specFor(type); // valida o tipo
  const r = await validate(file, { type, anim: flags.anim as string | undefined });
  printResult(file, r);
  process.exit(r.ok ? 0 : 1);
}

async function cmdIngest(pos: string[], flags: Record<string, string | boolean>) {
  const file = pos[0];
  const type = flags.type as AssetType;
  const id = flags.id as string;
  if (!file || !type || !id) {
    console.error("uso: forge ingest <arquivo> --type <tipo> --id <id> [--anim <anim>] [--snap] [--to <px>]");
    process.exit(2);
  }
  const anim = flags.anim as string | undefined;
  const spec = specFor(type);

  // 1) valida a ENTRADA — reprovou, não entra
  const pre = await validate(file, { type, anim });
  if (!pre.ok) {
    console.log(C.red("\n  ingest bloqueado — asset reprovado na entrada:\n"));
    printResult(file, pre);
    process.exit(1);
  }

  // 2) normaliza
  const rel = anim ? `sprites/${id}.${anim}.png` : `sprites/${id}.png`;
  const outPath = path.join(ASSETS_DIR, rel);
  let targetW: number | undefined;
  let targetH: number | undefined;
  if (flags.to) {
    const s = Number(flags.to);
    // resize por frame não é trivial em folha; --to só p/ sprite estático
    if (!anim) {
      targetW = s;
      targetH = s;
    }
  }
  await normalize(file, outPath, { targetW, targetH, snap: !!flags.snap });

  // 3) re-valida a SAÍDA (garante que a normalização não quebrou nada)
  const post = await validate(outPath, { type, anim });
  if (!post.ok) {
    console.log(C.red("\n  normalização gerou saída inválida:\n"));
    printResult(outPath, post);
    process.exit(1);
  }

  // 4) registra no manifesto (o portão)
  await register({
    id,
    type,
    anim,
    path: rel,
    width: post.info.width,
    height: post.info.height,
    frames: post.info.frames,
    directions: post.info.directions,
    colors: post.info.colors,
    source: file,
    validatedAt: new Date().toISOString(),
  });

  console.log(C.green("\n  ✔ ingerido e registrado no manifesto:"));
  printResult(outPath, post);
  console.log(C.dim(`   id: ${id}${flags.snap ? " · snap:master" : ""}\n`));
}

async function cmdList() {
  const m = await readManifest();
  console.log(C.bold(`\n  manifesto — ${m.assets.length} asset(s) · paleta ${C.gold(m.palette)}\n`));
  if (!m.assets.length) console.log(C.dim("  (vazio — nada ingerido ainda)\n"));
  for (const a of m.assets) {
    const g = a.frames ? `${a.width}×${a.height} ${C.dim(`${a.frames}f×${a.directions}d`)}` : `${a.width}×${a.height}`;
    console.log(`  ${C.gold(a.id)}  ${C.dim(a.type + (a.anim ? "/" + a.anim : ""))}  ${g}`);
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
      console.log("ex: forge validate hero.png --type character --anim walk");
      process.exit(cmd ? 2 : 0);
  }
}

main().catch((e) => {
  console.error(C.red("erro: ") + (e as Error).message);
  process.exit(1);
});
