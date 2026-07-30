/**
 * build-mu-catalog.mjs — gera o catálogo AUTÊNTICO de itens do MU S6.
 *
 * Fontes (join por chave "group:id"):
 *  · MU-Webzen/Data/Local/item.bmd  → VERDADE DO CLIENTE: modelPath (skin), dims,
 *    stats, requisitos, valor, dropLevel, twoHands. (parse-item-bmd.mjs)
 *  · OpenMU/.../VersionSeasonSix/Items/{Weapons,Armors,Wings}.cs → NOME em inglês +
 *    flags de classe (os nomes em item.bmd são coreanos/mojibake).
 *
 * Garante que nome ↔ skin ↔ stats são consistentes POR CONSTRUÇÃO: o modelo vem do
 * mesmo (group,id) cujo nome é lido do OpenMU. Some com os 9 "overrides" antigos.
 *
 * Emite:
 *  · packages/shared/content/mu-items.json  (catálogo de gear g0..g12 + curados g13/g14)
 *  · packages/shared/content/mu-sets.json    (mapa de SETS p/ render no personagem — Parte B)
 *
 * Uso: node tools/mu/build-mu-catalog.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseItemBmd } from "./parse-item-bmd.mjs";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");
const OPENMU = "C:/Users/Storming/Desktop/GItHubs/OpenMU/src/Persistence/Initialization/VersionSeasonSix/Items";
const DATA_ITEM = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data/Item";
const OUT_ITEMS = path.join(ROOT, "packages/shared/content/mu-items.json");
const OUT_SETS = path.join(ROOT, "packages/shared/content/mu-sets.json");

const CLASS_TOKENS = ["dw", "dk", "elf", "mg", "dl", "sum", "rf"]; // ordem OpenMU dos flags
const GAME_CLASSES = new Set(["dw", "dk", "elf", "mg", "dl", "sum"]); // rf não é jogável

// ── parser posicional dos Create* do OpenMU ──────────────────────────────────
// Extrai a lista de argumentos "planos" (números + a string de nome) ANTES do
// primeiro token complexo (this./Stats./OptionType/null) — cobre wings, que têm
// BuildOptions(...) aninhado no fim.
function flatArgs(argStr) {
  // corta a partir do primeiro argumento complexo
  const cut = argStr.search(/\bthis\.|Stats\.|OptionType|SkillNumber|null\b|new /);
  const head = cut >= 0 ? argStr.slice(0, cut) : argStr;
  const toks = [];
  let buf = "", inStr = false;
  for (const ch of head) {
    if (ch === '"') { inStr = !inStr; buf += ch; continue; }
    if (ch === "," && !inStr) { toks.push(buf.trim()); buf = ""; continue; }
    buf += ch;
  }
  if (buf.trim()) toks.push(buf.trim());
  return toks.filter((t) => t.length);
}
function nameOf(toks) { const t = toks.find((x) => x.startsWith('"')); return t ? t.slice(1, -1) : null; }
function intsAfterName(toks) {
  const ni = toks.findIndex((x) => x.startsWith('"'));
  return toks.slice(ni + 1).map(Number).filter((n) => Number.isFinite(n));
}
function classesFromFlags(flags) {
  const out = [];
  flags.forEach((v, i) => { if (v > 0 && CLASS_TOKENS[i] && GAME_CLASSES.has(CLASS_TOKENS[i])) out.push(CLASS_TOKENS[i]); });
  return out;
}

// Cada método: como derivar (group,id) + quantos flags de classe no fim dos ints-pós-nome.
async function parseOpenMuNames() {
  const map = new Map(); // "g:id" -> { name, classes }
  const read = async (f) => { try { return await fs.readFile(path.join(OPENMU, f), "utf8"); } catch { return ""; } };

  const handle = (line, method) => {
    const m = line.match(new RegExp(`this\\.${method}\\((.*)\\)\\s*;`));
    if (!m) return null;
    const toks = flatArgs(m[1]);
    const name = nameOf(toks);
    if (!name) return null;
    return { toks, name };
  };
  const put = (g, id, name, classes) => { if (g != null && id != null) map.set(`${g}:${id}`, { name, classes }); };

  // Weapons: CreateWeapon(group, number, slot, skill, w, h, drops, name, ...ints, [7 classes])
  for (const line of (await read("Weapons.cs")).split("\n")) {
    const r = handle(line, "CreateWeapon"); if (!r) continue;
    const nums = r.toks.filter((t) => !t.startsWith('"')).map(Number);
    const group = nums[0], number = nums[1];
    const cls = classesFromFlags(intsAfterName(r.toks).slice(-7));
    put(group, number, r.name, cls);
  }
  // Armors: CreateArmor(number, slot{2:helm7,3:armor8,4:pants9}, w, h, name, ...ints, [7 classes])
  //         CreateShield(number, ...) -> g6 ; CreateGloves(number, name, ...[6]) -> g10 ;
  //         CreateBoots(number, name, ...[7]) -> g11
  const SLOT_GROUP = { 2: 7, 3: 8, 4: 9 };
  for (const line of (await read("Armors.cs")).split("\n")) {
    let r = handle(line, "CreateArmor");
    if (r) {
      const nums = r.toks.filter((t) => !t.startsWith('"')).map(Number);
      const number = nums[0], slot = nums[1], group = SLOT_GROUP[slot];
      if (group) put(group, number, r.name, classesFromFlags(intsAfterName(r.toks).slice(-7)));
      continue;
    }
    r = handle(line, "CreateShield");
    if (r) { const number = Number(r.toks[0]); put(6, number, r.name, classesFromFlags(intsAfterName(r.toks).slice(-7))); continue; }
    r = handle(line, "CreateGloves");
    if (r) { const number = Number(r.toks[0]); put(10, number, r.name, classesFromFlags(intsAfterName(r.toks).slice(-6))); continue; }
    r = handle(line, "CreateBoots");
    if (r) { const number = Number(r.toks[0]); put(11, number, r.name, classesFromFlags(intsAfterName(r.toks).slice(-7))); continue; }
  }
  // Wings: CreateWing(number, ?, ?, name, dropLevel, def, ?, ?, [7 classes], BuildOptions...)
  for (const line of (await read("Wings.cs")).split("\n")) {
    const r = handle(line, "CreateWing"); if (!r) continue;
    const number = Number(r.toks[0]);
    put(12, number, r.name, classesFromFlags(intsAfterName(r.toks).slice(-7)));
  }
  return map;
}

// ── resolve o casing real do arquivo de modelo em Data/Item ──────────────────
async function buildModelIndex() {
  const files = await fs.readdir(DATA_ITEM);
  const idx = new Map();
  for (const f of files) idx.set(f.toLowerCase(), f);
  return idx;
}

const GROUP_SLOT = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 2, 8: 3, 9: 4, 10: 5, 11: 6, 12: 7 };
const idFor = (g, n) => g * 1024 + n;

function powerFor(group, it) {
  if (group === 5) return { minMagic: it.damageMin, maxMagic: it.damageMax };       // staff/stick
  if (group <= 4) return { minPhys: it.damageMin, maxPhys: it.damageMax };            // sword..bow
  if (group === 6) return { defense: it.defense, defenseRate: it.defenseRate };        // shield
  return { defense: it.defense };                                                      // armor/wing
}

async function main() {
  const [{ items: bmd }, names, modelIdx] = await Promise.all([parseItemBmd(), parseOpenMuNames(), buildModelIndex()]);
  const bmdByKey = new Map();
  for (const it of bmd) bmdByKey.set(`${it.group}:${it.id}`, it);

  const catalog = [];
  let missingModel = 0, noBmd = 0;
  const sets = {}; // setKey -> { name, class, pieces:{helm,armor,pants,gloves,boots} }

  for (const [key, { name, classes }] of names) {
    const [g, n] = key.split(":").map(Number);
    const it = bmdByKey.get(key);
    if (!it) { noBmd++; continue; }
    // resolve arquivo de modelo real
    const base = (it.modelPath.split("/").pop() || "").toLowerCase();
    const realFile = modelIdx.get(base);
    if (!realFile && g <= 12) { missingModel++; }
    const slot = GROUP_SLOT[g] ?? null;

    const entry = {
      id: idFor(g, n), group: g, number: n, name,
      width: it.width || 1, height: it.height || 1, slot,
      dropLevel: it.dropLevel, maxLevel: g >= 6 && g <= 11 ? 15 : (g <= 5 ? 15 : (g === 12 ? 15 : 0)),
      durability: it.durability, value: it.itemValue || 0,
      twoHands: !!it.twoHands, dropsFromMonsters: it.dropLevel > 0,
      requirements: { level: it.reqLvl, str: it.reqStr, agi: it.reqDex, ene: it.reqEne, vit: it.reqVit, cmd: it.reqCmd },
      classes,
      power: powerFor(g, it),
      model: realFile || (it.modelPath.split("/").pop() || null),
    };
    catalog.push(entry);

    // set = mesmo `number` entre helm/armor/pants/gloves/boots (g7..g11)
    if (g >= 7 && g <= 11) {
      const pieceKey = { 7: "helm", 8: "armor", 9: "pants", 10: "gloves", 11: "boots" }[g];
      const setName = name.replace(/ (Helm|Mask|Armor|Pants|Gloves|Boots|Cap|Set)$/i, "").trim();
      const sk = `${setName}#${n}`;
      (sets[sk] ??= { name: setName, number: n, classes, pieces: {} }).pieces[pieceKey] = { id: entry.id, model: entry.model, name };
    }
  }

  // ── curados: group 13 (anéis/pendantes) + group 14 (jóias/poções) — sem skin/set;
  //    nomes (OpenMU Jewelery.cs) + modelos (item.bmd) AUTÊNTICOS, name↔skin batem ──
  const acc = (number, name, slot, dropLevel, value, model) => ({ id: idFor(13, number), group: 13, number, name, width: 1, height: 1, slot, dropLevel, maxLevel: 0, durability: 20, value, twoHands: false, dropsFromMonsters: true, requirements: { level: 0, str: 0, agi: 0, ene: 0, vit: 0, cmd: 0 }, classes: [], power: {}, model });
  const misc = (number, name, dropLevel, value, drops, model) => ({ id: idFor(14, number), group: 14, number, name, width: 1, height: 1, slot: null, dropLevel, maxLevel: 0, durability: 1, value, twoHands: false, dropsFromMonsters: drops, requirements: { level: 0, str: 0, agi: 0, ene: 0, vit: 0, cmd: 0 }, classes: [], power: {}, model });
  const curated = [
    acc(21, "Ring of Fire", 10, 30, 300, "firering.bmd"),
    acc(22, "Ring of Earth", 10, 38, 380, "groundring.bmd"),
    acc(23, "Ring of Wind", 10, 44, 440, "windring.bmd"),
    acc(24, "Ring of Magic", 10, 47, 470, "manaring.bmd"),
    acc(25, "Pendant of Ice", 9, 34, 340, "icenecklace.bmd"),
    acc(26, "Pendant of Wind", 9, 42, 420, "windnecklace.bmd"),
    acc(27, "Pendant of Water", 9, 46, 460, "waternecklace.bmd"),
    acc(28, "Pendant of Ability", 9, 50, 500, "agnecklace.bmd"),
    misc(0, "Apple", 1, 5, true, "Potion01.bmd"),
    misc(1, "Small Healing Potion", 10, 10, true, "Potion02.bmd"),
    misc(2, "Medium Healing Potion", 25, 20, true, "Potion03.bmd"),
    misc(3, "Large Healing Potion", 40, 30, true, "Potion04.bmd"),
    misc(13, "Jewel of Bless", 25, 150, false, "Jewel01.bmd"),
    misc(14, "Jewel of Soul", 30, 150, false, "Jewel02.bmd"),
    misc(22, "Jewel of Creation", 72, 300, false, "jewel22.bmd"),
  ];
  catalog.push(...curated);

  catalog.sort((a, b) => a.group - b.group || a.number - b.number);
  await fs.writeFile(OUT_ITEMS, JSON.stringify(catalog, null, 0).replace(/},{/g, "},\n{").replace(/^\[/, "[\n").replace(/\]$/, "\n]") + "\n");

  // só sets COMPLETOS (5 peças) viram set renderizável
  const fullSets = Object.fromEntries(Object.entries(sets).filter(([, s]) => Object.keys(s.pieces).length === 5));
  await fs.writeFile(OUT_SETS, JSON.stringify(fullSets, null, 2) + "\n");

  console.log(`✅ catálogo: ${catalog.length} itens (${catalog.length - curated.length} de OpenMU+item.bmd, ${curated.length} curados)`);
  console.log(`   sem match em item.bmd: ${noBmd} · modelo ausente em Data/Item: ${missingModel}`);
  console.log(`   sets completos (5 peças): ${Object.keys(fullSets).length}`);
  console.log(`   → ${OUT_ITEMS}`);
  console.log(`   → ${OUT_SETS}`);
}
main();
