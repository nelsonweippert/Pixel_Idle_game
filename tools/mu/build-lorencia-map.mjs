/**
 * build-lorencia-map.mjs — assa o MAPA INTEIRO de Lorência e sobrepõe os SPOTS de caçada
 * (áreas de spawn reais do OpenMU S6) como zonas idle rotuladas. Valida a orientação
 * (spawns têm de cair em chão caminhável) e emite um Artifact interativo (mapa + zonas +
 * painel de monstros por spot).
 *   node tools/mu/build-lorencia-map.mjs <outHtml>
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bakeFullMap } from "./bake-lorencia-floor.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const outHtml = process.argv[2] || "lorencia-map.html";
const TSIZE = 256;

// ── SPOTS de Lorência (OpenMU S6 CreateMonsterSpawn: number, x1,x2,y1,y2, qty) ──────
// zonas = retângulos de spawn agrupados por área; mobs compartilham a zona.
const ZONES = [
  { key: "west",  name: "Planície Oeste",  x1: 8,   x2: 94,  y1: 11,  y2: 244, color: "#57b0d6",
    mobs: [{ n: "Hound", lv: 9, hp: 140, q: 45 }, { n: "Elite Bull Fighter", lv: 12, hp: 190, q: 45 }] },
  { key: "nw",    name: "Ermo Noroeste",   x1: 8,   x2: 60,  y1: 11,  y2: 80,  color: "#e0644f",
    mobs: [{ n: "Giant", lv: 17, hp: 400, q: 15 }] },
  { key: "north", name: "Campo Norte",     x1: 135, x2: 240, y1: 20,  y2: 88,  color: "#e0b24f",
    mobs: [{ n: "Bull Fighter", lv: 6, hp: 100, q: 45 }, { n: "Budge Dragon", lv: 4, hp: 60, q: 20 }] },
  { key: "east",  name: "Bosque Leste",    x1: 180, x2: 226, y1: 90,  y2: 244, color: "#7fd08a",
    mobs: [{ n: "Spider", lv: 2, hp: 30, q: 45 }, { n: "Budge Dragon", lv: 4, hp: 60, q: 40 }] },
  { key: "south", name: "Necrópole Sul",   x1: 95,  x2: 175, y1: 168, y2: 244, color: "#a97fd6",
    mobs: [{ n: "Lich", lv: 14, hp: 255, q: 20 }, { n: "Skeleton Warrior", lv: 19, hp: 525, q: 15 }] },
];

// ── bake mapa inteiro ────────────────────────────────────────────────────────────
const m = await bakeFullMap({ cellpx: 6 });
console.log(`mapa ${m.W}×${m.H} (célula ${m.CELLPX}px) · mapNumber ${m.mapNumber}`);

// ── VALIDAÇÃO de orientação: cada zona deve ser majoritariamente caminhável ───────
const cidx = (x, y) => y * TSIZE + x;
function walkPct(z) {
  let w = 0, n = 0;
  for (let y = z.y1; y <= z.y2; y++) for (let x = z.x1; x <= z.x2; x++) {
    const f = m.wall[cidx(x, y)]; n++; if (!((f & 0x4) || (f & 0x8))) w++;
  }
  return { pct: Math.round((w / n) * 100), n };
}
console.log("validação (spawn cai em chão caminhável?):");
let ok = true;
for (const z of ZONES) { const r = walkPct(z); if (r.pct < 55) ok = false; console.log(`  ${z.name.padEnd(18)} ${r.pct}% caminhável (${r.n} células)`); }
console.log(ok ? "✅ orientação OK — todas as zonas majoritariamente caminháveis" : "⚠ alguma zona com pouca caminhabilidade — revisar flip de eixo");

// centro da cidade (SafeZone) pra marcar
let sx = 0, sy = 0, sn = 0;
for (let y = 0; y < TSIZE; y++) for (let x = 0; x < TSIZE; x++) if (m.wall[cidx(x, y)] & 0x1) { sx += x; sy += y; sn++; }
const town = { x: Math.round(sx / sn), y: Math.round(sy / sn) };

// ── monta o Artifact ─────────────────────────────────────────────────────────────
const DATA = {
  map: "data:image/png;base64," + m.png.toString("base64"),
  W: m.W, H: m.H, cellpx: m.CELLPX, tsize: TSIZE,
  zones: ZONES, town,
};
const tpl = await fs.readFile(path.join(HERE, "lorencia-map.template.html"), "utf8");
const html = tpl.replace("/*__DATA__*/", () => JSON.stringify(DATA));
await fs.writeFile(outHtml, html);
// variante artifact (só body)
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
await fs.writeFile(outHtml.replace(/\.html$/, ".artifact.html"), `<title>Lorência — Mapa & Spots de Caçada</title>\n${style}\n${body}`);
console.log(`✅ ${outHtml} (+ .artifact.html) · ${Math.round(Buffer.byteLength(html) / 1024)} KB`);
