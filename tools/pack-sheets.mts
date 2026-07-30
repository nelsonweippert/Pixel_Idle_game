/**
 * pack-sheets.mts — gera 1 CONTACT SHEET (montagem) por pack do catalog.json, pra que
 * agentes de classificação (Fable 5) VEJAM a arte real de cada conjunto e atribuam o
 * tema correto — em vez de adivinhar pelo nome da pasta. Saída: <OUT>/<id>.png + index.json.
 *
 * uso: npx tsx tools/pack-sheets.mts <OUT_DIR>
 */
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const WEB = path.resolve("apps/web/public");
const OUT = process.argv[2] || path.resolve("pack-sheets");
const cat = JSON.parse(await fs.readFile(path.join(WEB, "mapkit/catalog.json"), "utf8"));
await fs.mkdir(OUT, { recursive: true });

const idSafe = (id: string) => id.replace(/[\/\\]/g, "__");
const CELL = 64, COLS = 8, MAXF = 40;
const index: { id: string; name: string; category: string; currentTheme: string; frames: number; sheet: string; sampleNames: string[] }[] = [];

for (const p of cat.packs) {
  const safe = idSafe(p.id);
  const outPath = path.join(OUT, safe + ".png");
  try {
    if (p.category === "wang") {
      // atlas 64×64 (16 tiles): amplia nítido pra 320 pra dar pra ver os cantos
      await sharp(path.join(WEB, p.files[0].path.replace(/^\//, ""))).resize(320, 320, { kernel: "nearest" }).png().toFile(outPath);
    } else {
      const frames = p.files.slice(0, MAXF);
      const rows = Math.max(1, Math.ceil(frames.length / COLS));
      const W = COLS * CELL, H = rows * CELL;
      const comps: sharp.OverlayOptions[] = [];
      for (let i = 0; i < frames.length; i++) {
        try {
          const buf = await sharp(path.join(WEB, frames[i].path.replace(/^\//, "")))
            .resize(CELL - 6, CELL - 6, { fit: "contain", kernel: "nearest", background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png().toBuffer();
          comps.push({ input: buf, left: (i % COLS) * CELL + 3, top: Math.floor(i / COLS) * CELL + 3 });
        } catch { /* frame ilegível, pula */ }
      }
      await sharp({ create: { width: W, height: H, channels: 4, background: { r: 26, g: 24, b: 20, alpha: 1 } } })
        .composite(comps).png().toFile(outPath);
    }
    index.push({
      id: p.id, name: p.name, category: p.category, currentTheme: p.theme, frames: p.files.length,
      sheet: outPath, sampleNames: p.files.slice(0, 8).map((f: any) => f.path.split("/").pop()),
    });
  } catch (e) {
    console.error("falhou:", p.id, e);
  }
}

await fs.writeFile(path.join(OUT, "index.json"), JSON.stringify(index, null, 2));
console.log(`✅ ${index.length} sheets → ${OUT}`);
