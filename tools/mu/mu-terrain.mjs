/**
 * mu-terrain.mjs — decodifica o terreno de um World do MU (.map/.att/.obj) rodando os
 * decoders VERBATIM do muonline-bmd-viewer (bundle esbuild) num Chromium headless
 * (evita re-portar ModulusCryptor + os 8 ciphers). Devolve as camadas de tile, os
 * atributos (wall) e os objetos, prontos pra bake top-down da Forja.
 *   import { decodeTerrain } from "./mu-terrain.mjs"
 */
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pw from "file:///C:/Users/Storming/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.js";
const { chromium } = pw;

const BUNDLE = "C:/Users/Storming/AppData/Local/Temp/claude/C--WINDOWS-system32/8c5a039d-e634-4c05-a098-1e4a6f77af74/scratchpad/terrain-bundle.js";
export const TSIZE = 256;

// ── OZB (TerrainLight/Height) — BMP não-cifrado, port do OZBReader.ts do viewer ──────
export function readOZB(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const fileType = String.fromCharCode(u8[0], u8[1], u8[2]);
  // 4 (prefixo) + 14 (BMP file header); largura/altura no info header (offset 4+14+4)
  const width = dv.getInt32(4 + 14 + 4, true);
  const height = dv.getInt32(4 + 14 + 8, true);
  const px = width * height, data = new Uint8Array(px * 4);
  if (fileType === "BM8" || fileType === "BM\x18") {
    let o = 4 + 14 + 40 + 1026; // paleta
    for (let i = 0; i < px; i++) { const v = u8[o++]; data[i * 4] = v; data[i * 4 + 1] = 0; data[i * 4 + 2] = 0; data[i * 4 + 3] = 255; }
  } else if (fileType === "BM6") {
    let o = 4 + 14 + 40; // pixels logo após info header
    for (let i = 0; i < px; i++) { const b = u8[o++], g = u8[o++], r = u8[o++]; data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255; }
  } else throw new Error(`OZB tipo desconhecido: "${fileType}"`);
  return { width, height, data };
}

// decodifica {mapFile, attFile, objFile?} → arrays (Uint8Array/Uint16Array) + objetos
export async function decodeTerrain(worldDir, { att, map, obj }) {
  const rd = async (f) => f ? Array.from(new Uint8Array(await fs.readFile(path.join(worldDir, f)))) : null;
  const bundle = await fs.readFile(BUNDLE, "utf8");
  const mapB = await rd(map), attB = await rd(att), objB = obj ? await rd(obj) : null;

  const server = http.createServer((req, res) => { res.setHeader("content-type", "text/html"); res.end("<!doctype html><meta charset=utf8><body>"); });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction("window.__terrainReady === true", { timeout: 10000 });

  const out = await page.evaluate((a) => {
    const toBuf = (arr) => arr ? new Uint8Array(arr).buffer : null;
    const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
    const map = window.readMAP(toBuf(a.mapB));
    const att = window.readATT(toBuf(a.attB));
    const obj = a.objB ? window.readOBJ(toBuf(a.objB)) : null;
    const wallU8 = new Uint8Array(att.terrainWall.buffer, att.terrainWall.byteOffset, att.terrainWall.byteLength);
    return {
      mapNumber: map.mapNumber, version: map.version,
      layer1: b64(map.layer1), layer2: b64(map.layer2), alpha: b64(map.alpha),
      wall: b64(wallU8), wallExt: att.isExtended,
      objects: obj ? obj.objects.map((o) => ({ t: o.type, x: o.position.x, y: o.position.y, z: o.position.z, ax: o.angle.x, ay: o.angle.y, az: o.angle.z, s: o.scale })) : [],
    };
  }, { mapB, attB, objB });

  await browser.close(); server.close();
  if (errs.length) console.warn("  [terrain pageerror]", errs.slice(0, 3));

  const dec = (s) => Uint8Array.from(Buffer.from(s, "base64"));
  const wallU8 = dec(out.wall);
  const wall = out.wallExt
    ? new Uint16Array(wallU8.buffer, wallU8.byteOffset, wallU8.byteLength / 2)
    : Uint16Array.from(wallU8); // std: 1 byte/cell → promove
  // luz/altura assadas (OZB, não cifrado) — opcionais
  let light = null, height = null;
  try { light = readOZB((await fs.readFile(path.join(worldDir, "TerrainLight.OZB"))).buffer); } catch {}
  try { height = readOZB((await fs.readFile(path.join(worldDir, "TerrainHeight.OZB"))).buffer); } catch {}
  return {
    mapNumber: out.mapNumber, version: out.version,
    layer1: dec(out.layer1), layer2: dec(out.layer2), alpha: dec(out.alpha),
    wall, objects: out.objects, light, height,
  };
}

// util: índice de célula
export const cidx = (x, y) => y * TSIZE + x;

// ── modo CLI: decodifica World1 e imprime análise ─────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const worldDir = process.argv[2] || "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data/World1";
  const t = await decodeTerrain(worldDir, { att: "EncTerrain1.att", map: "EncTerrain1.map", obj: "EncTerrain1.obj" });
  console.log(`World mapNumber=${t.mapNumber} version=${t.version}`);
  const uniq = (a) => [...new Set(a)].sort((x, y) => x - y);
  console.log("layer1 tiles:", uniq(t.layer1).join(","));
  console.log("layer2 tiles:", uniq(t.layer2).join(","));
  // histograma de tiles layer1
  const hist = {}; for (const v of t.layer1) hist[v] = (hist[v] || 0) + 1;
  console.log("layer1 hist:", Object.entries(hist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" "));
  // flags: conta SafeZone / NoMove
  let safe = 0, nomove = 0, water = 0; for (const w of t.wall) { if (w & 0x1) safe++; if (w & 0x4) nomove++; if (w & 0x10) water++; }
  console.log(`flags: SafeZone=${safe} NoMove=${nomove} Water=${water} (de ${t.wall.length})`);
  console.log(`objetos: ${t.objects.length} · tipos ${uniq(t.objects.map((o) => o.t)).slice(0, 30).join(",")}`);
  // caixa de cobertura dos objetos (onde fica a "cidade")
  if (t.objects.length) {
    const xs = t.objects.map((o) => o.x / 100), ys = t.objects.map((o) => o.y / 100);
    console.log(`objetos bbox (células): x[${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)}] y[${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)}]`);
  }
}
