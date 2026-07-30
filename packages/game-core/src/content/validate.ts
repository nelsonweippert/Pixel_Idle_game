/**
 * Validação de integridade do ContentBundle. Roda em teste/boot, NUNCA em runtime —
 * referência quebrada em produção é impossível por construção. Falha = lança com a
 * lista completa de erros (não pára no primeiro).
 */
import type { Rarity } from "@pixel-idle/game-protocol";
import type { ContentBundle } from "./index";

const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

export function validateContent(b: ContentBundle): void {
  const errs: string[] = [];

  const vocs = Object.values(b.vocations);
  if (vocs.length === 0) errs.push("nenhuma vocação");
  for (const v of vocs) {
    if (!v.base || v.base.hp <= 0) errs.push(`vocação ${v.id}: base.hp inválido`);
    if (v.base && v.base.attackSpeedMs <= 0) errs.push(`vocação ${v.id}: attackSpeedMs inválido`);
  }

  if (b.regionList.length === 0) errs.push("nenhuma região");
  for (const r of b.regionList) {
    if (r.creatures.length === 0) errs.push(`região ${r.id}: sem criaturas`);
    for (const c of r.creatures) {
      if (c.hp <= 0) errs.push(`criatura ${c.name} (${r.id}): hp<=0`);
      if (c.xp < 0) errs.push(`criatura ${c.name} (${r.id}): xp negativo`);
    }
    if (!b.regions[r.id]) errs.push(`região ${r.id}: ausente no índice regions[]`);
  }

  for (const rar of RARITIES) {
    if (!b.loot.names[rar]?.length) errs.push(`loot: pool "${rar}" vazio`);
  }
  if (b.loot.rarityWeights.reduce((s, [, w]) => s + w, 0) <= 0) {
    errs.push("loot: soma de pesos de raridade <= 0");
  }

  if (b.xpCurve.base <= 0 || b.xpCurve.exp <= 0) errs.push("xpCurve inválida");

  if (errs.length) {
    throw new Error(`ContentBundle inválido:\n- ${errs.join("\n- ")}`);
  }
}
