/**
 * reforge-actors.mjs — RE-RENDER dos atores MU (DK + 8 monstros) com FILTRO MELHORADO.
 *
 * Motivo: o pipeline antigo reduzia o render 3D de 512px pro tamanho do sprite com
 * `kernel: "nearest"` — que AMOSTRA 1 a cada ~4 pixels, gerando ruído/aliasing (o
 * "não-nítido" nas animações). O certo pra reduzir um render suave é um kernel de
 * reamostragem (lanczos3): mediá a área → pixel pequeno LIMPO. O upscale chunky/nítido
 * fica por conta do mundo (Pixi nearest). Aqui: UM único downscale lanczos + alpha
 * binário limpo, e o ator sai na resolução ≈ tamanho de tela (engine não reamostra).
 *
 *   node tools/mu/reforge-actors.mjs
 * Escreve o cache actors.json que o export-pixi-sheets.mjs consome.
 */
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { parseBmd, buildRenderModel, buildPlayerModel } from "./mu-bmd.mjs";
import { textureFileFor, decodeToPngBuffer } from "./mu-textures.mjs";
import pw from "file:///C:/Users/Storming/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.js";
const { chromium } = pw;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THREE_DIR = "C:/Users/Storming/Desktop/GItHubs/muonline-bmd-viewer/node_modules/three/build";
const DATA = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data";
const PLAYER_ANIM = "C:/Users/Storming/Desktop/GItHubs/muonline-bmd-viewer/public/game/Player/player_s6.bmd";
const OUT_CACHE = "C:/Users/Storming/AppData/Local/Temp/claude/C--WINDOWS-system32/8c5a039d-e634-4c05-a098-1e4a6f77af74/scratchpad/lorencia-explorer.html.actors.json";

const SIZE = 512, DIRS = 4, DIRVEC = [0, 1.0, 1.6], BASE_H = 96;
const MONSTER_ACTS = [{ index: 0, name: "idle", frames: 4 }, { index: 2, name: "walk", frames: 8 }, { index: 3, name: "attack", frames: 6 }];
const PLAYER_ACTS = [{ index: 1, name: "idle", frames: 4 }, { index: 15, name: "walk", frames: 8 }, { index: 39, name: "attack", frames: 6 }];

const MOBS = {
  spider:   { name: "Spider",           model: "Monster10", scale: 0.5 },
  budge:    { name: "Budge Dragon",     model: "Monster03", scale: 0.55 },
  bull:     { name: "Bull Fighter",     model: "Monster01", scale: 0.82 },
  hound:    { name: "Hound",            model: "Monster02", scale: 0.85 },
  lich:     { name: "Lich",             model: "Monster05", scale: 0.92 },
  giant:    { name: "Giant",            model: "Monster11", scale: 1.18 },
  skeleton: { name: "Skeleton Warrior", playerPart: "Skill/Skeleton01", scale: 0.95 },
};

async function loadTex(meshes, dir) {
  const needed = [...new Set(meshes.map((m) => m.texturePath).filter(Boolean))];
  const textures = {};
  for (const tp of needed) {
    const { base, exts } = textureFileFor(tp);
    for (const ext of exts) {
      try { const raw = await fs.readFile(path.join(dir, `${base}.${ext}`)); textures[tp] = `data:image/png;base64,${(await decodeToPngBuffer(`x.${ext}`, raw)).toString("base64")}`; break; } catch {}
    }
  }
  return textures;
}

