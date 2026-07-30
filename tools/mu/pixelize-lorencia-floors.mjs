/**
 * pixelize-lorencia-floors.mjs — ESTILIZA o piso de Lorência pra pixel-art.
 *
 * Os pisos bakeados são renders FOTOGRÁFICOS do terreno MU (gradientes suaves) — destoam
 * dos sprites/ícones em pixel-art nítido. Aqui: downscale (funde o detalhe fotográfico em
 * blocos limpos) + quantização de paleta SEM dither (chapa os gradientes = regiões de cor
 * planas, a marca do pixel-art), saída PNG. O engine faz o upscale nearest → tiles chunky
 * coerentes com o resto. tileW cai de 20→NT e pxW = width·NT (preserva o mapeamento da arena,
 * pois tileW·escala = WORLD_W/width é invariante).
 *   node tools/mu/pixelize-lorencia-floors.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const TILES = "C:/Users/Storming/Desktop/GItHubs/Pixel_Idle_game/apps/web/public/tilesets";
const NT = 8;       // px por tile no piso pixelizado (era 20) → ~pixel-art chunky
const COLORS = 22;  // paleta quantizada (sem dither) → gradiente vira regiões chapadas

const zones = (await fs.readdir(TILES)).filter((d) => d.startsWith("lorencia-"));
for (const z of zones) {
  const dir = path.join(TILES, z);
  const scenePath = path.join(dir, "scene.json");
  let scene;
  try { scene = JSON.parse(await fs.readFile(scenePath, "utf8")); } catch { continue; }
  const src = path.join(dir, scene.baked || "floor.jpg");
  const W = scene.width * NT, H = scene.height * NT;
  await sharp(src)
    .resize(W, H, { kernel: "lanczos3" })          // funde detalhe fotográfico → limpo
    .png({ palette: true, colors: COLORS, dither: 0 }) // quantiza SEM dither → cor chapada
    .toFile(path.join(dir, "floor.png"));
  // atualiza o contrato: baked→png, tileW/H→NT, pxW/H→width·NT (battle em tiles fica igual)
  scene.baked = "floor.png";
  scene.tileW = NT;
  scene.tileH = NT;
  scene.pxW = W;
  scene.pxH = H;
  await fs.writeFile(scenePath, JSON.stringify(scene, null, 2));
  // remove o jpg antigo (baked agora aponta pro png)
  try { await fs.unlink(path.join(dir, "floor.jpg")); } catch {}
  console.log(`  ✓ ${z.padEnd(16)} → floor.png ${W}×${H} (tileW ${NT}, ${COLORS} cores)`);
}
console.log("✅ pisos de Lorência pixelizados");
