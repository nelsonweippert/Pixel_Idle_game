/**
 * render-player.mjs — PLAYER MULTIPARTE (Dark Knight etc.) → sprite pixel animado 4 dir.
 * Monta player_s6.bmd (esqueleto+284 actions) + 5 peças (Armor/Helm/Pant/Glove/Boot de
 * um `token` de classe) num único SkinnedMesh-set, renderiza idle/walk/attack × 4 direções.
 *   node tools/mu/render-player.mjs <token> <outDir> [dataDir]
 * token '02' = Dark Knight. Reusa harness.html + toda a matemática de câmera/framing.
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
const THREE_DIR = "C:/Users/Storming/Desktop/GItHubs/muonline-bmd-viewer/node_modules/three/build";

const [token = "02", outDir = "mu-player-out", dataDirArg] = process.argv.slice(2);
const DATA = dataDirArg || "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data";
const PLAYER_ANIM = "C:/Users/Storming/Desktop/GItHubs/muonline-bmd-viewer/public/game/Player/player_s6.bmd";

// ── config de render ──────────────────────────────────────────────────────────
const SIZE = 512, DIRS = 4, TARGET_H = 88, PAD = 6;
const ACTIONS = [                                    // enum PlayerAction (player.bmd S6)
  { index: 1,  name: "idle",   frames: 4 },          // StopMale
  { index: 15, name: "walk",   frames: 8 },          // WalkMale
  { index: 39, name: "attack", frames: 6 },          // PlayerAttackSword1
];
const DIR_NAMES = ["south", "west", "north", "east"];

// ── 1) monta o player (anim + 5 peças) ──────────────────────────────────────────
const animBmd = parseBmd((await fs.readFile(PLAYER_ANIM)).buffer);
const PARTS = ["Armor", "Helm", "Pant", "Glove", "Boot"].map((p) => `${p}Class${token}`);
const partBmds = [];
for (const p of PARTS) {
  try { partBmds.push(parseBmd((await fs.readFile(path.join(DATA, "Player", `${p}.bmd`))).buffer)); }
  catch (e) { console.warn(`  ⚠ peça ausente: ${p} (${e.message})`); }
}
const model = buildPlayerModel(animBmd, partBmds);
console.log(`DarkKnight(token ${token}): ${model.meshes.length} meshes · ${model.bones.length} bones · ${model.anims.length} actions · ${partBmds.length}/5 peças`);

// ── texturas (peças usam HQSkinClass1XX.jpg / texturas próprias) ──────────────────
const needed = [...new Set(model.meshes.map((m) => m.texturePath).filter(Boolean))];
const textures = {};
for (const tp of needed) {
  const { base, exts } = textureFileFor(tp);
  for (const ext of exts) {
    try { const raw = await fs.readFile(path.join(DATA, "Player", `${base}.${ext}`)); textures[tp] = `data:image/png;base64,${(await decodeToPngBuffer(`x.${ext}`, raw)).toString("base64")}`; break; } catch {}
  }
  if (!textures[tp]) console.warn(`  ⚠ textura não achada: ${tp}`);
}
console.log(`texturas: ${Object.keys(textures).length}/${needed.length}`);

// ── 2) render via playwright ──────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try { const u = req.url.split("?")[0]; if (u.endsWith(".js")) { res.setHeader("content-type", "text/javascript"); res.end(await fs.readFile(path.join(THREE_DIR, path.basename(u)))); return; } res.setHeader("content-type", "text/html"); res.end(await fs.readFile(path.join(HERE, "harness.html"))); } catch (e) { res.statusCode = 500; res.end(String(e)); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
await page.goto(`http://localhost:${port}/harness.html`);
await page.waitForFunction("window.__ready === true", { timeout: 15000 });
const frames = await page.evaluate(async (a) => window.renderBMD(a.model, a.textures, a.opts), { model, textures, opts: { size: SIZE, dirs: DIRS, actions: ACTIONS, yaw0: 0, fit: 1.7, dirVec: [0, 1.0, 1.6] } });
await browser.close(); server.close();
console.log(`frames renderizadas: ${frames.length}`);

// ── 3) bbox POR FRAME + tamanho global de célula (feet-anchored) ──────────────────
const bufs = frames.map((f) => Buffer.from(f.url.split(",")[1], "base64"));
const MINRUN = 3, A = 90;
const fb = [];
for (let bi = 0; bi < bufs.length; bi++) {
  const { data, info } = await sharp(bufs[bi]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const col = new Int32Array(w), row = new Int32Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > A) { col[x]++; row[y]++; }
  let l = w, r = -1, t = h, b = -1;
  for (let x = 0; x < w; x++) if (col[x] >= MINRUN) { if (x < l) l = x; if (x > r) r = x; }
  for (let y = 0; y < h; y++) if (row[y] >= MINRUN) { if (y < t) t = y; if (y > b) b = y; }
  fb.push(r < 0 ? null : { l, t, w: r - l + 1, h: b - t + 1 });
}
const maxW = Math.max(...fb.filter(Boolean).map((f) => f.w));
const maxH = Math.max(...fb.filter(Boolean).map((f) => f.h));
const scale = TARGET_H / maxH;
const spW = Math.ceil(maxW * scale), spH = TARGET_H;
console.log(`conteúdo máx: ${maxW}×${maxH} → sprite ${spW}×${spH}`);

async function toSprite(bi) {
  const box = fb[bi];
  if (!box) return sharp({ create: { width: spW, height: spH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const w = Math.max(1, Math.round(box.w * scale)), h = Math.max(1, Math.round(box.h * scale));
  const cut = await sharp(bufs[bi]).extract({ left: box.l, top: box.t, width: box.w, height: box.h }).resize(w, h, { kernel: "nearest" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < cut.data.length; i += 4) cut.data[i + 3] = cut.data[i + 3] < 100 ? 0 : 255;
  const sprite = await sharp(cut.data, { raw: { width: cut.info.width, height: cut.info.height, channels: 4 } }).png().toBuffer();
  return sharp({ create: { width: spW, height: spH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sprite, left: Math.round((spW - w) / 2), top: spH - h }]).png().toBuffer();
}

await fs.mkdir(outDir, { recursive: true });
for (const act of ACTIONS) {
  const af = frames.map((f, i) => ({ f, i })).filter(({ f }) => f.a === act.index);
  const nF = af.filter(({ f }) => f.d === 0).length;
  const CW = spW + PAD * 2, CH = spH + PAD * 2;
  const comps = [];
  for (const { f, i } of af) comps.push({ input: await toSprite(i), left: f.k * CW + PAD, top: f.d * CH + PAD });
  await sharp({ create: { width: CW * nF, height: CH * DIRS, channels: 4, background: { r: 22, g: 20, b: 16, alpha: 1 } } })
    .composite(comps).png().toFile(path.join(outDir, `${act.name}_grid.png`));
  console.log(`  ${act.name}: grade ${nF} frames × ${DIRS} dir → ${act.name}_grid.png`);
}
console.log(`✅ direções (d=0..3) = ${DIR_NAMES.join(", ")}`);
