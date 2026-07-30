/**
 * `forge promote` — codifica a RECEITA COMPROVADA de importar personagens
 * CraftPix da série âncora (top-down, células 64×64, full-sheets `Without_shadow`)
 * pra spritesheets PixiJS, passando pelo portão da Forja.
 *
 * A receita (verificada byte-a-byte contra o knight em produção):
 *   1. ler a full-sheet `lvl{N}_{Anim}_without_shadow.png` (4 linhas × N colunas de 64px)
 *   2. REMAP de linhas [0,3,2,1]: a fonte vem [sul, OESTE, LESTE, norte] e o nosso
 *      contrato (DIRECTION_ORDER) é [sul, norte, leste, oeste] — logo as posições
 *      sul,norte,leste,oeste saem das linhas-fonte 0,3,2,1. NÃO trocar east/west:
 *      isso foi provado pixel-a-pixel contra os .aseprite rotulados
 *      (Idle_side_left/Idle_side_right). O remap [0,3,2,1] é CANÔNICO.
 *   3. ASSENTAR +3px: desloca o conteúdo de cada célula 3px pra baixo (constante),
 *      pro pé alinhar com a âncora bottom-center do jogo.
 *   4. CÓPIA PURA de pixels: sem tocar cor nem alpha. O glow de alpha parcial do
 *      slash sai idêntico à fonte (byte-a-byte). SEM snap de paleta: a série
 *      âncora já é coesa — quantizar só degradaria.
 *   6. montar o sheet Pixi (buildPixiSheet) com o fps comprovado por anim,
 *      VALIDAR pelo portão, registrar no manifest e publicar o par PNG+JSON
 *      em apps/web/public/sprites/.
 *
 * Mapeamento de animações fonte→contrato (comprovado na âncora):
 *   Idle → idle · Walk_Attack → walk (a âncora usa a marcha COM espada em riste,
 *   não o Walk desarmado — verificado byte-a-byte) · attack → attack.
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { anchorPoint, specFor, type AssetType } from "./spec";
import { validate, type ValidateResult } from "./validate";
import { buildPixiSheet } from "./atlas";
import { ASSETS_DIR, REPO_ROOT, register } from "./manifest";

/** célula da série âncora (CraftPix top-down = 64×64, igual ao nosso character) */
const CELL = 64;

/** linhas da fonte na ordem do NOSSO contrato: sul,norte,leste,oeste ← 0,3,2,1 */
const ROW_REMAP = [0, 3, 2, 1] as const;

/** assentamento vertical: conteúdo desce 3px (constante, comprovado na âncora) */
const SEAT_PX = 3;

/** fps por animação — os MESMOS dos JSON do knight comprovado em produção
 *  (idle 12f@6 = respiração calma · walk 6f@10 · attack 7f@12 = golpe seco).
 *  hurt/death seguem a mesma cadência de golpe. */
const PROMOTE_FPS: Record<string, number> = { idle: 6, walk: 10, attack: 12, hurt: 12, death: 10 };

/** anims do contrato → nomes de sheet da fonte, em ordem de preferência.
 *  walk tenta Walk_Attack (swordsman, marcha armada) e cai pra Walk (skeleton). */
const ANIM_SOURCES: Record<string, string[]> = {
  idle: ["Idle"],
  walk: ["Walk_Attack", "Walk"],
  attack: ["attack", "Attack"],
  hurt: ["Hurt"],
  death: ["Death"],
};

export interface PromoteOpts {
  packDir: string;
  id: string;
  /** nível do personagem dentro do pack (swordsman: lvl4/5/6 → prefixo `lvl4_`) */
  level?: number;
  /** variante nomeada do pack (skeleton: `Skeleton1` → prefixo `Skeleton1_`).
   *  Se dado, tem prioridade sobre `level`. */
  variant?: string;
  anims?: string[];
  type?: AssetType;
  log?: (m: string) => void;
}

export interface PromoteResult {
  anim: string;
  ok: boolean;
  source?: string;
  out?: string;
  validation?: ValidateResult;
  error?: string;
}

/** varre o pack atrás das full-sheets `<prefix><Anim>_without_shadow.png` */
async function findSheets(packDir: string, prefix: string): Promise<Map<string, string>> {
  const found = new Map<string, string>(); // nome-da-anim-fonte (lowercase) → caminho
  const lprefix = prefix.toLowerCase();
  const suffix = "_without_shadow.png";
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        const lower = e.name.toLowerCase();
        if (lower.startsWith(lprefix) && lower.endsWith(suffix)) {
          const src = lower.slice(lprefix.length, -suffix.length); // ex: "walk_attack", "idle"
          found.set(src, full);
        }
      }
    }
  }
  await walk(packDir);
  return found;
}

/**
 * NÚCLEO da receita: fatia a full-sheet em células 64×64, remapeia as linhas
 * pro nosso contrato e assenta +3px — tudo em buffer cru (sem resample, sem
 * blend): cada pixel opaco sai IDÊNTICO ao da fonte.
 */
