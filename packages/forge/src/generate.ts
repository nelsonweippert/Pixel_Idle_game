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
import { createCharacter8dPro, createImagePixflux, animateV3, pollJob, extractImages } from "./pixellab";
import { ASSETS_DIR } from "./manifest";
import { DIRECTION_ORDER } from "./spec";
import { loadImage, contentBounds } from "./image";

/** tamanho do master pedido ao Pixellab. PRO ignora e entrega ~1.75× (128→~196px).
 *  Pedimos GRANDE de propósito: o personagem ocupa ~metade do frame (o Pixellab
 *  centraliza com margem), então recortamos o conteúdo e reescalamos pra preencher
 *  a célula — quanto maior o master, mais detalhe real sobra no downscale. */
const MASTER_REQUEST = 128;

/** tamanho do master pixflux. Ele RESPEITA o size (32–400) e entrega detalhe real
 *  nesse tamanho — pedimos 128 (2× a célula 64) pra sobrar detalhe no downscale. */
const PIXFLUX_MASTER = 128;

/** cauda de estilo pro pixflux. O acabamento (outline/shading/detail) vai nos
 *  PARÂMETROS do endpoint; aqui só mood/paleta. */
const PIXFLUX_STYLE =
  "dark fantasy medieval RPG, vibrant saturated colors, dramatic lighting, clean readable silhouette, no anti-aliasing";

/** boost de saturação no assentamento — cores vibrantes "chamam atenção" (o snap
 *  pra Resurrect 64 + prompt tendiam a abafar). Aplicado antes do snap, puxa as
 *  cores pra entradas mais vivas da paleta. */
const SATURATION = 1.4;

/** style-prompt fixo — trava o look (dark high-fantasy, top-down, legível).
 *  Genérico de propósito: nunca imitar IP específico (só "estilo", nunca a arte). */
export const STYLE =
  "high-fantasy pixel art character, top-down orthogonal RPG sprite, bold dark outline around the silhouette, " +
  "limited palette with vibrant saturated accent colors, flat cel shading with light dithering, hard top light, " +
  "chunky readable proportions, dark fantasy medieval, clean silhouette, no anti-aliasing";

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
  /** motor de geração do estático. "pixflux" = imagem única alta fidelidade (default,
   *  padrão de qualidade novo); "8d" = create-character-with-8-directions (legado). */
  engine?: "pixflux" | "8d";
  /** direções a GERAR de fato (pixflux). As demais cardeais são replicadas da 1ª
   *  (default = só ["south"], já que a cena é south-facing; N/E/W viram cópia do sul
   *  até derivarmos direções consistentes via bitforge/rotate). "8d" ignora isto. */
  dirs?: string[];
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

/** caixa de conteúdo em FRAÇÕES do frame (robusto a variação de tamanho entre
 *  master e frames de animação). */
