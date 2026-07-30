/**
 * extract-lorencia-scenes.mjs — extrai os PISOS REAIS de Lorência (terreno bakeado do
 * explorer) de dentro do artifact salvo e os instala como CENAS BAKEADAS do jogo:
 *   apps/web/public/tilesets/lorencia-<zona>/{floor.jpg, scene.json}
 * Assim o /play usa o MESMO terreno que fizemos no explorer, não o forest antigo.
 *   node tools/mu/extract-lorencia-scenes.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ART = "C:/Users/Storming/.claude/projects/C--WINDOWS-system32/8c5a039d-e634-4c05-a098-1e4a6f77af74/tool-results/artifact-ad416326-1783951582-7b33.html";
const OUT = "C:/Users/Storming/Desktop/GItHubs/Pixel_Idle_game/apps/web/public/tilesets";

// extrai o objeto JS literal após `const DATA = ` por balanceamento de chaves (respeita strings)
function extractData(html) {
  const anchor = "const DATA = ";
  const i = html.indexOf(anchor);
  if (i < 0) throw new Error("DATA não encontrado no artifact");
  let j = html.indexOf("{", i);
  let depth = 0, inStr = false, esc = false;
  for (let k = j; k < html.length; k++) {
    const c = html[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) return JSON.parse(html.slice(j, k + 1)); }
    }
  }
  throw new Error("fim do objeto DATA não encontrado");
}

// bounding box das células walkable → retângulo de arena (com pequeno inset)
function arenaFromWalkable(walk, cols, rows) {
  let minX = cols, minY = rows, maxX = -1, maxY = -1;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (walk?.[y]?.[x] === 1) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) return { x: 1, y: 1, w: Math.max(1, cols - 2), h: Math.max(1, rows - 2) };
  const insX = Math.round((maxX - minX + 1) * 0.08), insY = Math.round((maxY - minY + 1) * 0.08);
  const x = minX + insX, y = minY + insY;
  return { x, y, w: Math.max(1, maxX - minX + 1 - insX * 2), h: Math.max(1, maxY - minY + 1 - insY * 2) };
}

const html = await fs.readFile(ART, "utf8");
const DATA = extractData(html);
console.log(`DATA ok · ${DATA.zones.length} zonas`);

for (const z of DATA.zones) {
  const id = `lorencia-${z.key}`;
  const dir = path.join(OUT, id);
  await fs.mkdir(dir, { recursive: true });
  const fl = z.floor;
  const cols = Math.round(fl.w / fl.cellpx), rows = Math.round(fl.h / fl.cellpx);

  // piso: dataURI jpeg → floor.jpg
  const b64 = fl.png.split(",")[1];
  await fs.writeFile(path.join(dir, "floor.jpg"), Buffer.from(b64, "base64"));

  const scene = {
    name: z.name,
    tileW: fl.cellpx,
    tileH: fl.cellpx,
    width: cols,
    height: rows,
    baked: "floor.jpg",
    pxW: fl.w,
    pxH: fl.h,
    battle: arenaFromWalkable(fl.walkable, cols, rows),
  };
  await fs.writeFile(path.join(dir, "scene.json"), JSON.stringify(scene, null, 2));
  console.log(`  ✓ ${id}: ${fl.w}×${fl.h} (${cols}×${rows} cél) battle=${JSON.stringify(scene.battle)}`);
}
console.log("✅ cenas de Lorência instaladas em public/tilesets/lorencia-*");
