/**
 * render-model.mjs — PROVA DO CRUX: renderiza um BMD do MU (mesh+textura+esqueleto,
 * bind pose) num sprite via three.js headless (Playwright). Base do futuro
 * `forge render-mu-model`.
 *   node tools/mu/render-model.mjs <arquivo.bmd> <outDir> [dirs] [size]
 */
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBmd, buildRenderModel } from "./mu-bmd.mjs";
import { textureFileFor, decodeToPngBuffer } from "./mu-textures.mjs";
import pw from "file:///C:/Users/Storming/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.js";
const { chromium } = pw;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THREE_DIR = "C:/Users/Storming/Desktop/GItHubs/muonline-bmd-viewer/node_modules/three/build";

const [bmdPath, outDir = "mu-render-out", dirsArg = "1", sizeArg = "512"] = process.argv.slice(2);
if (!bmdPath) { console.error("uso: render-model.mjs <arquivo.bmd> <outDir> [dirs] [size]"); process.exit(1); }
const dirs = Number(dirsArg), size = Number(sizeArg);

// 1) parse + modelo
const bmd = parseBmd((await fs.readFile(bmdPath)).buffer);
const model = buildRenderModel(bmd);
console.log(`BMD: ${model.name} | ${model.meshes.length} meshes · ${model.bones.length} bones · armature=${model.armature}`);

// 2) texturas
const dir = path.dirname(bmdPath);
const needed = [...new Set(model.meshes.map((m) => m.texturePath).filter(Boolean))];
const textures = {};
for (const tp of needed) {
  const { base, exts } = textureFileFor(tp);
  let done = false;
  for (const ext of exts) {
    const fp = path.join(dir, `${base}.${ext}`);
    try {
      const raw = await fs.readFile(fp);
      const png = await decodeToPngBuffer(fp, raw);
      textures[tp] = `data:image/png;base64,${png.toString("base64")}`;
      done = true; break;
    } catch { /* tenta próxima extensão */ }
  }
  if (!done) console.warn(`  ⚠ textura não achada: ${tp}`);
}
console.log(`texturas: ${Object.keys(textures).length}/${needed.length} decodificadas`);

// 3) servidor http (harness + three)
const server = http.createServer(async (req, res) => {
  try {
    const url = req.url.split("?")[0];
    if (url.endsWith(".js")) { res.setHeader("content-type", "text/javascript"); res.end(await fs.readFile(path.join(THREE_DIR, path.basename(url)))); return; }
    res.setHeader("content-type", "text/html"); res.end(await fs.readFile(path.join(HERE, "harness.html")));
  } catch (e) { res.statusCode = 500; res.end(String(e)); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

// 4) render via playwright
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: size, height: size } });
page.on("console", (m) => console.log("  [page]", m.text()));
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
await page.goto(`http://localhost:${port}/harness.html`);
await page.waitForFunction("window.__ready === true", { timeout: 15000 });
const frames = await page.evaluate(async ({ model, textures, opts }) => window.renderBMD(model, textures, opts), { model, textures, opts: { dirs, size } });

// 5) salva
await fs.mkdir(outDir, { recursive: true });
const b64 = (u) => Buffer.from(u.split(",")[1], "base64");
for (let i = 0; i < frames.length; i++) await fs.writeFile(path.join(outDir, `dir${i}.png`), b64(frames[i]));
console.log(`✅ ${frames.length} frame(s) → ${outDir}`);

await browser.close();
server.close();
