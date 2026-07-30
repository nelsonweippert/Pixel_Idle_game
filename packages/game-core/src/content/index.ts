/**
 * ContentBundle — os dados canônicos de game design injetados no core.
 *
 * O core NUNCA lê disco: o caller (NetClient hoje, servidor amanhã) monta o bundle
 * e passa via ctx. Fase A: a fonte são os dados que já existem em @pixel-idle/shared
 * (VOCATIONS + REGIONS) + as tabelas de loot (migradas do MockEngine). Migrar os
 * números pra content/*.json (balancear sem deploy) é follow-up.
 */
import type { VocationDef, RegionDef, ItemDefinition } from "@pixel-idle/shared";
import { VOCATIONS, REGIONS, REGION_BY_ID, LOOT_TABLE, XP_CURVE, MU_ITEMS, MU_ITEM_LIST } from "@pixel-idle/shared";
import type { Rarity, VocationId } from "@pixel-idle/game-protocol";

export interface LootTables {
  names: Record<Rarity, string[]>;
  rarityWeights: ReadonlyArray<readonly [Rarity, number]>;
}

export interface ContentBundle {
  vocations: Record<VocationId, VocationDef>;
  regions: Record<string, RegionDef>;
  regionList: RegionDef[];
  loot: LootTables;
  /** curva de XP: base * level^exp */
  xpCurve: { base: number; exp: number };
  /** catálogo de itens MU (S6) — fonte dos drops e do inventário */
  muItems: Record<number, ItemDefinition>;
  muItemList: ItemDefinition[];
}

/** monta o bundle a partir de @pixel-idle/shared (dados canônicos em JSON) — puro */
export function buildContentBundle(): ContentBundle {
  return {
    vocations: VOCATIONS,
    regions: REGION_BY_ID,
    regionList: REGIONS,
    loot: { names: LOOT_TABLE.names, rarityWeights: LOOT_TABLE.rarityWeights },
    xpCurve: { base: XP_CURVE.base, exp: XP_CURVE.exp },
    muItems: MU_ITEMS,
    muItemList: MU_ITEM_LIST,
  };
}
