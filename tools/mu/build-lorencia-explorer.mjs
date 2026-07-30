/**
 * build-lorencia-explorer.mjs — EXPLORER unificado: o mapa real de Lorência com spots
 * CLICÁVEIS que entram numa cena de combate ao vivo naquele terreno real, com o Dark
 * Knight caçando o(s) monstro(s) certo(s) da zona. Renderiza DK + 6 monstros + Skeleton
 * (player-rig), assa o mapa cheio + 1 janela de arena por spot, e emite 1 Artifact.
 *   node tools/mu/build-lorencia-explorer.mjs <outHtml> [--reuse]
 */
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { parseBmd, buildRenderModel, buildPlayerModel } from "./mu-bmd.mjs";
import { textureFileFor, decodeToPngBuffer } from "./mu-textures.mjs";
import { decodeTerrain, TSIZE, cidx } from "./mu-terrain.mjs";
import { bakeRegion } from "./bake-lorencia-floor.mjs";
import pw from "file:///C:/Users/Storming/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.js";
const { chromium } = pw;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THREE_DIR = "C:/Users/Storming/Desktop/GItHubs/muonline-bmd-viewer/node_modules/three/build";
const DATA = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data";
const WORLD1 = path.join(DATA, "World1");
const PLAYER_ANIM = "C:/Users/Storming/Desktop/GItHubs/muonline-bmd-viewer/public/game/Player/player_s6.bmd";
const outHtml = process.argv[2] || "lorencia-explorer.html";
const reuse = process.argv.includes("--reuse");

const SIZE = 512, DIRS = 4, DIRVEC = [0, 1.0, 1.6], BASE_H = 96;
const MONSTER_ACTS = [{ index: 0, name: "idle", frames: 4 }, { index: 2, name: "walk", frames: 8 }, { index: 3, name: "attack", frames: 6 }];
const PLAYER_ACTS = [{ index: 1, name: "idle", frames: 4 }, { index: 15, name: "walk", frames: 8 }, { index: 39, name: "attack", frames: 6 }];

// monstros de Lorência (modelo verificado via nomes internos do BMD + tempestidle/mobs.ts)
const MOBS = {
  spider:   { name: "Spider",             lv: 2,  hp: 30,  model: "Monster10", scale: 0.5 },
  budge:    { name: "Budge Dragon",       lv: 4,  hp: 60,  model: "Monster03", scale: 0.55 },
  bull:     { name: "Bull Fighter",       lv: 6,  hp: 100, model: "Monster01", scale: 0.82 },
  hound:    { name: "Hound",              lv: 9,  hp: 140, model: "Monster02", scale: 0.85 },
  elite:    { name: "Elite Bull Fighter", lv: 12, hp: 190, alias: "bull", tint: "#d24a34", scale: 0.9 },
  lich:     { name: "Lich",               lv: 14, hp: 255, model: "Monster05", scale: 0.92 },
  giant:    { name: "Giant",              lv: 17, hp: 400, model: "Monster11", scale: 1.18 },
  skeleton: { name: "Skeleton Warrior",   lv: 19, hp: 525, playerPart: "Skill/Skeleton01", scale: 0.95 },
};
const ZONES = [
  { key: "east",  name: "Bosque Leste",   x1: 180, x2: 226, y1: 90,  y2: 244, color: "#7fd08a", mobs: ["spider", "budge"] },
  { key: "north", name: "Campo Norte",    x1: 135, x2: 240, y1: 20,  y2: 88,  color: "#e0b24f", mobs: ["bull", "budge"] },
  { key: "west",  name: "Planície Oeste", x1: 8,   x2: 94,  y1: 11,  y2: 244, color: "#57b0d6", mobs: ["hound", "elite"] },
  { key: "south", name: "Necrópole Sul",  x1: 95,  x2: 175, y1: 168, y2: 244, color: "#a97fd6", mobs: ["lich", "skeleton"] },
  { key: "nw",    name: "Ermo Noroeste",  x1: 8,   x2: 60,  y1: 11,  y2: 80,  color: "#e0644f", mobs: ["giant"] },
];

