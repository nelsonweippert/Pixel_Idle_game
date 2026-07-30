import { z } from "zod";
import { EntityKind, FormationSlot, VocationId } from "./primitives";
import { PROTOCOL_VERSION } from "./events";

/**
 * Snapshot — o estado completo entregue em toda (re)conexão, ANTES do stream
 * incremental de eventos. A UI React consome o snapshot/estado; a cena consome o
 * stream teatral. (Fase A: o NetClient local monta o snapshot a partir do core.)
 */

export const Combatant = z.object({
  entityId: z.string(),
  kind: EntityKind,
  name: z.string(),
  level: z.number().int(),
  hp: z.number(),
  maxHp: z.number(),
  vocation: VocationId.optional(),
  slot: FormationSlot,
  tint: z.number().int(),
});
export type Combatant = z.infer<typeof Combatant>;

export const LevelInfo = z.object({
  level: z.number().int(),
  xp: z.number(),
  xpToNext: z.number(),
  gold: z.number(),
  /** taxa de xp/h (base 100 = 1x) */
  xpRate: z.number(),
});
export type LevelInfo = z.infer<typeof LevelInfo>;

export const StaminaInfo = z.object({
  currentMs: z.number().nonnegative(),
  maxMs: z.number().positive(),
});
export type StaminaInfo = z.infer<typeof StaminaInfo>;

export const Snapshot = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  huntId: z.string(),
  regionId: z.string(),
  running: z.boolean(),
  simTimeMs: z.number().nonnegative(),
  heroes: z.array(Combatant),
  monsters: z.array(Combatant),
  level: LevelInfo,
  stamina: StaminaInfo,
});
export type Snapshot = z.infer<typeof Snapshot>;
