/**
 * reforge-item-icons.mjs — ÍCONES dos itens: renderiza o BMD de cada item do catálogo
 * (Data/Item/<model>) num ícone pequeno, com o MESMO harness+filtro dos atores (render
 * 512 → downscale lanczos3 limpo). Sai em apps/web/public/item-icons/<id>.png.
 *   node tools/mu/reforge-item-icons.mjs
 * Itens sem BMD no dump caem fora (o ItemCell mostra a sigla como fallback).
 */
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { parseBmd, buildRenderModel } from "./mu-bmd.mjs";
import { textureFileFor, decodeToPngBuffer } from "./mu-textures.mjs";
import pw from "file:///C:/Users/Storming/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.js";
const { chromium } = pw;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THREE_DIR = "C:/Users/Storming/Desktop/GItHubs/muonline-bmd-viewer/node_modules/three/build";
const DATA_ITEM = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data/Item";
const DATA_PLAYER = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data/Player"; // armadura/elmo/luva/bota/calça referenciam skins do player
const TEX_DIRS = [DATA_ITEM, DATA_PLAYER];
const CAT = "C:/Users/Storming/Desktop/GItHubs/Pixel_Idle_game/packages/shared/content/mu-items.json";
const OUT = "C:/Users/Storming/Desktop/GItHubs/Pixel_Idle_game/apps/web/public/item-icons";

// ICON=128: "skins perfeitas" — o inventário mostra ~40px e o HOVER dá zoom no ícone
// inteiro (128 nítido). Itens não são tratados como pixel-art (decisão do Nelson).
const SIZE = 512, ICON = 128, PAD = 6;
// vista 3/4 de cima (mostra a face do item); fit folgado p/ o item não encostar na borda
const OPTS = { size: SIZE, dirs: 1, actions: [{ index: 0, name: "icon", frames: 1 }], yaw0: Math.PI * 0.18, fit: 1.15, dirVec: [0.55, 0.8, 1.5] };
// ── ORIENTAÇÃO POR SILHUETA: heurísticas geométricas (PCA/bbox) falham porque cada BMD
// é modelado num eixo diferente (espada de ponta = "palito"; escudo de lado). Solução
// shape-agnóstica: renderiza N orientações candidatas em BAIXA-RES, mede a ÁREA da
// silhueta (px de alpha) e fica com a maior — espada cai no perfil, escudo na face,
// garrafa fica em pé (a original só perde se outra for ≥12% maior).
const PROBE = 96;
const CANDIDATES = [
  [0, 0, 0],                            // original (vence empates)
  [Math.PI / 2, 0, 0],
  [0, Math.PI / 2, 0],
  [0, 0, Math.PI / 2],
  [Math.PI / 2, 0, Math.PI / 2],
  [Math.PI / 2, Math.PI / 2, 0],
];
async function bestOrientation(page, model, textures) {
  let best = CANDIDATES[0], bestArea = -1;
  for (let c = 0; c < CANDIDATES.length; c++) {
    const opts = { ...OPTS, size: PROBE, preRot: CANDIDATES[c] };
    const frames = await page.evaluate(async (a) => window.renderBMD(a.model, a.textures, a.opts), { model, textures, opts });
    const buf = Buffer.from(frames[0].url.split(",")[1], "base64");
    const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let area = 0;
    for (let k = 3; k < data.length; k += 4) if (data[k] > 130) area++;
    // a original (c=0) é a referência; outra só ganha com folga (evita girar à toa)
    const need = c === 0 ? 0 : bestArea * 1.12;
    if (area > Math.max(need, bestArea)) { bestArea = area; best = CANDIDATES[c]; }
  }
  return best;
}

async function loadTex(meshes) {
  const needed = [...new Set(meshes.map((m) => m.texturePath).filter(Boolean))];
  const textures = {};
  for (const tp of needed) {
    const { base, exts } = textureFileFor(tp);
    outer: for (const dir of TEX_DIRS) {
      for (const ext of exts) {
        try { const raw = await fs.readFile(path.join(dir, `${base}.${ext}`)); textures[tp] = `data:image/png;base64,${(await decodeToPngBuffer(`x.${ext}`, raw)).toString("base64")}`; break outer; } catch {}
      }
    }
  }
  return textures;
}

