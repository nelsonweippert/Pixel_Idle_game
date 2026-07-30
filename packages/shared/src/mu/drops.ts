/**
 * mu/drops.ts — SISTEMA DE DROP do MU (Season 6), portado do OpenMU
 * (DefaultDropGenerator + AddItemDropGroups).
 *
 * Drop groups padrão de todo mapa normal (1 drop por kill, roleta ponderada):
 *   money 0.50 · randomItem 0.30 · jewel 0.001 · excellent 0.0001 · resto = nada.
 * item-level no drop = min( floor((mobLevel - dropLevel)/3), maxLevel ).
 * Puro/determinístico: recebe um Roller (o RngCursor do game-core).
 */
import type { Roller } from "./combat";
import { ItemGroup, type ItemDefinition, type ItemInstance } from "./items";

// constantes do OpenMU
export const BASE_MONEY_DROP = 7;
export const DROP_LEVEL_MAX_GAP = 12;
export const MAX_ITEM_OPTION_LEVEL_DROP = 3;
export const EXCELLENT_DROP_LEVEL_DELTA = 25;
export const SKILL_DROP_CHANCE = 0.5;

const CHANCE_MONEY = 0.5;
const CHANCE_ITEM = 0.3;
const CHANCE_JEWEL = 0.001;
const CHANCE_EXCELLENT = 0.0001;

export type DropResult =
  | { kind: "none" }
  | { kind: "money"; money: number }
  | { kind: "item"; instance: ItemInstance; def: ItemDefinition; excellent: boolean };

/** +level do item ao dropar, dado o nível do monstro */
export function itemLevelForDrop(monsterLevel: number, dropLevel: number, maxLevel: number): number {
  return Math.max(0, Math.min(Math.floor((monsterLevel - dropLevel) / 3), maxLevel));
}

function isJewel(def: ItemDefinition): boolean {
  return def.slot === null && /jewel|gemstone/i.test(def.name);
}
function isEquippable(def: ItemDefinition): boolean {
  return def.slot !== null;
}
function canHaveSkill(def: ItemDefinition): boolean {
  return def.group <= ItemGroup.Staffs; // armas
}

/** itens de equipamento que podem dropar naquele nível de monstro (com gap do MU) */
export function droppableItems(catalog: ItemDefinition[], monsterLevel: number): ItemDefinition[] {
  return catalog.filter(
    (d) =>
      d.dropsFromMonsters &&
      isEquippable(d) &&
      d.dropLevel <= monsterLevel &&
      monsterLevel - d.dropLevel <= DROP_LEVEL_MAX_GAP,
  );
}

/** monta uma instância a partir da definição, com rolls do MU (level/luck/opção/skill/exc) */
export function rollItemInstance(
  def: ItemDefinition,
  monsterLevel: number,
  roller: Roller,
  uid: number,
  excellent = false,
): ItemInstance {
  const level = itemLevelForDrop(monsterLevel, def.dropLevel, def.maxLevel);
  const luck = roller.chance(0.25);
  const option = roller.chance(0.25) ? 1 + Math.floor(roller.float() * MAX_ITEM_OPTION_LEVEL_DROP) : 0;
  const skill = canHaveSkill(def) && (excellent || roller.chance(SKILL_DROP_CHANCE));
  const exc: number[] = [];
  if (excellent) {
    exc.push(1 + Math.floor(roller.float() * 6)); // 1ª opção excellent garantida
    for (let bit = 1; bit <= 6; bit++) if (!exc.includes(bit) && roller.chance(0.001)) exc.push(bit);
  }
  return { uid, defId: def.id, level, durability: def.durability, luck, skill, option, excellent: exc, sockets: [] };
}

/**
 * resolveDrop — 1 kill → 1 drop (roleta dos grupos padrão). `gainedXp` alimenta o
 * dinheiro (money = gainedXp + BASE_MONEY_DROP, regra do OpenMU).
 */
export function resolveDrop(
  catalog: ItemDefinition[],
  monsterLevel: number,
  gainedXp: number,
  roller: Roller,
  uid: number,
): DropResult {
  const t = roller.float();
  // excellent (mais raro) → item comum → jewel → money → nada
  if (t < CHANCE_EXCELLENT && monsterLevel >= EXCELLENT_DROP_LEVEL_DELTA) {
    const pool = droppableItems(catalog, monsterLevel - EXCELLENT_DROP_LEVEL_DELTA);
    if (pool.length) {
      const def = pool[Math.floor(roller.float() * pool.length)];
      return { kind: "item", def, instance: rollItemInstance(def, monsterLevel, roller, uid, true), excellent: true };
    }
  }
  if (t < CHANCE_EXCELLENT + CHANCE_JEWEL) {
    const jewels = catalog.filter(isJewel);
    if (jewels.length) {
      const def = jewels[Math.floor(roller.float() * jewels.length)];
      return { kind: "item", def, instance: rollItemInstance(def, monsterLevel, roller, uid), excellent: false };
    }
  }
  if (t < CHANCE_EXCELLENT + CHANCE_JEWEL + CHANCE_ITEM) {
    const pool = droppableItems(catalog, monsterLevel);
    if (pool.length) {
      const def = pool[Math.floor(roller.float() * pool.length)];
      return { kind: "item", def, instance: rollItemInstance(def, monsterLevel, roller, uid), excellent: false };
    }
  }
  if (t < CHANCE_EXCELLENT + CHANCE_JEWEL + CHANCE_ITEM + CHANCE_MONEY) {
    return { kind: "money", money: Math.max(1, Math.round(gainedXp + BASE_MONEY_DROP)) };
  }
  return { kind: "none" };
}

// ── qualidade → raridade (pro feed/UI atual, que usa Rarity de 5 níveis) ─────
export function instanceRarity(inst: ItemInstance): "common" | "uncommon" | "rare" | "epic" | "legendary" {
  if (inst.excellent.length >= 2) return "legendary";
  if (inst.excellent.length === 1) return "epic";
  if (inst.luck || inst.option >= 2 || inst.level >= 7) return "rare";
  if (inst.option >= 1 || inst.level >= 3 || inst.skill) return "uncommon";
  return "common";
}
