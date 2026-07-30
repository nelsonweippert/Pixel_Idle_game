/**
 * parse-item-bmd.mjs — decodifica MU-Webzen/Data/Local/item.bmd (fonte AUTORITATIVA
 * do cliente: para cada item, group/id → nome + modelPath + stats + requisitos).
 * Porta direta do parser de xulek (muonline-bmd-viewer/src/item-bmd.ts).
 * Uso: node tools/mu/parse-item-bmd.mjs [saida.json]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ITEM_BMD = "C:/Users/Storming/Desktop/GItHubs/MU-Webzen/Data/Local/item.bmd";
const XOR_KEY = [0xfc, 0xcf, 0xab];

function xor(buf) { for (let i = 0; i < buf.length; i++) buf[i] ^= XOR_KEY[i % 3]; }
function readStr(v, off, len) {
  if (off + len > v.byteLength) return "";
  const b = new Uint8Array(v.buffer, v.byteOffset + off, len);
  const z = b.indexOf(0);
  const s = z >= 0 ? b.subarray(0, z) : b;
  return new TextDecoder("windows-1252", { fatal: false }).decode(s).trim();
}
function normalize(p) { return p.split("\\").join("/").replace(/^\/+/, ""); }
function buildModelPath(folder, name) {
  const f = normalize(folder.trim()), n = normalize(name.trim());
  if (!n) return ""; if (!f) return n; if (n.includes("/")) return n;
  return f.endsWith("/") ? `${f}${n}` : `${f}/${n}`;
}

export async function parseItemBmd(file = ITEM_BMD) {
  const buf = await fs.readFile(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const view = new DataView(ab);
  const itemCount = view.getInt32(0, true);
  const bytesPerItem = Math.floor((view.byteLength - 8) / itemCount);
  const items = [];
  let offset = 4;
  for (let i = 0; i < itemCount && offset + bytesPerItem <= view.byteLength - 4; i++) {
    const copy = new Uint8Array(ab.slice(offset, offset + bytesPerItem));
    xor(copy);
    const v = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
    const group = v.getUint16(4, true), id = v.getUint16(6, true);
    const modelFolder = readStr(v, 8, 260), modelName = readStr(v, 268, 260), itemName = readStr(v, 528, 64);
    items.push({
      index: v.getInt32(0, true), group, id,
      itemName, modelPath: buildModelPath(modelFolder, modelName), modelName,
      twoHands: copy[595] !== 0,
      dropLevel: v.getUint16(596, true), slot: v.getUint16(598, true), skillIndex: v.getUint16(600, true),
      width: copy[602], height: copy[603],
      damageMin: v.getUint16(604, true), damageMax: v.getUint16(606, true),
      defenseRate: v.getUint16(608, true), defense: v.getUint16(610, true),
      magicResistance: v.getUint16(612, true), attackSpeed: copy[614], durability: copy[616],
      reqStr: bytesPerItem > 630 ? v.getUint16(628, true) : 0,
      reqDex: bytesPerItem > 632 ? v.getUint16(630, true) : 0,
      reqEne: bytesPerItem > 634 ? v.getUint16(632, true) : 0,
      reqVit: bytesPerItem > 636 ? v.getUint16(634, true) : 0,
      reqCmd: bytesPerItem > 638 ? v.getUint16(636, true) : 0,
      reqLvl: bytesPerItem > 640 ? v.getUint16(638, true) : 0,
      itemValue: bytesPerItem > 644 ? v.getInt32(640, true) : 0,
      money: bytesPerItem > 648 ? v.getInt32(644, true) : 0,
    });
    offset += bytesPerItem;
  }
  return { itemCount, bytesPerItem, items };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { itemCount, bytesPerItem, items } = await parseItemBmd();
  const named = items.filter((it) => it.itemName && it.itemName !== "");
  console.log(`itemCount=${itemCount} bytesPerItem=${bytesPerItem} · com nome: ${named.length}`);
  // grupos presentes
  const byGroup = {};
  for (const it of named) (byGroup[it.group] ??= []).push(it);
  for (const g of Object.keys(byGroup).map(Number).sort((a,b)=>a-b))
    console.log(`  grupo ${g}: ${byGroup[g].length} itens`);
  const out = process.argv.find((a) => a.endsWith(".json")) || "item-bmd-dump.json";
  await fs.writeFile(out, JSON.stringify(named, null, 0));
  console.log(`✅ ${named.length} itens → ${out}`);
}
