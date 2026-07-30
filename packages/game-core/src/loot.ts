/**
 * Loot — DROP DO MU (mu/drops) contra o catálogo do bundle. Produz instâncias reais
 * (ItemInstance com +level/luck/opção/excellent) e as converte pro ItemDrop do
 * protocolo (feed da cena). Determinístico via RngCursor.
 */
import type { ItemDrop } from "@pixel-idle/game-protocol";
import { instanceRarity, resolveDrop, type DropResult, type ItemDefinition, type ItemInstance } from "@pixel-idle/shared";
import type { RngCursor } from "./rng";
import type { ContentBundle } from "./content/index";
import type { Monster } from "./session";

/** resolve 1 drop de kill pelo sistema MU (grupos money/item/jewel/excellent) */
export function rollMuDrop(
  content: ContentBundle,
  rng: RngCursor,
  m: Monster,
  gainedXp: number,
  uid: number,
): DropResult {
  return resolveDrop(content.muItemList, m.level, gainedXp, rng, uid);
}

/** instância MU → ItemDrop do protocolo (feed/loot da cena) */
export function dropToWire(inst: ItemInstance, def: ItemDefinition): ItemDrop {
  const plus = inst.level > 0 ? ` +${inst.level}` : "";
  const exc = inst.excellent.length ? " (Exc)" : "";
  return { id: inst.uid, name: `${def.name}${plus}${exc}`, rarity: instanceRarity(inst), value: def.value, amount: 1 };
}