export async function composeFromFullSheet(srcPath: string): Promise<{
  png: Buffer;
  width: number;
  height: number;
  frames: number;
}> {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  if (H !== 4 * CELL || W % CELL !== 0) {
    throw new Error(`full-sheet fora do padrão da âncora: ${W}×${H} (esperado N×${CELL} por 4×${CELL})`);
  }
  const frames = W / CELL;
  const out = Buffer.alloc(data.length); // já nasce transparente (zeros)

  for (let r = 0; r < 4; r++) {
    const sr = ROW_REMAP[r]; // linha-fonte que preenche a linha r do contrato
    for (let y = 0; y < CELL; y++) {
      const sy = y - SEAT_PX; // conteúdo desce SEAT_PX (as 3 linhas de baixo saem — sempre vazias na âncora)
      if (sy < 0 || sy >= CELL) continue;
      const srcOff = (sr * CELL + sy) * W * 4;
      const dstOff = (r * CELL + y) * W * 4;
      data.copy(out, dstOff, srcOff, srcOff + W * 4);
    }
  }

  // CÓPIA PURA: sem tocar em cor/alpha. Cada pixel (inclusive o glow de alpha
  // parcial do slash) sai IDÊNTICO à fonte — fiel à âncora, sem quantizar.
  const png = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  return { png, width: W, height: H, frames };
}

/**
 * Promove um personagem da série âncora: pra cada anim, compõe → VALIDA pelo
 * portão → sheet Pixi → registra no manifest → publica em apps/web/public/sprites.
 * Reprova → não entra (nem no manifest, nem no jogo).
 */
export async function promote(opts: PromoteOpts): Promise<PromoteResult[]> {
  const log = opts.log ?? (() => {});
  const type = opts.type ?? "character";
  const spec = specFor(type);
  const anims = opts.anims ?? ["idle", "walk", "attack"];
  const packDir = path.resolve(opts.packDir);
  const webSpritesDir = path.join(REPO_ROOT, "apps", "web", "public", "sprites");

  // prefixo das full-sheets: variante nomeada (Skeleton1_) tem prioridade sobre nível (lvl4_)
  const prefix = opts.variant ? `${opts.variant}_` : `lvl${opts.level ?? 4}_`;
  const sheets = await findSheets(packDir, prefix);
  if (!sheets.size) {
    throw new Error(`nenhuma full-sheet ${prefix}*_without_shadow.png encontrada em ${packDir}`);
  }

  const results: PromoteResult[] = [];
  for (const anim of anims) {
    const res: PromoteResult = { anim, ok: false };
    results.push(res);

    const candidates = ANIM_SOURCES[anim];
    if (!candidates) {
      res.error = `anim '${anim}' sem mapeamento fonte (tem: ${Object.keys(ANIM_SOURCES).join(", ")})`;
      log(`✘ ${anim}: ${res.error}`);
      continue;
    }
    const srcPath = candidates.map((c) => sheets.get(c.toLowerCase())).find(Boolean);
    if (!srcPath) {
      res.error = `fonte não encontrada (procurei: ${candidates.join(", ")})`;
      log(`✘ ${anim}: ${res.error}`);
      continue;
    }
    res.source = path.relative(REPO_ROOT, srcPath);

    // compõe pela receita (remap + seat, buffer cru)
    const composed = await composeFromFullSheet(srcPath);
    log(`${anim}: ${path.basename(srcPath)} → ${composed.frames}f × 4dir (remap [${ROW_REMAP}], seat +${SEAT_PX}px)`);

    // grava e VALIDA pelo portão — reprovou, sai (e não deixa lixo pra trás)
    const rel = `sprites/${opts.id}.${anim}.png`;
    const outPath = path.join(ASSETS_DIR, rel);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, composed.png);

    const v = await validate(outPath, { type, anim, frameSize: CELL });
    res.validation = v;
    if (!v.ok) {
      await fs.rm(outPath, { force: true });
      res.error = v.violations.map((x) => `${x.rule}: ${x.detail}`).join(" · ");
      log(`✘ ${anim}: REPROVADO pelo portão — ${res.error}`);
      continue;
    }

    // sheet Pixi com o fps comprovado da âncora
    const fps = PROMOTE_FPS[anim] ?? spec.animations.find((a) => a.name === anim)?.fps ?? 8;
    const anchor = anchorPoint(spec.anchor);
    const sheet = buildPixiSheet({
      image: path.basename(rel),
      anim,
      frameW: CELL,
      frameH: CELL,
      frames: composed.frames,
      directions: 4,
      anchor,
      fps,
    });
    const sheetRel = `sprites/${opts.id}.${anim}.json`;
    const sheetPath = path.join(ASSETS_DIR, sheetRel);
    await fs.writeFile(sheetPath, JSON.stringify(sheet, null, 2) + "\n", "utf8");

    // registra no manifesto (o portão do jogo)
    await register({
      id: opts.id,
      type,
      anim,
      path: rel,
      sheet: sheetRel,
      width: composed.width,
      height: composed.height,
      frameW: CELL,
      frameH: CELL,
      frames: composed.frames,
      directions: 4,
      fps,
      anchor,
      colors: v.info.colors,
      pixelScale: v.info.pixelScale,
      partialAlpha: Number(v.info.partialAlpha.toFixed(4)),
      source: res.source,
      validatedAt: new Date().toISOString(),
    });

    // publica o par PNG+JSON pro jogo (co-localizados, como o HuntScene espera)
    await fs.mkdir(webSpritesDir, { recursive: true });
    await fs.copyFile(outPath, path.join(webSpritesDir, `${opts.id}.${anim}.png`));
    await fs.copyFile(sheetPath, path.join(webSpritesDir, `${opts.id}.${anim}.json`));

    res.out = rel;
    res.ok = true;
    log(`✔ ${anim}: validado, registrado e publicado (${composed.frames}f @ ${fps}fps)`);
  }
  return results;
}
