/**
 * PIPELINE DE ARTE — nossa lógica idea→sprite. NÃO é copiado do Wraithfall;
 * é construído sobre o que TESTAMOS do Pixellab (ver pixellab.ts) e a spec da
 * Forja. O fluxo:
 *
 *   brief (ideia)  →  gera 8d PRO (master ~112px)  →  extrai as 4 cardeais
 *   →  downscale nearest → size (64)  →  [idle: 1f] / [walk·attack: anima N frames]
 *   →  monta o spritesheet grid (colunas=frames, linhas=direções S→N→E→W)
 *   →  emite PNG em assets/_incoming/  →  (a Forja ingere/valida/registra)
 *
 * É RESUMÍVEL: masters e frames ficam em assets/_work/<id>/. Re-rodar pula o que
 * já existe no disco (não queima geração à toa se a rede cair no meio).
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createCharacter8dPro, animateV3, pollJob, extractImages } from "./pixellab";
import { ASSETS_DIR } from "./manifest";
import { DIRECTION_ORDER } from "./spec";

/** style-prompt fixo — trava o look (dark high-fantasy, top-down, legível).
 *  Genérico de propósito: nunca imitar IP específico (só "estilo", nunca a arte). */
export const STYLE =
  "classic high-fantasy pixel art, top-down RPG sprite, clean readable silhouette, " +
  "simple flat shading, dark fantasy medieval, muted earthy palette, no anti-aliasing";

export type AnimName = "idle" | "walk" | "attack";

export interface Brief {
  /** id do asset no manifesto (ex: "knight", "greenfields/cave-rat") */
  id: string;
  /** descrição do sujeito (o STYLE é anexado automaticamente) */
  subject: string;
  /** tamanho-alvo do frame (character = 64) */
  size: number;
  /** vista (default "low top-down") */
  view?: string;
  /** quais animações produzir */
  anims: AnimName[];
}

/** frames por direção que pedimos ao animador. animate-v3 exige frame_count≥4
 *  e retorna N+1 frames → pegamos os N primeiros. */
const ANIM_FRAMES: Record<Exclude<AnimName, "idle">, number> = { walk: 4, attack: 4 };

export interface SheetOut {
  anim: AnimName;
  file: string;
  frames: number;
  directions: number;
  masterPx: number;
}

type Log = (m: string) => void;

async function exists(f: string): Promise<boolean> {
  return !!(await fs.stat(f).catch(() => null));
}

async function saveB64(file: string, b64: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(b64, "base64"));
}

/** downscale limpo pro grid: nearest-neighbor, dimensão exata (fill, nunca crop). */
async function downscale(input: string | Buffer, size: number): Promise<Buffer> {
  return sharp(input).resize(size, size, { kernel: "nearest", fit: "fill" }).png().toBuffer();
}

/**
 * Remove fundo por FLOOD-FILL a partir das bordas + downscale. animate-with-text-v3
 * renderiza sobre fundo chapado OPACO (cinza ~128) — mas o sprite pode ter a MESMA
 * cor internamente (armadura cinza). Flood-fill só apaga o fundo CONECTADO às bordas,
 * preservando pixels internos daquela cor. Depois downscale nearest → size.
 */
async function keyDownscale(file: string, size: number): Promise<Buffer> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const bg = [data[0], data[1], data[2]]; // canto = cor de fundo
  const tol = 14;
  const match = (i: number) =>
    Math.abs(data[i] - bg[0]) <= tol && Math.abs(data[i + 1] - bg[1]) <= tol && Math.abs(data[i + 2] - bg[2]) <= tol;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    seen[p] = 1;
    if (match(p * 4)) stack.push(p);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop()!;
    data[p * 4 + 3] = 0; // transparente
    const x = p % w;
    const y = (p / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return sharp(Buffer.from(data), { raw: { width: w, height: h, channels: 4 } })
    .resize(size, size, { kernel: "nearest", fit: "fill" })
    .png()
    .toBuffer();
}

/** monta um grid: linhas = direções (S→N→E→W), colunas = frames. Canvas transparente. */
async function composeGrid(file: string, rows: Buffer[][], size: number): Promise<void> {
  const cols = Math.max(...rows.map((r) => r.length));
  const W = cols * size;
  const H = rows.length * size;
  const composite: { input: Buffer; left: number; top: number }[] = [];
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < rows[r].length; c++)
      composite.push({ input: rows[r][c], left: c * size, top: r * size });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composite)
    .png()
    .toFile(file);
}

async function listFrames(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir))
      .filter((f) => f.endsWith(".png"))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Executa o pipeline pra um brief. Retorna os spritesheets emitidos em
 * assets/_incoming/ (prontos pra Forja ingerir). Resumível via workRoot.
 */
