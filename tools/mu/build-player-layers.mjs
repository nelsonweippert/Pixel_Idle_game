/**
 * build-player-layers.mjs — CAMADAS DE EQUIPAMENTO do herói (paper-doll em sprites).
 *
 * Problema: pré-assar toda COMBINAÇÃO de peças (elmo do set A + peito do set B…) é
 * combinatório. Solução: renderizar cada PEÇA como uma CAMADA pixel-alinhada — o corpo
 * base (partes Class02) e cada peça de item (HelmMaleNN…) saem do harness com o MESMO
 * enquadramento (opts.lock capturado do corpo inteiro) e o MESMO recorte fixo → o
 * browser empilha as camadas num canvas e monta o herói com QUALQUER combinação.
 *
 * Contratos de alinhamento (quebrar = camadas dessincronizadas):
 *  · opts.lock idêntico em todos os renders (câmera/centralização congeladas);
 *  · recorte FIXO (célula única derivada do corpo base + folga p/ ombreiras/chifres);
 *  · SEM filtro/drop de frames (todas as camadas têm o mesmo nº de frames por estado).
 *
 * Saída: apps/web/public/sprites/layers/dk/<camada>.{idle,walk,attack}.{png,json}
 *  camadas: base-helm/armor/pants/gloves/boots (corpo nu) + set<N>-<peça> (13 sets DK).
 *
 *   node tools/mu/build-player-layers.mjs [setNumber...]   (sem args = todos)
 */
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { parseBmd, buildPlayerModel, buildRenderModel } from "./mu-bmd.mjs";
import { textureFileFor, decodeToPngBuffer } from "./mu-textures.mjs";
import pw from "file:///C:/Users/Storming/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.js";
const { chromium } = pw;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const THREE_DIR = "C:/Users/Storming/Desktop/GItHubs/muonline-bmd-viewer/node_modules/three/build";
const DATA = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data";
const PLAYER_ANIM = "C:/Users/Storming/Desktop/GItHubs/muonline-bmd-viewer/public/game/Player/player_s6.bmd";
const SETS_JSON = path.join(ROOT, "packages/shared/content/mu-sets.json");
const OUT = path.join(ROOT, "apps/web/public/sprites/layers/dk");
const TEX_DIRS = [path.join(DATA, "Item"), path.join(DATA, "Player")];

const SIZE = 512, DIRS = 4, DIRVEC = [0, 1.0, 1.6], TARGET_H = 100; // corpo ≈100px (escala dos atores)
const PLAYER_ACTS = [{ index: 1, name: "idle", frames: 4 }, { index: 15, name: "walk", frames: 8 }, { index: 39, name: "attack", frames: 6 }];
const FACINGS = ["south", "north", "east", "west"], CACHE_DIR_ORDER = ["south", "west", "north", "east"];
const FPS = { idle: 6, walk: 10, attack: 12 };
const PARTS = ["helm", "armor", "pants", "gloves", "boots"]; // slots de armadura
const BASE_PART_FILE = { helm: "HelmClass02.bmd", armor: "ArmorClass02.bmd", pants: "PantClass02.bmd", gloves: "GloveClass02.bmd", boots: "BootClass02.bmd" };

async function loadTex(meshes) {
  const needed = [...new Set(meshes.map((m) => m.texturePath).filter(Boolean))];
  const textures = {};
  for (const tp of needed) {
    const { base, exts } = textureFileFor(tp);
    outer: for (const dir of TEX_DIRS) for (const ext of exts) {
      try { const raw = await fs.readFile(path.join(dir, `${base}.${ext}`)); textures[tp] = `data:image/png;base64,${(await decodeToPngBuffer(`x.${ext}`, raw)).toString("base64")}`; break outer; } catch {}
    }
  }
  return textures;
}

// ── infra de render (igual aos demais bakers) ─────────────────────────────────
const server = http.createServer(async (req, res) => { try { const u = req.url.split("?")[0]; if (u.endsWith(".js")) { res.setHeader("content-type", "text/javascript"); res.end(await fs.readFile(path.join(THREE_DIR, path.basename(u)))); return; } res.setHeader("content-type", "text/html"); res.end(await fs.readFile(path.join(HERE, "harness.html"))); } catch (e) { res.statusCode = 500; res.end(String(e)); } });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
await page.goto(`http://localhost:${port}/harness.html`); await page.waitForFunction("window.__ready === true", { timeout: 15000 });

const animBmd = parseBmd((await fs.readFile(PLAYER_ANIM)).buffer);
// attachments = [{...buildRenderModel(bmd), bone}] — arma/escudo preso no osso da mão
// (42 = direita, 33 = esquerda; convenção do cliente, copiada do viewer do xulek)
async function renderRaw(parts, lock, returnLock = false, attachments = []) {
  const model = buildPlayerModel(animBmd, parts);
  if (attachments.length) model.attachments = attachments;
  const allMeshes = [...model.meshes, ...attachments.flatMap((a) => a.meshes)];
  const textures = await loadTex(allMeshes);
  const opts = { size: SIZE, dirs: DIRS, actions: PLAYER_ACTS, yaw0: 0, fit: 1.7, dirVec: DIRVEC, lock: lock ?? undefined, returnLock };
  return page.evaluate(async (a) => window.renderBMD(a.model, a.textures, a.opts), { model, textures, opts });
}

