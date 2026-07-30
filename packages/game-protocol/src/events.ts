import { z } from "zod";
import { DamageKind, EntityKind, FormationSlot, ItemDrop, VocationId } from "./primitives";

/**
 * Eventos da simulação (server → client). Discriminados por `type`. SEM posições
 * finas — a cena coreografa (AD-003). Todo evento carrega `atSimMs` (tempo de sim
 * em que ocorreu) pra a cena agendar a coreografia e pra os relatórios offline da
 * Fase B serem auto-descritivos.
 */

export const PROTOCOL_VERSION = 1;

/** entrou em cena um herói ou monstro */
export const SpawnEvent = z.object({
  type: z.literal("spawn"),
  atSimMs: z.number().nonnegative(),
  entityId: z.string(),
  kind: EntityKind,
  name: z.string(),
  level: z.number().int(),
  hp: z.number(),
  maxHp: z.number(),
  /** só heróis */
  vocation: VocationId.optional(),
  /** slot lógico — o client resolve o pixel */
  slot: FormationSlot,
  /** cor placeholder (0xRRGGBB) enquanto o asset real não entra */
  tint: z.number().int(),
});
export type SpawnEvent = z.infer<typeof SpawnEvent>;

/** um golpe (ou cura) resolvido — a sim já aplicou; a cena só pinta */
export const DamageEvent = z.object({
  type: z.literal("damage"),
  atSimMs: z.number().nonnegative(),
  sourceId: z.string(),
  targetId: z.string(),
  amount: z.number(),
  kind: DamageKind,
  /** hp do alvo DEPOIS do golpe — a cena não recomputa regra nenhuma */
  hpAfter: z.number(),
});
export type DamageEvent = z.infer<typeof DamageEvent>;

/** uma entidade morreu */
export const KillEvent = z.object({
  type: z.literal("kill"),
  atSimMs: z.number().nonnegative(),
  entityId: z.string(),
  /** quem desferiu o golpe fatal */
  by: z.string(),
});
export type KillEvent = z.infer<typeof KillEvent>;

/** caiu loot de um kill */
export const DropEvent = z.object({
  type: z.literal("drop"),
  atSimMs: z.number().nonnegative(),
  fromName: z.string(),
  item: ItemDrop,
});
export type DropEvent = z.infer<typeof DropEvent>;

/** um char subiu de nível */
export const LevelUpEvent = z.object({
  type: z.literal("levelUp"),
  atSimMs: z.number().nonnegative(),
  charId: z.string(),
  level: z.number().int(),
});
export type LevelUpEvent = z.infer<typeof LevelUpEvent>;

/** a sessão de hunt encerrou */
export const SessionEndEvent = z.object({
  type: z.literal("sessionEnd"),
  atSimMs: z.number().nonnegative(),
  cause: z.enum(["stamina", "death", "manual"]),
});
export type SessionEndEvent = z.infer<typeof SessionEndEvent>;

export const SimEvent = z.discriminatedUnion("type", [
  SpawnEvent,
  DamageEvent,
  KillEvent,
  DropEvent,
  LevelUpEvent,
  SessionEndEvent,
]);
export type SimEvent = z.infer<typeof SimEvent>;
