/**
 * build-player-sets.mjs — PARTE B: renderiza o herói (Dark Knight) VESTINDO cada SET
 * completo do MU e exporta os spritesheets Pixi. Assim, ao equipar um set no jogo, o
 * personagem na cena passa a mostrar a armadura (nostalgia MU).
 *
 * Reaproveita o mesmo pipeline dos atores (harness three.js → bbox feet-anchored →
 * downscale lanczos3 → alpha binário) trocando as 5 partes do corpo pelas peças do set
 * (Data/Item/<Helm|Armor|Pant|Glove|Boot>MaleNN.bmd) em vez das partes-base ClassXX.
 *
 * Fonte dos sets: packages/shared/content/mu-sets.json (gerado por build-mu-catalog.mjs).
 * Só sets utilizáveis pelo DK são renderizados. Saída: public/sprites/set-<number>.*
 *
 *   node tools/mu/build-player-sets.mjs [number...]   (sem args = todos os sets DK)
 */
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { parseBmd, buildPlayerModel } from "./mu-bmd.mjs";
import { textureFileFor, decodeToPngBuffer } from "./mu-textures.mjs";
import pw from "file:///C:/Users/Storming/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.js";
const { chromium } = pw;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const THREE_DIR = "C:/Users/Storming/Desktop/GItHubs/muonline-bmd-viewer/node_modules/three/build";
const DATA = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data";
const PLAYER_ANIM = "C:/Users/Storming/Desktop/GItHubs/muonline-bmd-viewer/public/game/Player/player_s6.bmd";
const SETS_JSON = path.join(ROOT, "packages/shared/content/mu-sets.json");
const OUT = path.join(ROOT, "apps/web/public/sprites");
const TEX_DIRS = [path.join(DATA, "Item"), path.join(DATA, "Player")];

const SIZE = 512, DIRS = 4, DIRVEC = [0, 1.0, 1.6], TARGET_H = 100;
const PLAYER_ACTS = [{ index: 1, name: "idle", frames: 4 }, { index: 15, name: "walk", frames: 8 }, { index: 39, name: "attack", frames: 6 }];
const FACINGS = ["south", "north", "east", "west"], CACHE_DIR_ORDER = ["south", "west", "north", "east"];
const FPS = { idle: 6, walk: 10, attack: 12 };

// texturas das peças: buscam em Data/Item E Data/Player (armaduras referenciam ambos)
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

async function renderActor(page, model, textures, targetH) {
  const frames = await page.evaluate(async (a) => window.renderBMD(a.model, a.textures, a.opts), { model, textures, opts: { size: SIZE, dirs: DIRS, actions: PLAYER_ACTS, yaw0: 0, fit: 1.7, dirVec: DIRVEC } });
  const bufs = frames.map((f) => Buffer.from(f.url.split(",")[1], "base64"));
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
    const cut = await sharp(bufs[i]).extract({ left: box.l, top: box.t, width: box.w, height: box.h }).resize(w, h, { kernel: "lanczos3" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let k = 0; k < cut.data.length; k += 4) cut.data[k + 3] = cut.data[k + 3] < 130 ? 0 : 255;
    const sp = await sharp(cut.data, { raw: { width: cut.info.width, height: cut.info.height, channels: 4 } }).png().toBuffer();
    return sharp({ create: { width: spW, height: spH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: sp, left: Math.round((spW - w) / 2), top: spH - h }]).png().toBuffer();
  }
  const byAction = {};
  for (const act of PLAYER_ACTS) {
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

// empacota um estado (idle/walk/attack) no formato de spritesheet Pixi (igual export-pixi-sheets)
async function exportState(id, actor, state) {
  const dirs = actor.anims[state]; if (!dirs) return false;
  const nF = Math.max(...dirs.map((fr) => fr.length)); if (!nF) return false;
  const CW = actor.w, CH = actor.h, W = nF * CW, H = FACINGS.length * CH;
  const comps = [], frames = {}, animations = {};
  for (let fi = 0; fi < FACINGS.length; fi++) {
    const srcDir = CACHE_DIR_ORDER.indexOf(FACINGS[fi]);
    const fr = dirs[srcDir] || dirs[0];
    animations[FACINGS[fi]] = [];
    for (let i = 0; i < nF; i++) {
      comps.push({ input: fr[Math.min(i, fr.length - 1)], left: i * CW, top: fi * CH });
      const name = `${state}.${FACINGS[fi]}.${i}`;
      frames[name] = { frame: { x: i * CW, y: fi * CH, w: CW, h: CH }, sourceSize: { w: CW, h: CH }, spriteSourceSize: { x: 0, y: 0, w: CW, h: CH }, anchor: { x: 0.5, y: 1 } };
      animations[FACINGS[fi]].push(name);
    }
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png().toFile(path.join(OUT, `${id}.${state}.png`));
  const json = { frames, animations, meta: { image: `${id}.${state}.png`, format: "RGBA8888", size: { w: W, h: H }, scale: 1, fps: FPS[state] } };
  await fs.writeFile(path.join(OUT, `${id}.${state}.json`), JSON.stringify(json, null, 2));
  return true;
}

// ── MAIN ────────────────────────────────────────────────────────────────────────
const sets = JSON.parse(await fs.readFile(SETS_JSON, "utf8"));
const only = process.argv.slice(2);
// DK-utilizáveis (armadura veste DK); ordena por number
const dkSets = Object.values(sets)
  .filter((s) => s.classes.includes("dk"))
  .filter((s) => !only.length || only.includes(String(s.number)))
  .sort((a, b) => a.number - b.number);
console.log(`sets DK a renderizar: ${dkSets.length} → ${dkSets.map((s) => `${s.name}(#${s.number})`).join(", ")}`);

const server = http.createServer(async (req, res) => { try { const u = req.url.split("?")[0]; if (u.endsWith(".js")) { res.setHeader("content-type", "text/javascript"); res.end(await fs.readFile(path.join(THREE_DIR, path.basename(u)))); return; } res.setHeader("content-type", "text/html"); res.end(await fs.readFile(path.join(HERE, "harness.html"))); } catch (e) { res.statusCode = 500; res.end(String(e)); } });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
await page.goto(`http://localhost:${port}/harness.html`); await page.waitForFunction("window.__ready === true", { timeout: 15000 });

const animBmd = parseBmd((await fs.readFile(PLAYER_ANIM)).buffer);
await fs.mkdir(OUT, { recursive: true });

let ok = 0;
for (const s of dkSets) {
  try {
    const order = ["armor", "helm", "pants", "gloves", "boots"];
    const parts = [];
    for (const k of order) { const m = s.pieces[k].model; parts.push(parseBmd((await fs.readFile(path.join(DATA, "Item", m))).buffer)); }
    const model = buildPlayerModel(animBmd, parts);
    const textures = await loadTex(model.meshes);
    const actor = await renderActor(page, model, textures, TARGET_H);
    const id = `set-${s.number}`;
    for (const st of ["idle", "walk", "attack"]) await exportState(id, actor, st);
    console.log(`  ✓ ${s.name.padEnd(16)} #${s.number} → ${id} (${actor.w}×${actor.h})`);
    ok++;
  } catch (e) { console.log(`  ✖ ${s.name} #${s.number} — ${e.message}`); }
}

await browser.close(); server.close();
console.log(`✅ ${ok}/${dkSets.length} sets → public/sprites/set-<n>.*`);
