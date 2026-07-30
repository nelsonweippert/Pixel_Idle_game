/**
 * contact-sheet.mts — monta um grid rotulado de PNGs de uma ou mais pastas, pra
 * INSPECIONAR props/tiles com os olhos e escolher os certos p/ compor cenas.
 * uso: npx tsx tools/contact-sheet.mts <dir1,dir2,...> <out.png> [cols]
 */
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const [dirsArg, outPath, colsArg] = process.argv.slice(2);
const dirs = dirsArg.split(",");
const COLS = Number(colsArg) || 10;
const CELL = 96, PAD = 4, LABEL = 12;

const items: { p: string; label: string }[] = [];
for (const d of dirs) {
  const files = (await fs.readdir(d)).filter((f) => f.endsWith(".png")).sort();
  for (const f of files) items.push({ p: path.join(d, f), label: f.replace(/\.png$/, "").replace(/^\d+_/, "") });
}
const rows = Math.ceil(items.length / COLS);
const W = COLS * (CELL + PAD) + PAD;
const H = rows * (CELL + PAD + LABEL) + PAD;
const comps: sharp.OverlayOptions[] = [];
for (let i = 0; i < items.length; i++) {
  const cx = PAD + (i % COLS) * (CELL + PAD);
  const cy = PAD + Math.floor(i / COLS) * (CELL + PAD + LABEL);
  const buf = await sharp(items[i].p).resize(CELL, CELL, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  comps.push({ input: buf, left: cx, top: cy });
  const txt = await sharp({ text: { text: `${i} ${items[i].label}`.slice(0, 20), font: "sans", fontfile: undefined as never, rgba: true, width: CELL, height: LABEL } }).png().toBuffer().catch(() => null);
  if (txt) comps.push({ input: txt, left: cx, top: cy + CELL });
}
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 28, g: 24, b: 18, alpha: 1 } } }).composite(comps).png().toFile(outPath);
console.log(`${items.length} sprites → ${outPath}`);
console.log(items.map((it, i) => `${i}:${it.label}`).join("  "));