// ── helpers de render (mesma matemática das cenas: feet-anchored, drop degenerado) ──
async function loadTex(meshes, dir) {
  const needed = [...new Set(meshes.map((m) => m.texturePath).filter(Boolean))]; const textures = {};
  for (const tp of needed) { const { base, exts } = textureFileFor(tp); for (const ext of exts) { try { const raw = await fs.readFile(path.join(dir, `${base}.${ext}`)); textures[tp] = `data:image/png;base64,${(await decodeToPngBuffer(`x.${ext}`, raw)).toString("base64")}`; break; } catch {} } }
  return textures;
}
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
  const maxW = Math.max(...fb.filter(Boolean).map((f) => f.w)), maxH = Math.max(...fb.filter(Boolean).map((f) => f.h));
  const scale = targetH / maxH, spW = Math.ceil(maxW * scale), spH = targetH;
  async function toSprite(i) {
    const box = fb[i]; if (!box) return sharp({ create: { width: spW, height: spH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const w = Math.max(1, Math.round(box.w * scale)), h = Math.max(1, Math.round(box.h * scale));
    const cut = await sharp(bufs[i]).extract({ left: box.l, top: box.t, width: box.w, height: box.h }).resize(w, h, { kernel: "nearest" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let k = 0; k < cut.data.length; k += 4) cut.data[k + 3] = cut.data[k + 3] < 100 ? 0 : 255;
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
const jpg = async (pngBuf, q = 82) => "data:image/jpeg;base64," + (await sharp(pngBuf).jpeg({ quality: q, mozjpeg: true }).toBuffer()).toString("base64"); // piso é opaco → JPEG (10× menor)
const ser = (s) => ({ w: s.w, h: s.h, anims: Object.fromEntries(Object.entries(s.anims).map(([k, dirs]) => [k, dirs.map((fr) => fr.map(uri))])) });

// ── MAIN ────────────────────────────────────────────────────────────────────────
// terreno = SEMPRE re-assado (barato, ~s); atores = caros → cache separado (--reuse).
const t = await decodeTerrain(WORLD1, { att: "EncTerrain1.att", map: "EncTerrain1.map" });
const full = await bakeRegion(t, { cx0: 0, cy0: 0, regionW: TSIZE, regionH: TSIZE, cellpx: 6 });
let sx = 0, sy = 0, sn = 0; for (let y = 0; y < TSIZE; y++) for (let x = 0; x < TSIZE; x++) if (t.wall[cidx(x, y)] & 0x1) { sx += x; sy += y; sn++; }
const town = { x: Math.round(sx / sn), y: Math.round(sy / sn) };
const zoneOut = [];
for (const z of ZONES) {
  const RW = Math.min(48, z.x2 - z.x1 + 1), RH = Math.min(30, z.y2 - z.y1 + 1);
  let cx0 = Math.round((z.x1 + z.x2) / 2 - RW / 2), cy0 = Math.round((z.y1 + z.y2) / 2 - RH / 2);
  cx0 = Math.max(z.x1, Math.min(z.x2 - RW + 1, cx0)); cy0 = Math.max(z.y1, Math.min(z.y2 - RH + 1, cy0));
  const r = await bakeRegion(t, { cx0, cy0, regionW: RW, regionH: RH, cellpx: 20 });
  zoneOut.push({ ...z, floor: { png: await jpg(r.png, 84), w: r.W, h: r.H, cellpx: r.cellpx, walkable: r.walkable } });
  console.log(`  spot ${z.name}: janela [${cx0},${cy0}] ${RW}×${RH} → ${r.W}×${r.H}`);
}
console.log("terreno assado (com lightmap + blend).");

// atores (cache)
const ACACHE = outHtml + ".actors.json";
let actors;
if (reuse) { try { actors = JSON.parse(await fs.readFile(ACACHE, "utf8")); console.log("♻ atores do cache"); } catch {} }
if (!actors) {
  console.log("renderizando atores...");
  const server = http.createServer(async (req, res) => { try { const u = req.url.split("?")[0]; if (u.endsWith(".js")) { res.setHeader("content-type", "text/javascript"); res.end(await fs.readFile(path.join(THREE_DIR, path.basename(u)))); return; } res.setHeader("content-type", "text/html"); res.end(await fs.readFile(path.join(HERE, "harness.html"))); } catch (e) { res.statusCode = 500; res.end(String(e)); } });
  await new Promise((r) => server.listen(0, r)); const port = server.address().port;
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await page.goto(`http://localhost:${port}/harness.html`); await page.waitForFunction("window.__ready === true", { timeout: 15000 });
  const animBmd = parseBmd((await fs.readFile(PLAYER_ANIM)).buffer);
  async function renderPlayerRig(parts, texDir, targetH) { const model = buildPlayerModel(animBmd, parts.map((p) => parseBmd(p.buf))); const textures = await loadTex(model.meshes, texDir); return renderActor(page, model, textures, PLAYER_ACTS, targetH); }
  actors = {};
  const dkParts = [];
  for (const p of ["Armor", "Helm", "Pant", "Glove", "Boot"]) dkParts.push({ buf: (await fs.readFile(path.join(DATA, "Player", `${p}Class02.bmd`))).buffer });
  actors.dk = ser(await renderPlayerRig(dkParts, path.join(DATA, "Player"), 100)); console.log(`  ✓ DK`);
  for (const [key, mob] of Object.entries(MOBS)) {
    if (mob.alias) continue;
    const targetH = Math.round(BASE_H * mob.scale);
    if (mob.playerPart) { const buf = (await fs.readFile(path.join(DATA, mob.playerPart + ".bmd"))).buffer; actors[key] = ser(await renderPlayerRig([{ buf }], path.join(DATA, path.dirname(mob.playerPart)), targetH)); }
    else { const bmd = parseBmd((await fs.readFile(path.join(DATA, "Monster", mob.model + ".bmd"))).buffer); const model = buildRenderModel(bmd); const textures = await loadTex(model.meshes, path.join(DATA, "Monster")); actors[key] = ser(await renderActor(page, model, textures, MONSTER_ACTS, targetH)); }
    console.log(`  ✓ ${mob.name} (${key})`);
  }
  await browser.close(); server.close();
  await fs.writeFile(ACACHE, JSON.stringify(actors));
}

const ASSETS = { map: await jpg(full.png, 86), mapW: full.W, mapH: full.H, cellpx: full.cellpx, tsize: TSIZE, town, zones: zoneOut, mobs: MOBS, actors };

const tpl = await fs.readFile(path.join(HERE, "lorencia-explorer.template.html"), "utf8");
const html = tpl.replace("/*__DATA__*/", () => JSON.stringify(ASSETS));
await fs.writeFile(outHtml, html);
const style = html.match(/<style>[\s\S]*?<\/style>/)[0], body = html.match(/<body>([\s\S]*)<\/body>/)[1];
await fs.writeFile(outHtml.replace(/\.html$/, ".artifact.html"), `<title>Lorência — Explorador de Spots</title>\n${style}\n${body}`);
console.log(`✅ ${outHtml} (+ .artifact.html) · ${Math.round(Buffer.byteLength(html) / 1024)} KB`);