// ── 1) corpo base COMPLETO: captura o lock + a célula de recorte fixa ─────────
console.log("corpo base (lock + célula)…");
const baseParts = [];
for (const p of PARTS) baseParts.push(parseBmd((await fs.readFile(path.join(DATA, "Player", BASE_PART_FILE[p]))).buffer));
const { frames: baseFrames, lock } = await renderRaw(baseParts, null, true);

// ── medição POR FRAME do corpo base (alpha>130, MINRUN=3 — regra provada) ────
// A anim de walk do MU TRANSLADA o root pelo canvas (o boneco anda de verdade), então
// não existe "célula global": o recorte é POR FRAME, ancorado no pé-centro do bbox do
// CORPO BASE daquele frame, e o MESMO retângulo é reaplicado às camadas de peça (mesma
// anim ⇒ mesmo offset ⇒ camadas pixel-alinhadas e pé plantado).
const MINRUN = 3, ATH = 130;
function frameBox(data, w, h) {
  const col = new Int32Array(w), row = new Int32Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > ATH) { col[x]++; row[y]++; }
  let l = w, r = -1, t = h, b = -1;
  for (let x = 0; x < w; x++) if (col[x] >= MINRUN) { if (x < l) l = x; if (x > r) r = x; }
  for (let y = 0; y < h; y++) if (row[y] >= MINRUN) { if (y < t) t = y; if (y > b) b = y; }
  return r < 0 ? null : { l, t, r, b, w: r - l + 1, h: b - t + 1 };
}
const rects = new Map(); // "a.d.k" -> { cx, bottom } (âncora pé-centro no canvas 512)
let maxW = 0, maxH = 0;
for (const f of baseFrames) {
  const buf = Buffer.from(f.url.split(",")[1], "base64");
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bx = frameBox(data, info.width, info.height);
  if (!bx) continue;
  rects.set(`${f.a}.${f.d}.${f.k}`, { cx: (bx.l + bx.r) / 2, bottom: bx.b });
  if (bx.w > maxW) maxW = bx.w; if (bx.h > maxH) maxH = bx.h;
}
// célula única (dims): corpo maior + folga p/ ombreiras E ARMAS (a espada balança
// FORA do bbox do corpo no ataque → larg ×2.1, alt ×1.28 no topo)
const scale = TARGET_H / maxH;
const srcW = Math.round(maxW * 2.1), srcH = Math.round(maxH * 1.28);
const cellW = Math.round(srcW * scale), cellH = Math.round(srcH * scale);
console.log(`  corpo por-frame: max ${maxW}×${maxH} → célula ${cellW}×${cellH} (src ${srcW}×${srcH}, ${rects.size} frames)`);

