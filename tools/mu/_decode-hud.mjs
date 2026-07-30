import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { decodeToPngBuffer } from "./mu-textures.mjs";
const IF = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data/Interface";
const OUT = process.env.HUD_OUT;
const names = process.argv.slice(2);
const tiles = [], labels = [];
for (const n of names) {
  try {
    const raw = await fs.readFile(path.join(IF, n));
    const png = await decodeToPngBuffer(n, raw);
    const meta = await sharp(png).metadata();
    const bg = await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: { r: 64, g: 64, b: 74, alpha: 255 } } }).png().toBuffer();
    const comp = await sharp(bg).composite([{ input: png }]).resize(Math.min(360, meta.width), null, { fit: "inside" }).png().toBuffer();
    tiles.push(comp); labels.push(`${n} ${meta.width}x${meta.height}`);
    console.log(`  ok ${n} ${meta.width}x${meta.height}`);
  } catch (e) { console.log(`  x ${n}: ${e.message}`); }
}
if (!tiles.length) { console.log("nada"); process.exit(0); }
const metas = await Promise.all(tiles.map(t => sharp(t).metadata()));
const W = 380, H = metas.reduce((s, m) => s + m.height + 22, 0), comps = [];
let y = 0;
for (let i = 0; i < tiles.length; i++) {
  const lbl = Buffer.from(`<svg width="${W}" height="20"><rect width="${W}" height="20" fill="#141419"/><text x="4" y="14" font-family="monospace" font-size="12" fill="#e8c060">${labels[i].replace(/&/g,"&amp;")}</text></svg>`);
  comps.push({ input: lbl, left: 0, top: y }); y += 20;
  comps.push({ input: tiles[i], left: 6, top: y }); y += metas[i].height + 2;
}
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 20, g: 20, b: 26, alpha: 255 } } }).composite(comps).png().toFile(OUT);
console.log("->", OUT);