async function renderIcon(page, model, textures, preRot) {
  const opts = { ...OPTS, preRot };
  const frames = await page.evaluate(async (a) => window.renderBMD(a.model, a.textures, a.opts), { model, textures, opts });
  let buf = Buffer.from(frames[0].url.split(",")[1], "base64");
  // item COMPRIDO deitado → gira 38° no plano da imagem (diagonal clássica dos ícones
  // do MU; preenche melhor o slot quadrado). Mede o bbox antes pra decidir.
  {
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;
    let l = w, r = -1, t = h, b = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 40) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
    if (r >= 0 && (r - l + 1) / Math.max(1, b - t + 1) >= 2.0) {
      buf = await sharp(buf).rotate(-38, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    }
  }
  // bbox por alpha
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  let l = w, r = -1, t = h, b = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 40) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  if (r < 0) return null; // vazio (sem geometria/textura)
  const bw = r - l + 1, bh = b - t + 1;
  // fit pela MAIOR dimensão num quadrado (espada alta preenche vertical; armadura, horizontal)
  const inner = ICON - PAD * 2;
  const scale = inner / Math.max(bw, bh);
  const dw = Math.max(1, Math.round(bw * scale)), dh = Math.max(1, Math.round(bh * scale));
  const cut = await sharp(buf).extract({ left: l, top: t, width: bw, height: bh }).resize(dw, dh, { kernel: "lanczos3" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let k = 0; k < cut.data.length; k += 4) cut.data[k + 3] = cut.data[k + 3] < 110 ? 0 : 255;
  const sp = await sharp(cut.data, { raw: { width: cut.info.width, height: cut.info.height, channels: 4 } }).png().toBuffer();
  return sharp({ create: { width: ICON, height: ICON, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sp, left: Math.round((ICON - dw) / 2), top: Math.round((ICON - dh) / 2) }]).png().toBuffer();
}

// ── MAIN ────────────────────────────────────────────────────────────────────────
const cat = JSON.parse(await fs.readFile(CAT, "utf8"));
const items = Array.isArray(cat) ? cat : cat.items;
await fs.mkdir(OUT, { recursive: true });

const server = http.createServer(async (req, res) => { try { const u = req.url.split("?")[0]; if (u.endsWith(".js")) { res.setHeader("content-type", "text/javascript"); res.end(await fs.readFile(path.join(THREE_DIR, path.basename(u)))); return; } res.setHeader("content-type", "text/html"); res.end(await fs.readFile(path.join(HERE, "harness.html"))); } catch (e) { res.statusCode = 500; res.end(String(e)); } });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
await page.goto(`http://localhost:${port}/harness.html`); await page.waitForFunction("window.__ready === true", { timeout: 15000 });

// substituição SÓ-ÍCONE p/ os 9 cujo model canônico não está neste dump do cliente
// (Os 9 overrides antigos ficaram OBSOLETOS: o catálogo agora deriva o modelo do
//  próprio item.bmd do cliente — nome↔skin batem por construção. Ver build-mu-catalog.mjs.)

const only = process.argv.slice(2); // opcional: renderiza só estes ids
let done = 0, skip = 0, fail = 0;
for (const it of items) {
  if (only.length && !only.includes(String(it.id))) continue;
  const model = it.model;
  if (!model) { skip++; continue; }
  const bmdPath = path.join(DATA_ITEM, model);
  try {
    await fs.access(bmdPath);
  } catch { console.log(`  ⏭ ${String(it.id).padStart(3)} ${it.name} — sem BMD (${model})`); skip++; continue; }
  try {
    const bmd = parseBmd((await fs.readFile(bmdPath)).buffer);
    const rmodel = buildRenderModel(bmd);
    const textures = await loadTex(rmodel.meshes);
    const best = await bestOrientation(page, rmodel, textures);
    const png = await renderIcon(page, rmodel, textures, best);
    if (!png) { console.log(`  ✖ ${String(it.id).padStart(3)} ${it.name} — render vazio`); fail++; continue; }
    await fs.writeFile(path.join(OUT, `${it.id}.png`), png);
    done++;
  } catch (e) { console.log(`  ✖ ${String(it.id).padStart(3)} ${it.name} — ${e.message}`); fail++; }
}
await browser.close(); server.close();
console.log(`\n✅ ícones: ${done} ok · ${skip} sem BMD · ${fail} falha → ${OUT}`);
