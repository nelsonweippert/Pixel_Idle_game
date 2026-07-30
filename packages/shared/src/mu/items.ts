/**
 * mu/items.ts — MODELO DE ITENS do MU (Season 6), portado do OpenMU.
 *
 * ItemDefinition = catálogo (grupo/número/nome/slot/base power-ups/requisitos).
 * ItemInstance   = uma instância dropada/equipada (+level, excellent, luck, skill,
 *                  opção normal, ancient, sockets).
 * As tabelas de bônus por +level e o efeito das opções vêm do OpenMU
 * (InitializerBase.CreateItemBonusTable, ExcellentOptions.cs).
 *
 * `gearTermsFromEquipment` agrega os itens equipados em GearTerms — é a costura que
 * SUBSTITUI o `assumedGear` (stand-in) quando o inventário real existir (fase 3/4).
 */
import { ZERO_GEAR, type GearTerms } from "./stats";

// ── Grupos (ItemGroups.cs) ──────────────────────────────────────────────────
export enum ItemGroup {
  Swords = 0,
  Axes = 1,
  Scepters = 2,
  Spears = 3,
  Bows = 4,
  Staffs = 5,
  Shields = 6,
  Helm = 7,
  Armor = 8,
  Pants = 9,
  Gloves = 10,
  Boots = 11,
  Wings = 12,
  Misc1 = 13, // pets, rings, pendants
  Potions = 14,
  Scrolls = 15,
}

// ── Slots de equipamento (12 posições físicas, InventoryConstants) ───────────
export enum EquipSlot {
  WeaponRight = 0,
  WeaponLeft = 1,
  Helm = 2,
  Armor = 3,
  Pants = 4,
  Gloves = 5,
  Boots = 6,
  Wings = 7,
  Pet = 8,
  Pendant = 9,
  Ring1 = 10,
  Ring2 = 11,
}
export const EQUIP_SLOT_COUNT = 12;

// ── Requisitos / classes que podem usar ─────────────────────────────────────
export interface ItemRequirements {
  level: number;
  str: number;
  agi: number;
  ene: number;
  vit: number;
  cmd: number;
}

/** power-ups base do item (valores em +0). Multiplicados pelo +level via tabela. */
export interface ItemBasePowerUp {
  minPhys?: number;
  maxPhys?: number;
  minMagic?: number;
  maxMagic?: number;
  defense?: number;
  defenseRate?: number;
  attackSpeed?: number;
}

export interface ItemDefinition {
  /** id estável = group*1024 + number (convenção ITEM(g,n) do MU) */
  id: number;
  /** arma de 2 mãos (ocupa os dois slots) */
  twoHands?: boolean;
  group: ItemGroup;
  number: number;
  name: string;
  width: number;
  height: number;
  slot: EquipSlot | null; // null = consumível/não-equipável
  dropLevel: number;
  maxLevel: number; // teto de +level (15 em gear)
  durability: number;
  value: number;
  dropsFromMonsters: boolean;
  requirements: ItemRequirements;
  /** classes MU que podem equipar (dw/dk/elf/mg/dl/sum). Vazio = todas. */
  classes: string[];
  power: ItemBasePowerUp;
  /** modelo BMD no cliente MU (Data/Item/<file>.bmd) — pro pipeline de ícone */
  model?: string;
}

// ── Opções excellent (ExcellentOptions.cs) ──────────────────────────────────
// Bit 1..6. Conjunto de ataque (físico/mágico) e de defesa diferem.
export type ExcAttack = 1 | 2 | 3 | 4 | 5 | 6;
export type ExcDefense = 1 | 2 | 3 | 4 | 5 | 6;

// ── Instância de item ────────────────────────────────────────────────────────
export interface ItemInstance {
  /** id único da instância (seq do jogo) */
  uid: number;
  defId: number; // aponta pra ItemDefinition.id
  level: number; // +0..+15
  durability: number;
  luck: boolean; // +5% crit
  skill: boolean; // concede skill do item
  /** nível da opção normal (0 = sem; 1..4 = +4/+8/+12/+16) */
  option: number;
  /** bits de opções excellent presentes */
  excellent: number[];
  ancientSetId?: number;
  sockets: number[];
}

// ── Tabelas de bônus por +level (InitializerBase.CreateItemBonusTable) ───────
const DMG_DEF_BONUS = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 31, 36, 42, 49, 57, 66];
const SHIELD_BONUS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export function weaponLevelBonus(level: number): number {
  return DMG_DEF_BONUS[Math.min(level, 15)] ?? 0;
}
export function armorLevelBonus(level: number): number {
  return DMG_DEF_BONUS[Math.min(level, 15)] ?? 0;
}
export function shieldLevelBonus(level: number): number {
  return SHIELD_BONUS[Math.min(level, 15)] ?? 0;
}

// opção normal: +4 por nível (1..4 → +4/+8/+12/+16)
export function normalOptionBonus(optionLevel: number): number {
  return optionLevel * 4;
}

// ── Regra de uso (classe + requisitos de atributo) ───────────────────────────
export interface CharReqContext {
  muClass: string; // dw/dk/elf/mg/dl/sum
  level: number;
  str: number;
  agi: number;
  ene: number;
  vit: number;
  cmd: number;
}

/** canUseItem — pode este personagem equipar/usar este item? Checa classe permitida e
 *  requisitos de nível/atributo (regra do MU). Retorna o 1º requisito não cumprido. */
export function canUseItem(def: ItemDefinition, c: CharReqContext): { ok: boolean; reason?: string } {
  if (def.classes.length && !def.classes.includes(c.muClass)) return { ok: false, reason: "classe" };
  const r = def.requirements;
  if (c.level < r.level) return { ok: false, reason: "nível" };
  if (c.str < r.str) return { ok: false, reason: "força" };
  if (c.agi < r.agi) return { ok: false, reason: "agilidade" };
  if (c.ene < r.ene) return { ok: false, reason: "energia" };
  if (c.vit < r.vit) return { ok: false, reason: "vitalidade" };
  if (c.cmd < r.cmd) return { ok: false, reason: "comando" };
  return { ok: true };
}

/**
 * gearTermsFromEquipment — soma os itens equipados em GearTerms (o que o motor de
 * stats consome). Substitui `assumedGear` quando o inventário real existir.
 */
export function gearTermsFromEquipment(items: Array<{ def: ItemDefinition; inst: ItemInstance }>): GearTerms {
  const g: GearTerms = { ...ZERO_GEAR };
  for (const { def, inst } of items) {
    const isShield = def.group === ItemGroup.Shields;
    const lvlBonus = isShield ? shieldLevelBonus(inst.level) : def.power.defense != null ? armorLevelBonus(inst.level) : weaponLevelBonus(inst.level);
    const opt = normalOptionBonus(inst.option);

    if (def.power.minPhys != null) g.weaponMin += def.power.minPhys + lvlBonus + opt;
    if (def.power.maxPhys != null) g.weaponMax += def.power.maxPhys + lvlBonus + opt;
    if (def.power.minMagic != null) g.magicMin += def.power.minMagic + lvlBonus + opt;
    if (def.power.maxMagic != null) g.magicMax += def.power.maxMagic + lvlBonus + opt;
    if (def.power.defense != null) g.armorDef += def.power.defense + lvlBonus + (def.power.minPhys == null ? opt : 0);
    if (def.power.defenseRate != null) g.armorDefRate += def.power.defenseRate;

    if (inst.luck) g.critChance += 0.05;
    // excellent bit 6 (ataque) = +10% chance de excellent
    if (inst.excellent.includes(6)) g.excellentChance += 0.1;
  }
  return g;
}
