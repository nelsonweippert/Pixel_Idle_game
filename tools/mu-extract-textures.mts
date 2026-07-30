/**
 * mu-extract-textures.mts — PROVA DE CONCEITO: decodifica texturas do cliente MU (Webzen)
 * pro nosso pipeline. OZJ = header de 24 bytes + JPEG puro; OZT = 24 bytes + TGA (alpha).
 * Aqui trato OZJ (a maioria, 14.6k arquivos) → PNG via sharp. OZT/OZB ficam pro próximo passo.
 *
 * uso: npx tsx tools/mu-extract-textures.mts <OUT_DIR>
 */
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const DATA = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data";
const OUT = process.argv[2] || path.resolve("mu-proof");
await fs.mkdir(OUT, { recursive: true });

// OZJ: descarta os 24 bytes de header → JPEG válido
const ozjToPng = (buf: Buffer) => sharp(buf.subarray(24)).png();

async function pick(dir: string, n: number): Promise<string[]> {
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith(".ozj"));
    return files.slice(0, n).map((f) => path.join(dir, f));
  } catch { return []; }
}

// amostra representativa: tiles de chão (usáveis DIRETO), UI, itens, e atlas de monstro
const srcs = [
  ...await pick(path.join(DATA, "World1"), 10),
  ...await pick(path.join(DATA, "Interface"), 14),
  ...await pick(path.join(DATA, "Item"), 12),
  ...await pick(path.join(DATA, "Monster"), 12),
];

let ok = 0, fail = 0;
const cells: { name: string; buf: Buffer }[] = [];
for (const s of srcs) {
  try {
    const png = ozjToPng(await fs.readFile(s));
    const name = path.basename(s).replace(/\.OZJ$/i, "");
    await png.clone().toFile(path.join(OUT, name + ".png"));
    // célula 128 pra o contact sheet
    const cell = await png.clone().resize(120, 120, { fit: "contain", background: { r: 20, g: 18, b: 14, alpha: 1 } }).toBuffer();
    cells.push({ name, buf: cell });
    ok++;
  } catch { fail++; }
}

// contact sheet 8 colunas
const COLS = 8, CELL = 128;
const rows = Math.max(1, Math.ceil(cells.length / COLS));
await sharp({ create: { width: COLS * CELL, height: rows * CELL, channels: 3, background: { r: 12, g: 11, b: 8 } } })
  .composite(cells.map((c, i) => ({ input: c.buf, left: (i % COLS) * CELL + 4, top: Math.floor(i / COLS) * CELL + 4 })))
  .png().toFile(path.join(OUT, "_contact.png"));

console.log(`✅ OZJ→PNG: ${ok} ok · ${fail} falhas · contact sheet → ${path.join(OUT, "_contact.png")}`);
console.log(`   fontes: World1(tiles) + Interface + Item + Monster`);
