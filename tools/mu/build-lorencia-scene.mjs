/**
 * build-lorencia-scene.mjs — compõe a CENA de Lorência (prova de pipeline ponta-a-ponta):
 * piso de Lorência (World1 OZJ→pixel) + 5 Bull Fighters (Monster01) + 1 Dark Knight
 * (player multiparte token 02), todos renderizados como frames pixel transparentes
 * ancorados no pé, montados num HTML self-contained com motor de cena em canvas.
 *   node tools/mu/build-lorencia-scene.mjs <outHtml>
 * Reusa harness.html (three.js headless) + mu-bmd + mu-textures.
 */
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { parseBmd, buildRenderModel, buildPlayerModel } from "./mu-bmd.mjs";
import { textureFileFor, decodeToPngBuffer } from "./mu-textures.mjs";
import { bakeFloor } from "./bake-lorencia-floor.mjs";
import pw from "file:///C:/Users/Storming/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.js";
const { chromium } = pw;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THREE_DIR = "C:/Users/Storming/Desktop/GItHubs/muonline-bmd-viewer/node_modules/three/build";
const DATA = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data";
const PLAYER_ANIM = "C:/Users/Storming/Desktop/GItHubs/muonline-bmd-viewer/public/game/Player/player_s6.bmd";
const outHtml = process.argv[2] || "lorencia-scene.html";

const SIZE = 512, DIRS = 4, DIRVEC = [0, 1.0, 1.6];