// ── 2) exporta um conjunto de frames como spritesheet Pixi ────────────────────
// Recorte POR FRAME no retângulo do CORPO BASE (rects) — igual pra toda camada.
// O canvas é estendido com margem transparente antes do extract (o retângulo pode
// vazar da borda quando o boneco anda até o limite do canvas).
async function exportLayer(name, frames) {
  const PADSRC = Math.max(srcW, srcH); // margem ≥ célula src → extract nunca sai dos limites
  for (const act of PLAYER_ACTS) {
    // agrupa por direção NA ORDEM do cache; SEM filtro/drop → contagem idêntica entre camadas
    const dirs = [];
    for (let d = 0; d < DIRS; d++) dirs.push(frames.filter((f) => f.a === act.index && f.d === d));
    const nF = dirs[0].length;
    const W = nF * cellW, H = FACINGS.length * cellH;
    const comps = [], sheetFrames = {}, animations = {};
    const blank = await sharp({ create: { width: cellW, height: cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    for (let fi = 0; fi < FACINGS.length; fi++) {
      const src = dirs[CACHE_DIR_ORDER.indexOf(FACINGS[fi])];
      animations[FACINGS[fi]] = [];
      for (let i = 0; i < nF; i++) {
        const f = src[i];
        const rect = rects.get(`${f.a}.${f.d}.${f.k}`);
        let png = blank;
        if (rect) {
          const x0 = Math.round(rect.cx - srcW / 2) + PADSRC;
          const y0 = rect.bottom - srcH + 1 + PADSRC;
          const buf = Buffer.from(f.url.split(",")[1], "base64");
          // sharp aplica extract ANTES de extend na mesma chain (ordem interna fixa) →
          // estende PRIMEIRO em uma chamada própria, depois recorta na imagem estendida.
          const extended = await sharp(buf)
            .extend({ top: PADSRC, bottom: PADSRC, left: PADSRC, right: PADSRC, background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png().toBuffer();
          const cut = await sharp(extended)
            .extract({ left: x0, top: y0, width: srcW, height: srcH })
            .resize(cellW, cellH, { kernel: "lanczos3" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
          for (let k = 0; k < cut.data.length; k += 4) cut.data[k + 3] = cut.data[k + 3] < 130 ? 0 : 255;
          png = await sharp(cut.data, { raw: { width: cellW, height: cellH, channels: 4 } }).png().toBuffer();
        }
        comps.push({ input: png, left: i * cellW, top: fi * cellH });
        const fn = `${act.name}.${FACINGS[fi]}.${i}`;
        sheetFrames[fn] = { frame: { x: i * cellW, y: fi * cellH, w: cellW, h: cellH }, sourceSize: { w: cellW, h: cellH }, spriteSourceSize: { x: 0, y: 0, w: cellW, h: cellH }, anchor: { x: 0.5, y: 1 } };
        animations[FACINGS[fi]].push(fn);
      }
    }
    await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(comps).png().toFile(path.join(OUT, `${name}.${act.name}.png`));
    const json = { frames: sheetFrames, animations, meta: { image: `${name}.${act.name}.png`, format: "RGBA8888", size: { w: W, h: H }, scale: 1, fps: FPS[act.name] } };
    await fs.writeFile(path.join(OUT, `${name}.${act.name}.json`), JSON.stringify(json));
  }
}

await fs.mkdir(OUT, { recursive: true });

// ── 3) camadas base (corpo nu, uma PARTE por camada, mesmo lock) ──────────────
for (const p of PARTS) {
  const part = parseBmd((await fs.readFile(path.join(DATA, "Player", BASE_PART_FILE[p]))).buffer);
  const frames = await renderRaw([part], lock);
  await exportLayer(`base-${p}`, frames);
  console.log(`  ✓ base-${p}`);
}

// ── 4) camadas de PEÇAS dos sets DK ───────────────────────────────────────────
// CLI: posicionais = números de set (999 = nenhum) · `--weapons [defIds...]` = também
// baka camadas de arma/escudo (sem ids = TODOS os equipáveis do catálogo)
const rawArgs = process.argv.slice(2);
const wIdx = rawArgs.indexOf("--weapons");
const only = (wIdx >= 0 ? rawArgs.slice(0, wIdx) : rawArgs).filter((a) => /^\d+$/.test(a));
const weaponIds = wIdx >= 0 ? rawArgs.slice(wIdx + 1).filter((a) => /^\d+$/.test(a)).map(Number) : null;

const sets = JSON.parse(await fs.readFile(SETS_JSON, "utf8"));
const dkSets = Object.values(sets).filter((s) => s.classes.includes("dk"))
  .filter((s) => !only.length || only.includes(String(s.number)))
  .sort((a, b) => a.number - b.number);
console.log(`sets DK: ${dkSets.map((s) => `${s.name}(#${s.number})`).join(", ")}`);
let ok = 0;
for (const s of dkSets) {
  for (const p of PARTS) {
    try {
      const model = s.pieces[p].model;
      const part = parseBmd((await fs.readFile(path.join(DATA, "Item", model))).buffer);
      const frames = await renderRaw([part], lock);
      await exportLayer(`set${s.number}-${p}`, frames);
      ok++;
    } catch (e) { console.log(`  ✖ set${s.number}-${p}: ${e.message}`); }
  }
  console.log(`  ✓ ${s.name} #${s.number} (5 peças)`);
}

// ── 5) camadas de ARMA/ESCUDO (attachments no osso da mão) ───────────────────
// Esqueleto do player SEM corpo (parts=[]) + o BMD da arma preso na mão → a camada
// contém SÓ a arma, seguindo a animação da mão, alinhada às demais (mesmo lock/rects).
// Grupos 0..5 (armas) → mão DIREITA (bone 42); grupo 6 (escudos) → ESQUERDA (bone 33).
if (weaponIds !== null) {
  const ROOT2 = path.resolve(HERE, "../..");
  const catalog = JSON.parse(await fs.readFile(path.join(ROOT2, "packages/shared/content/mu-items.json"), "utf8"));
  const weapons = catalog.filter((it) => it.group <= 6 && it.slot != null && it.model)
    .filter((it) => !weaponIds.length || weaponIds.includes(it.id));
  console.log(`armas/escudos: ${weapons.length}`);
  let wok = 0;
  for (const it of weapons) {
    try {
      const bmd = parseBmd((await fs.readFile(path.join(DATA, "Item", it.model))).buffer);
      const att = { ...buildRenderModel(bmd), bone: it.group === 6 ? 33 : 42 };
      const frames = await renderRaw([], lock, false, [att]);
      await exportLayer(`wpn-${it.id}`, frames);
      wok++;
      if (wok % 20 === 0) console.log(`  … ${wok}/${weapons.length}`);
    } catch (e) { console.log(`  ✖ wpn-${it.id} ${it.name}: ${e.message}`); }
  }
  console.log(`  ✓ armas: ${wok}/${weapons.length}`);
}

// manifesto: célula + camadas disponíveis (o HuntScene consulta antes de compor)
const layers = (await fs.readdir(OUT)).filter((f) => f.endsWith(".idle.json")).map((f) => f.replace(".idle.json", ""));
await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify({ cellW, cellH, targetH: TARGET_H, layers }, null, 2));
await browser.close(); server.close();
console.log(`✅ ${ok} camadas de peça + 5 base → ${OUT}`);