export async function generate(
  brief: Brief,
  opts: { workRoot?: string; log?: Log } = {},
): Promise<SheetOut[]> {
  const log = opts.log ?? console.log;
  const workRoot = opts.workRoot ?? path.join(ASSETS_DIR, "_work");
  const work = path.join(workRoot, brief.id.replace(/[\\/]/g, "__"));
  const masterDir = path.join(work, "master");
  const description = `${brief.subject}, ${STYLE}`;
  const cardinals = [...DIRECTION_ORDER]; // south, north, east, west

  // ── 1) estático 8d PRO (resumível) ──────────────────────────────────────
  const master: Record<string, string> = {};
  const cached = await Promise.all(
    cardinals.map(async (d) => {
      const f = path.join(masterDir, `${d}.png`);
      return (await exists(f)) ? f : null;
    }),
  );
  let masterPx = 0;
  if (cached.every(Boolean)) {
    cardinals.forEach((d, i) => (master[d] = cached[i]!));
    masterPx = (await sharp(cached[0]!).metadata()).width ?? 0;
    log(`static: reusando masters (${masterPx}px) em ${path.relative(ASSETS_DIR, masterDir)}`);
  } else {
    log(`static: gerando 8d PRO (req ${brief.size}px, PRO entrega ~1.75×)…`);
    const { jobId } = await createCharacter8dPro({
      description,
      size: brief.size,
      view: brief.view,
    });
    log(`  job ${jobId} — pollando (~2min)…`);
    const job = await pollJob(jobId, { intervalMs: 8000, maxTries: 90 });
    const imgs = extractImages(job);
    masterPx = imgs[0]?.width ?? 0;
    log(`  ok: ${imgs.length} dir @ ${masterPx}px · ${job.usage?.generations ?? "?"} gen`);
    for (const im of imgs) {
      const f = path.join(masterDir, `${im.dir}.png`);
      await saveB64(f, im.b64);
      if (cardinals.includes(im.dir as (typeof cardinals)[number])) master[im.dir] = f;
    }
  }
  for (const d of cardinals)
    if (!master[d]) throw new Error(`master faltando pra direção "${d}" — 8d incompleto`);

  // ── 2) por animação ─────────────────────────────────────────────────────
  const out: SheetOut[] = [];
  for (const anim of brief.anims) {
    if (anim === "idle") {
      // 1 frame/direção = o estático downscaled. grid 1col × 4linhas.
      const rows = await Promise.all(cardinals.map(async (d) => [await downscale(master[d], brief.size)]));
      const file = path.join(ASSETS_DIR, "_incoming", `${brief.id}.idle.png`);
      await composeGrid(file, rows, brief.size);
      out.push({ anim, file, frames: 1, directions: 4, masterPx });
      log(`idle: montado (1f × 4dir) → ${path.relative(ASSETS_DIR, file)}`);
      continue;
    }

    const n = ANIM_FRAMES[anim];
    const rows: Buffer[][] = [];
    for (const d of cardinals) {
      const frameDir = path.join(work, anim, d);
      let frames = await listFrames(frameDir);
      if (frames.length < n) {
        log(`${anim}/${d}: animando (${n}f) a partir do master…`);
        const first = (await fs.readFile(master[d])).toString("base64");
        // retry a nível de JOB: o servidor do Pixellab dá falhas transientes
        // ("Generation failed", OOM, "can't start new thread"). Re-dispara o job.
        let imgs: ReturnType<typeof extractImages> = [];
        const tries = 4;
        for (let t = 0; t < tries; t++) {
          try {
            const { jobId } = await animateV3({ firstFrameB64: first, action: anim, frameCount: n });
            const job = await pollJob(jobId, { intervalMs: 6000, maxTries: 90 });
            imgs = extractImages(job);
            break;
          } catch (e) {
            if (t === tries - 1) throw e;
            log(`  ${anim}/${d}: job falhou (${(e as Error).message.slice(0, 60)}…) — retry ${t + 1}/${tries - 1} em 20s`);
            await new Promise((r) => setTimeout(r, 20000));
          }
        }
        frames = [];
        for (let i = 0; i < imgs.length; i++) {
          const f = path.join(frameDir, `f${String(i).padStart(2, "0")}.png`);
          await saveB64(f, imgs[i].b64);
          frames.push(f);
        }
        log(`  ${anim}/${d}: ${imgs.length} frames @ ${imgs[0]?.width}px`);
      } else {
        log(`${anim}/${d}: reusando ${frames.length} frames`);
      }
      // frames de animação vêm com fundo opaco → flood-key + downscale
      const picked = frames.slice(0, n);
      rows.push(await Promise.all(picked.map((f) => keyDownscale(f, brief.size))));
    }
    const file = path.join(ASSETS_DIR, "_incoming", `${brief.id}.${anim}.png`);
    await composeGrid(file, rows, brief.size);
    out.push({ anim, file, frames: n, directions: 4, masterPx });
    log(`${anim}: montado (${n}f × 4dir) → ${path.relative(ASSETS_DIR, file)}`);
  }
  return out;
}
