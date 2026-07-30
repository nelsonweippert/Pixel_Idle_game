import { z } from "zod";

/**
 * Primitivos do contrato — os enums de nível de wire são a FONTE DE VERDADE aqui
 * (o client teatral importa só este pacote). game-core e shared alinham a estes
 * literais por construção.
 */

export const VocationId = z.enum(["knight", "cleric", "sorcerer", "ranger"]);
export type VocationId = z.infer<typeof VocationId>;

export const Rarity = z.enum(["common", "uncommon", "rare", "epic", "legendary"]);
export type Rarity = z.infer<typeof Rarity>;

/** física/mágica/cura/crítico — como o dano é pintado pela cena */
export const DamageKind = z.enum(["physical", "magic", "heal", "crit"]);
export type DamageKind = z.infer<typeof DamageKind>;

export const EntityKind = z.enum(["hero", "monster"]);
export type EntityKind = z.infer<typeof EntityKind>;

/**
 * Slot LÓGICO de formação — NÃO é pixel nem tile (AD-003: a simulação não decide
 * posição; o client teatral mapeia slot → tile → pixel e coreografa). `row` separa
 * linha de frente (tank/melee) de trás (ranged/caster); `index` é o ordinal dentro
 * da linha ou do "campo" de monstros.
 */
export const FormationSlot = z.object({
  row: z.enum(["front", "back"]),
  index: z.number().int().min(0),
});
export type FormationSlot = z.infer<typeof FormationSlot>;

/** um item que caiu — o que a cena precisa pra mostrar no feed de loot */
export const ItemDrop = z.object({
  id: z.number().int(),
  name: z.string(),
  rarity: Rarity,
  value: z.number().int().nonnegative(),
  amount: z.number().int().positive(),
});
export type ItemDrop = z.infer<typeof ItemDrop>;
