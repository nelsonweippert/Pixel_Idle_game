/**
 * mu/catalog.ts — CATÁLOGO DE ITENS S6 carregado do JSON canônico.
 * `shared/content/mu-items.json` = itens portados do OpenMU (grupo/número/slot/power/
 * requisitos/classes). Editar = balancear sem tocar código.
 */
import raw from "../../content/mu-items.json";
import type { ItemDefinition } from "./items";

export const MU_ITEM_LIST = raw as unknown as ItemDefinition[];

/** id (= group*1024 + number) → definição */
export const MU_ITEMS: Record<number, ItemDefinition> = Object.fromEntries(
  MU_ITEM_LIST.map((d) => [d.id, d]),
);

export function itemDef(id: number): ItemDefinition | undefined {
  return MU_ITEMS[id];
}
