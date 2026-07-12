/**
 * Testes da Forja. Gera fixtures sintéticos e verifica que cada regra pega o que
 * deve. Roda: `npm test -w @pixel-idle/forge`. (character = 64×64 desde 2026-07-11)
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, type ValidateResult } from "../src/validate";
import { normalize } from "../src/normalize";
import { buildPixiSheet } from "../src/atlas";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp");
const PAL = [
  [46, 34, 47],
  [234, 79, 54],
  [30, 188, 115],
  [77, 155, 230],
  [249, 194, 43],
];

type Draw = (set: (x: number, y: number, r: number, g: number, b: number, a?: number) => void, w: number, h: number) => void;

async function makePng(file: string, w: number, h: number, draw: Draw) {
  const buf = Buffer.alloc(w * h * 4, 0);
  const set = (x: number, y: number, r: number, g: number, b: number, a = 255) => {
    const i = (y * w + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  };
  draw(set, w, h);
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toFile(file);
}

const has = (r: ValidateResult, rule: string) => r.violations.some((v) => v.rule === rule);

let pass = 0,
  fail = 0;
const g = (s: string) => `\x1b[32m${s}\x1b[0m`;
const r = (s: string) => `\x1b[31m${s}\x1b[0m`;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ${g("✔")} ${name}`);
  } else {
    fail++;
    console.log(`  ${r("✘")} ${name}  ${r(extra)}`);
  }
}

async function main() {
  await fs.mkdir(DIR, { recursive: true });

  // ── character walk válido (64×64 × 4f × 4d = 256×256) ────────────────────
  const validWalk = path.join(DIR, "valid.walk.png");
  await makePng(validWalk, 256, 256, (set) => {
    for (let dy = 0; dy < 4; dy++)
      for (let dx = 0; dx < 4; dx++)
        for (let y = 12; y < 52; y++)
          for (let x = 16; x < 48; x++) {
            const c = PAL[(x + y) % PAL.length];
            set(dx * 64 + x, dy * 64 + y, c[0], c[1], c[2]);
          }
  });
  const rValid = await validate(validWalk, { type: "character", anim: "walk" });
  check("character/walk válido passa", rValid.ok, JSON.stringify(rValid.violations));
  check("  → detecta 4 frames × 4 dir @64px", rValid.info.frames === 4 && rValid.info.directions === 4 && rValid.info.frameW === 64);
  check("  → scale 1×, sem AA", rValid.info.pixelScale === 1 && rValid.info.partialAlpha === 0);

  // ── tamanho errado (50×50 opaco) ──────────────────────────────────────────
  const bad = path.join(DIR, "bad.png");
  await makePng(bad, 50, 50, (set, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, (x * 5) % 256, (y * 5) % 256, (x * y) % 256, 255);
  });
  const rBad = await validate(bad, { type: "character" });
  check("50×50 opaco reprova (size + colors + transparency)", has(rBad, "size") && has(rBad, "colors") && has(rBad, "transparency"));

  // ── anti-aliasing (borda alpha parcial) — 64×64 ───────────────────────────
  const aa = path.join(DIR, "aa.png");
  await makePng(aa, 64, 64, (set) => {
    for (let y = 12; y < 52; y++) for (let x = 12; x < 52; x++) {
      const c = PAL[(x + y) % PAL.length];
      set(x, y, c[0], c[1], c[2]);
    }
    for (let i = 11; i <= 52; i++) {
      set(i, 11, 234, 79, 54, 128);
      set(i, 53, 234, 79, 54, 128);
      set(11, i, 234, 79, 54, 128);
      set(53, i, 234, 79, 54, 128);
    }
  });
  const rAa = await validate(aa, { type: "character" });
  check("sprite com AA reprova (antialiasing)", has(rAa, "antialiasing"), JSON.stringify(rAa.violations));

  // ── upscale 4× (16×16 → 64×64) ────────────────────────────────────────────
  const up = path.join(DIR, "upscaled.png");
  await makePng(up, 64, 64, (set) => {
    for (let by = 0; by < 16; by++)
      for (let bx = 0; bx < 16; bx++) {
        const corner = (bx === 0 || bx === 15) && (by === 0 || by === 15);
        if (corner) continue;
        const c = PAL[(bx * 3 + by) % PAL.length];
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) set(bx * 4 + x, by * 4 + y, c[0], c[1], c[2]);
      }
  });
  const rUp = await validate(up, { type: "character" });
  check("sprite upscaled reprova (upscaled)", has(rUp, "upscaled"), `scale=${rUp.info.pixelScale}`);

  // ── ambiguidade de frame-size (creature 64×64: casa 32 e 64) ──────────────
  const amb = path.join(DIR, "amb.png");
  await makePng(amb, 64, 64, (set) => {
    for (let y = 10; y < 54; y++) for (let x = 10; x < 54; x++) {
      const c = PAL[(x + y) % PAL.length];
      set(x, y, c[0], c[1], c[2]);
    }
  });
  const rAmb = await validate(amb, { type: "creature", anim: "idle" });
  check("creature multi-size sem --size é ambíguo", has(rAmb, "anim.ambiguous"), JSON.stringify(rAmb.violations));

  // ── normalize --clean remove o AA ─────────────────────────────────────────
  const cleaned = path.join(DIR, "aa.cleaned.png");
  await normalize(aa, cleaned, { clean: true });
  const rClean = await validate(cleaned, { type: "character" });
  check("normalize --clean tira o AA", !has(rClean, "antialiasing"), `AA=${(rClean.info.partialAlpha * 100).toFixed(2)}%`);

  // ── normalize --snap (image-q, CIEDE2000) mantém válido ───────────────────
  const snapped = path.join(DIR, "valid.snapped.walk.png");
  await normalize(validWalk, snapped, { clean: true, snap: true });
  const rSnap = await validate(snapped, { type: "character", anim: "walk" });
  check("normalize --snap (image-q) mantém válido", rSnap.ok, JSON.stringify(rSnap.violations));

  // ── buildPixiSheet gera animações por direção (64px) ──────────────────────
  const sheet = buildPixiSheet({
    image: "knight.walk.png",
    anim: "walk",
    frameW: 64,
    frameH: 64,
    frames: 4,
    directions: 4,
    anchor: { x: 0.5, y: 1 },
    fps: 8,
  });
  const animKeys = Object.keys(sheet.animations);
  check(
    "spritesheet Pixi: 4 animações (S/N/E/W)",
    animKeys.length === 4 && ["south", "north", "east", "west"].every((d) => animKeys.includes(d)),
    animKeys.join(","),
  );
  check("spritesheet Pixi: 16 frames + anchor no pé + size 256", Object.keys(sheet.frames).length === 16 && sheet.frames["walk.south.0"].anchor.y === 1 && sheet.meta.size.w === 256);

  console.log(`\n  ${pass} passou · ${fail ? r(fail + " falhou") : "0 falhou"}\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(r("erro no teste: ") + (e as Error).stack);
  process.exit(1);
});