async function renderActor(page, model, textures, actions, targetH) {
  const frames = await page.evaluate(async (a) => window.renderBMD(a.model, a.textures, a.opts), { model, textures, opts: { size: SIZE, dirs: DIRS, actions, yaw0: 0, fit: 1.7, dirVec: DIRVEC } });
  const bufs = frames.map((f) => Buffer.from(f.url.split(",")[1], "base64"));
  // bbox por frame (alpha) — feet-anchored e célula global uniforme
  const MINRUN = 3, A = 90, fb = [];
  for (const b of bufs) {
    const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height, col = new Int32Array(w), row = new Int32Array(h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > A) { col[x]++; row[y]++; }
    let l = w, r = -1, t = h, bo = -1;
    for (let x = 0; x < w; x++) if (col[x] >= MINRUN) { if (x < l) l = x; if (x > r) r = x; }
    for (let y = 0; y < h; y++) if (row[y] >= MINRUN) { if (y < t) t = y; if (y > bo) bo = y; }
    fb.push(r < 0 ? null : { l, t, w: r - l + 1, h: bo - t + 1 });
  }
  const maxW = Math.max(...fb.filter(Boolean).map((f) => f.w)), maxH = Math.max(...fb.filter(Boolean).map((f) => f.h));
  const scale = targetH / maxH, spW = Math.ceil(maxW * scale), spH = targetH;

  async function toSprite(i) {
    const box = fb[i]; if (!box) return sharp({ create: { width: spW, height: spH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const w = Math.max(1, Math.round(box.w * scale)), h = Math.max(1, Math.round(box.h * scale));
    // ── FILTRO NOVO: downscale LANCZOS3 (media a área → limpo) em vez de nearest ──
    // premultiplica p/ o lanczos não puxar o preto do fundo transparente pras bordas
    // (halo); depois desmultiplica e corta o alpha em binário (silhueta pixel nítida).
    const cut = await sharp(bufs[i])
      .extract({ left: box.l, top: box.t, width: box.w, height: box.h })
      .resize(w, h, { kernel: "lanczos3" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let k = 0; k < cut.data.length; k += 4) cut.data[k + 3] = cut.data[k + 3] < 130 ? 0 : 255;
    const sp = await sharp(cut.data, { raw: { width: cut.info.width, height: cut.info.height, channels: 4 } }).png().toBuffer();
    return sharp({ create: { width: spW, height: spH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: sp, left: Math.round((spW - w) / 2), top: spH - h }]).png().toBuffer();
  }

  const byAction = {};
  for (const act of actions) {
    const dirs = [];
    for (let d = 0; d < DIRS; d++) {
      const idxs = frames.map((f, i) => ({ f, i })).filter(({ f }) => f.a === act.index && f.d === d).map(({ i }) => i);
      const ws = idxs.map((i) => (fb[i] ? fb[i].w : 0)); const pos = ws.filter((w) => w > 0).sort((a, b) => a - b); const med = pos.length ? pos[pos.length >> 1] : 1;
      const keep = idxs.filter((_i, k) => ws[k] > 0 && ws[k] >= 0.42 * med);
      dirs.push(await Promise.all(keep.map(toSprite)));
    }
    if (dirs[0].length > 2 && dirs[0][dirs[0].length - 1].equals(dirs[0][0])) for (const dd of dirs) dd.pop();
    byAction[act.name] = dirs;
  }
  return { w: spW, h: spH, anims: byAction };
}

const uri = (b) => "data:image/png;base64," + b.toString("base64");
const ser = (s) => ({ w: s.w, h: s.h, anims: Object.fromEntries(Object.entries(s.anims).map(([k, dirs]) => [k, dirs.map((fr) => fr.map(uri))])) });

// ── MAIN ────────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => { try { const u = req.url.split("?")[0]; if (u.endsWith(".js")) { res.setHeader("content-type", "text/javascript"); res.end(await fs.readFile(path.join(THREE_DIR, path.basename(u)))); return; } res.setHeader("content-type", "text/html"); res.end(await fs.readFile(path.join(HERE, "harness.html"))); } catch (e) { res.statusCode = 500; res.end(String(e)); } });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
await page.goto(`http://localhost:${port}/harness.html`); await page.waitForFunction("window.__ready === true", { timeout: 15000 });

const animBmd = parseBmd((await fs.readFile(PLAYER_ANIM)).buffer);
async function renderPlayerRig(parts, texDir, targetH) { const model = buildPlayerModel(animBmd, parts.map((p) => parseBmd(p.buf))); const textures = await loadTex(model.meshes, texDir); return renderActor(page, model, textures, PLAYER_ACTS, targetH); }

const actors = {};
console.log("re-render (filtro lanczos3)…");
const dkParts = [];
for (const p of ["Armor", "Helm", "Pant", "Glove", "Boot"]) dkParts.push({ buf: (await fs.readFile(path.join(DATA, "Player", `${p}Class02.bmd`))).buffer });
actors.dk = ser(await renderPlayerRig(dkParts, path.join(DATA, "Player"), 100));
console.log(`  ✓ DK  (${actors.dk.w}×${actors.dk.h})`);

for (const [key, mob] of Object.entries(MOBS)) {
  const targetH = Math.round(BASE_H * mob.scale);
  if (mob.playerPart) { const buf = (await fs.readFile(path.join(DATA, mob.playerPart + ".bmd"))).buffer; actors[key] = ser(await renderPlayerRig([{ buf }], path.join(DATA, path.dirname(mob.playerPart)), targetH)); }
  else { const bmd = parseBmd((await fs.readFile(path.join(DATA, "Monster", mob.model + ".bmd"))).buffer); const model = buildRenderModel(bmd); const textures = await loadTex(model.meshes, path.join(DATA, "Monster")); actors[key] = ser(await renderActor(page, model, textures, MONSTER_ACTS, targetH)); }
  console.log(`  ✓ ${mob.name.padEnd(16)} (${actors[key].w}×${actors[key].h})`);
}

await browser.close(); server.close();
await fs.writeFile(OUT_CACHE, JSON.stringify(actors));
console.log(`✅ actors.json reescrito → ${OUT_CACHE}`);