// ── carrega texturas de um conjunto de meshes ────────────────────────────────────
async function loadTextures(meshes, dir) {
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

// ── renderiza um modelo → frames por action×dir (Buffer PNG transparente, pé no fundo) ─
async function renderActor(page, model, textures, actions, targetH) {
  const frames = await page.evaluate(async (a) => window.renderBMD(a.model, a.textures, a.opts), { model, textures, opts: { size: SIZE, dirs: DIRS, actions, yaw0: 0, fit: 1.7, dirVec: DIRVEC } });
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
  const maxW = Math.max(...fb.filter(Boolean).map((f) => f.w));
  const maxH = Math.max(...fb.filter(Boolean).map((f) => f.h));
  const scale = targetH / maxH, spW = Math.ceil(maxW * scale), spH = targetH;
  async function toSprite(i) {
    const box = fb[i];
    if (!box) return sharp({ create: { width: spW, height: spH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const w = Math.max(1, Math.round(box.w * scale)), h = Math.max(1, Math.round(box.h * scale));
    const cut = await sharp(bufs[i]).extract({ left: box.l, top: box.t, width: box.w, height: box.h }).resize(w, h, { kernel: "nearest" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let k = 0; k < cut.data.length; k += 4) cut.data[k + 3] = cut.data[k + 3] < 100 ? 0 : 255;
    const sp = await sharp(cut.data, { raw: { width: cut.info.width, height: cut.info.height, channels: 4 } }).png().toBuffer();
    return sharp({ create: { width: spW, height: spH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: sp, left: Math.round((spW - w) / 2), top: spH - h }]).png().toBuffer();
  }
  const byAction = {};
  for (const act of actions) {
    const dirs = [];
    for (let d = 0; d < DIRS; d++) {
      const idxs = frames.map((f, i) => ({ f, i })).filter(({ f }) => f.a === act.index && f.d === d).map(({ i }) => i);
      // descarta frames DEGENERADOS (silhueta virou sliver — modelo edge-on numa vista
      // lateral) → é o que fazia o ator "sumir e reaparecer" ao andar. Corte por largura.
      const ws = idxs.map((i) => (fb[i] ? fb[i].w : 0));
      const posW = ws.filter((w) => w > 0).sort((a, b) => a - b);
      const med = posW.length ? posW[posW.length >> 1] : 1;
      const keep = idxs.filter((_i, k) => ws[k] > 0 && ws[k] >= 0.42 * med);
      if (keep.length < idxs.length) console.log(`    ${act.name} dir${d}: ${idxs.length}→${keep.length} (dropou ${idxs.length - keep.length} degenerado; larguras=${ws.join(",")})`);
      dirs.push(await Promise.all(keep.map(toSprite)));
    }
    if (dirs[0].length > 2 && dirs[0][dirs[0].length - 1].equals(dirs[0][0])) for (const dd of dirs) dd.pop();
    byAction[act.name] = dirs;
  }
  return { w: spW, h: spH, anims: byAction };
}

// ── piso: OZJ 256² → tile pixel 64² (nearest) ────────────────────────────────────
async function floorTile(file, size = 64) {
  const raw = await fs.readFile(path.join(DATA, "World1", file));
  const png = await decodeToPngBuffer(file, raw);
  return "data:image/png;base64," + (await sharp(png).resize(size, size, { kernel: "nearest" }).png().toBuffer()).toString("base64");
}

// ─────────────────────────────── MAIN ───────────────────────────────
const CACHE = outHtml + ".assets.json";
const reuse = process.argv.includes("--reuse");
let ASSETS;
if (reuse) {
  try { ASSETS = JSON.parse(await fs.readFile(CACHE, "utf8")); console.log("♻ assets reaproveitados do cache — só recompondo HTML"); } catch { console.log("cache ausente; renderizando do zero"); }
}
if (!ASSETS) {
const bullBmd = parseBmd((await fs.readFile(path.join(DATA, "Monster", "Monster01.bmd"))).buffer);
const bull = buildRenderModel(bullBmd);
const bullTex = await loadTextures(bull.meshes, path.join(DATA, "Monster"));

const animBmd = parseBmd((await fs.readFile(PLAYER_ANIM)).buffer);
const partBmds = [];
for (const p of ["Armor", "Helm", "Pant", "Glove", "Boot"]) {
  try { partBmds.push(parseBmd((await fs.readFile(path.join(DATA, "Player", `${p}Class02.bmd`))).buffer)); } catch (e) { console.warn("peça?", p, e.message); }
}
const dk = buildPlayerModel(animBmd, partBmds);
const dkTex = await loadTextures(dk.meshes, path.join(DATA, "Player"));
console.log("modelos montados — abrindo browser...");

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

const BULL_ACTS = [{ index: 0, name: "idle", frames: 4 }, { index: 2, name: "walk", frames: 8 }, { index: 3, name: "attack", frames: 6 }];
const bullSprites = await renderActor(page, bull, bullTex, BULL_ACTS, 74);
console.log(`bull: ${bullSprites.w}x${bullSprites.h} · idle ${bullSprites.anims.idle[0].length}f walk ${bullSprites.anims.walk[0].length}f attack ${bullSprites.anims.attack[0].length}f`);

const DK_ACTS = [{ index: 1, name: "idle", frames: 4 }, { index: 15, name: "walk", frames: 8 }, { index: 39, name: "attack", frames: 6 }];
const dkSprites = await renderActor(page, dk, dkTex, DK_ACTS, 98);
console.log(`dk: ${dkSprites.w}x${dkSprites.h} · idle ${dkSprites.anims.idle[0].length}f walk ${dkSprites.anims.walk[0].length}f attack ${dkSprites.anims.attack[0].length}f`);

await browser.close(); server.close();

// piso REAL de Lorência (World1 .map decodificado → bake top-down)
const baked = await bakeFloor({ regionW: 44, regionH: 26 });
console.log(`piso Lorência assado: ${baked.W}×${baked.H} (célula ${baked.CELLPX}px, mapa ${baked.mapNumber})`);

const uri = (b) => "data:image/png;base64," + b.toString("base64");
const ser = (s) => ({ w: s.w, h: s.h, anims: Object.fromEntries(Object.entries(s.anims).map(([k, dirs]) => [k, dirs.map((fr) => fr.map(uri))])) });
ASSETS = {
  floorBaked: { png: uri(baked.png), w: baked.W, h: baked.H, cellpx: baked.CELLPX, walkable: baked.walkable },
  bull: ser(bullSprites), dk: ser(dkSprites),
};
await fs.writeFile(CACHE, JSON.stringify(ASSETS));
}

const SCENE_HTML = await fs.readFile(path.join(HERE, "lorencia-scene.template.html"), "utf8");
const html = SCENE_HTML.replace("/*__ASSETS__*/", () => JSON.stringify(ASSETS));
await fs.writeFile(outHtml, html);
console.log(`✅ cena escrita: ${outHtml} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);

// variante artifact-ready: só conteúdo de <body> (+ <style> + <title>), sem wrapper de doc
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const bodyInner = html.match(/<body>([\s\S]*)<\/body>/)[1];
const artifact = `<title>Lorência — simulação de caçada</title>\n${style}\n${bodyInner}`;
const artOut = outHtml.replace(/\.html$/, ".artifact.html");
await fs.writeFile(artOut, artifact);
console.log(`✅ artifact: ${artOut}`);