interface BoxFrac {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Remove o fundo por FLOOD-FILL a partir das bordas. animate-with-text-v3 renderiza
 * sobre fundo chapado OPACO (cinza ~128) — mas o sprite pode ter a MESMA cor
 * internamente (armadura). Flood-fill só apaga o fundo CONECTADO às bordas,
 * preservando pixels internos. Retorna PNG do tamanho original, fundo transparente.
 */
async function floodKeyBuffer(file: string): Promise<Buffer> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const bg = [data[0], data[1], data[2]];
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
    data[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return sharp(Buffer.from(data), { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/**
 * ASSENTA o personagem na célula: recorta a caixa de conteúdo (tira a margem do
 * Pixellab), reescala NEAREST pra preencher ~92% da altura da célula e ancora o pé
 * embaixo, centralizado. É downscale (do master grande) → detalhe real, sem borrar.
 */
interface SeatOpts {
  /** frame vem com fundo opaco (animate-v3) → flood-fill antes de assentar */
  key?: boolean;
  /** aplica o outline escuro chapado. FALSE pro pixflux (já traz outline seletivo). */
  outline?: boolean;
  /** boost de saturação (1 = neutro). Pixflux já sai vibrante → ~1.0. */
  sat?: number;
}

async function seatFrame(file: string, box: BoxFrac, cell: number, o: SeatOpts = {}): Promise<Buffer> {
  const doKey = o.key ?? false;
  const doOutline = o.outline ?? true;
  const sat = o.sat ?? SATURATION;
  const src = doKey ? await floodKeyBuffer(file) : await sharp(file).ensureAlpha().png().toBuffer();
  const meta = await sharp(src).metadata();
  const W = meta.width ?? cell;
  const H = meta.height ?? cell;
  const ex = {
    left: Math.max(0, Math.round(box.x * W)),
    top: Math.max(0, Math.round(box.y * H)),
    width: Math.round(box.w * W),
    height: Math.round(box.h * H),
  };
  ex.width = Math.max(1, Math.min(ex.width, W - ex.left));
  ex.height = Math.max(1, Math.min(ex.height, H - ex.top));
  const targetH = Math.round(cell * 0.92);
  const s = Math.min(targetH / ex.height, (cell * 0.98) / ex.width);
  const w = Math.max(1, Math.round(ex.width * s));
  const h = Math.max(1, Math.round(ex.height * s));
  const region = await sharp(src)
    .extract(ex)
    .resize(w, h, { kernel: "nearest", fit: "fill" })
    .modulate({ saturation: sat }) // cores mais vivas antes do snap
    .png()
    .toBuffer();
  const left = Math.max(0, Math.round((cell - w) / 2));
  const top = Math.max(0, cell - h - 2); // pé ~2px do fundo (folga p/ o outline)
  const cellBuf = await sharp({ create: { width: cell, height: cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: region, left, top }])
    .png()
    .toBuffer();
  return doOutline ? addOutline(cellBuf, cell) : cellBuf;
}

/**
 * Contorno escuro 1px em volta da silhueta — é o que dá o "pop" da arte estilo
 * Tibia/idle premium (o sprite destaca do fundo, leitura imediata). Pinta de cor
 * escura todo pixel transparente adjacente a um pixel opaco.
 */
async function addOutline(cellBuf: Buffer, cell: number, color: [number, number, number] = [18, 14, 22]): Promise<Buffer> {
  const { data } = await sharp(cellBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  const alphaAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= cell || y >= cell ? 0 : data[(y * cell + x) * 4 + 3];
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const i = (y * cell + x) * 4;
      if (data[i + 3] >= 128) continue; // já opaco
      if (alphaAt(x - 1, y) >= 128 || alphaAt(x + 1, y) >= 128 || alphaAt(x, y - 1) >= 128 || alphaAt(x, y + 1) >= 128) {
        out[i] = color[0];
        out[i + 1] = color[1];
        out[i + 2] = color[2];
        out[i + 3] = 255;
      }
    }
  }
  return sharp(out, { raw: { width: cell, height: cell, channels: 4 } }).png().toBuffer();
}

/** caixa de conteúdo (união das cardeais) + margem p/ armas em movimento. */
async function contentBoxFrac(files: string[]): Promise<BoxFrac> {
  let x0 = 1,
    y0 = 1,
    x1 = 0,
    y1 = 0;
  for (const f of files) {
    const im = await loadImage(f);
    const b = contentBounds(im);
    if (!b) continue;
    x0 = Math.min(x0, b.x / im.width);
    y0 = Math.min(y0, b.y / im.height);
    x1 = Math.max(x1, (b.x + b.w) / im.width);
    y1 = Math.max(y1, (b.y + b.h) / im.height);
  }
  if (x1 <= x0) return { x: 0, y: 0, w: 1, h: 1 }; // fallback: frame inteiro
  // margem: generosa no topo/lados (arma erguida no ataque), pouca embaixo (pé)
  const mw = (x1 - x0) * 0.3;
  const mtop = (y1 - y0) * 0.4;
  const mbot = (y1 - y0) * 0.05;
  const nx = Math.max(0, x0 - mw);
  const ny = Math.max(0, y0 - mtop);
  return { x: nx, y: ny, w: Math.min(1, x1 + mw) - nx, h: Math.min(1, y1 + mbot) - ny };
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
  const engine = brief.engine ?? "pixflux";
  const cardinals = [...DIRECTION_ORDER]; // south, north, east, west

  // ── 1) estático (resumível): masters por direção em <work>/master/<dir>.png ──
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
  } else if (engine === "pixflux") {
    // gera só as direções pedidas (default só sul); replica o resto → coerência +
    // economia (1 gen em vez de 4). alta fidelidade, síncrono.
    const wantDirs = (brief.dirs ?? ["south"]).filter((d) => cardinals.includes(d as (typeof cardinals)[number]));
    if (!wantDirs.length) wantDirs.push("south");
    log(`static: gerando pixflux ${PIXFLUX_MASTER}px (dirs: ${wantDirs.join(",")}; resto replicado)…`);
    const desc = `${brief.subject}, ${PIXFLUX_STYLE}`;
    for (const d of wantDirs) {
      const f = path.join(masterDir, `${d}.png`);
      if (await exists(f)) {
        master[d] = f;
        continue;
      }
      const im = await createImagePixflux({
        description: desc,
        size: PIXFLUX_MASTER,
        direction: d,
        view: brief.view,
      });
      await saveB64(f, im.b64);
      master[d] = f;
      masterPx = im.width;
      log(`  ${d}: ${im.width}px ✓`);
    }
    // replica a 1ª direção gerada nas cardeais faltantes (N/E/W = cópia do sul)
    const fallback = master[wantDirs[0]];
    for (const d of cardinals) if (!master[d]) master[d] = fallback;
  } else {
    log(`static: gerando 8d PRO (req ${MASTER_REQUEST}px master, PRO entrega ~1.75×)…`);
    const { jobId } = await createCharacter8dPro({
      description: `${brief.subject}, ${STYLE}`,
      size: MASTER_REQUEST,
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
    if (!master[d]) throw new Error(`master faltando pra direção "${d}" — estático incompleto`);
  if (!masterPx) masterPx = (await sharp(master[cardinals[0]]).metadata()).width ?? 0;

  // caixa de conteúdo (recorta a margem do Pixellab) — vale pra todos os frames
  const box = await contentBoxFrac(cardinals.map((d) => master[d]));
  log(`seat: caixa ${(box.w * 100).toFixed(0)}%×${(box.h * 100).toFixed(0)}% do frame (conteúdo preenche a célula)`);

  // pixflux já traz outline seletivo colorido + cor vibrante → não redobra outline
  // nem satura por cima (mataria o cel-shade do artista). 8d = outline chapado + boost.
  const seatBase: SeatOpts = engine === "pixflux" ? { outline: false, sat: 1.0 } : { outline: true, sat: SATURATION };

  // ── 2) por animação ─────────────────────────────────────────────────────
  const out: SheetOut[] = [];
  for (const anim of brief.anims) {
    if (anim === "idle") {
      // 1 frame/direção = o estático assentado. grid 1col × 4linhas.
      const rows = await Promise.all(cardinals.map(async (d) => [await seatFrame(master[d], box, brief.size, seatBase)]));
      const file = path.join(ASSETS_DIR, "_incoming", `${brief.id}.idle.png`);
      await composeGrid(file, rows, brief.size);
      out.push({ anim, file, frames: 1, directions: 4, masterPx });
      log(`idle: montado (1f × 4dir) → ${path.relative(ASSETS_DIR, file)}`);
      continue;
    }

    const n = ANIM_FRAMES[anim];
    const rows: Buffer[][] = [];
    // dedup: direções que compartilham o mesmo master (ex: N/E/W = cópia do sul)
    // são animadas UMA vez só e replicadas → economiza jobs de animação.
    const seatedByMaster = new Map<string, Buffer[]>();
    for (const d of cardinals) {
      const mp = master[d];
      const done = seatedByMaster.get(mp);
      if (done) {
        rows.push(done);
        log(`${anim}/${d}: replicado (mesmo master do sul)`);
        continue;
      }
      const frameDir = path.join(work, anim, d);
      let frames = await listFrames(frameDir);
      if (frames.length < n) {
        log(`${anim}/${d}: animando (${n}f) a partir do master…`);
        const first = (await fs.readFile(mp)).toString("base64");
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
      // frames de animação vêm com fundo opaco → flood-key + assenta na célula
      const picked = frames.slice(0, n);
      const seated = await Promise.all(picked.map((f) => seatFrame(f, box, brief.size, { ...seatBase, key: true })));
      seatedByMaster.set(mp, seated);
      rows.push(seated);
    }
    const file = path.join(ASSETS_DIR, "_incoming", `${brief.id}.${anim}.png`);
    await composeGrid(file, rows, brief.size);
    out.push({ anim, file, frames: n, directions: 4, masterPx });
    log(`${anim}: montado (${n}f × 4dir) → ${path.relative(ASSETS_DIR, file)}`);
  }
  return out;
}
