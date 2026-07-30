/**
 * mu/combat.ts — RESOLUÇÃO DE ATAQUE do MU (PvM), portado do OpenMU.
 *
 * Fluxo: hit-check (attackRate vs defenseRate) → dano base = rand(min,max) →
 * tipos especiais (excellent +20%, crítico ignora defesa) → subtrai defesa → piso.
 * Puro e determinístico: recebe um "roller" (o RngCursor do game-core), nunca
 * Math.random. Assim online e offline batem bit-a-bit.
 */
import type { DerivedStats } from "./stats";

/** interface mínima do RNG que o combate precisa (o RngCursor do game-core implementa) */
export interface Roller {
  float(): number;
  range(min: number, max: number): number;
  chance(p: number): boolean;
}

export type HitKind = "physical" | "magic" | "crit" | "excellent" | "miss";

export interface HitResult {
  amount: number;
  kind: HitKind;
}

/** defensor genérico (herói ou monstro) — só o que a resolução precisa */
export interface Defender {
  defense: number;
  defenseRate: number;
}

/** chance de acerto PvM: alta base, defenseRate do alvo reduz. Clamp [0.25, 0.99]. */
export function hitChance(attackRate: number, def: Defender): number {
  const c = attackRate / (attackRate + def.defenseRate * 1.4 + 1);
  return Math.min(0.99, Math.max(0.25, c));
}

interface SpecialRoll {
  kind: HitKind;
  mult: number;
  ignoreDef: boolean;
}

function rollSpecial(roller: Roller, crit: number, exc: number, physical: boolean): SpecialRoll {
  // excellent tem prioridade (raro, +20%, ignora defesa); depois crítico (ignora defesa)
  if (roller.chance(exc)) return { kind: "excellent", mult: 1.2, ignoreDef: true };
  if (roller.chance(crit)) return { kind: "crit", mult: 1.0, ignoreDef: true };
  return { kind: physical ? "physical" : "magic", mult: 1.0, ignoreDef: false };
}

/** ataque FÍSICO (min/maxPhys). Retorna {amount, kind} — miss => amount 0. */
export function resolvePhysical(atk: DerivedStats, def: Defender, roller: Roller): HitResult {
  if (!roller.chance(hitChance(atk.attackRate, def))) return { amount: 0, kind: "miss" };
  const base = roller.range(atk.minPhys, atk.maxPhys);
  const sp = rollSpecial(roller, atk.critChance, atk.excellentChance, true);
  const raw = base * sp.mult - (sp.ignoreDef ? 0 : def.defense);
  const amount = Math.max(Math.round(raw), Math.max(1, Math.round(base * 0.15)));
  return { amount, kind: sp.kind };
}

/** ataque MÁGICO (min/maxMagic). Mesma mecânica, dano mágico. */
export function resolveMagic(atk: DerivedStats, def: Defender, roller: Roller): HitResult {
  if (!roller.chance(hitChance(atk.attackRate, def))) return { amount: 0, kind: "miss" };
  const base = roller.range(atk.minMagic, atk.maxMagic);
  const sp = rollSpecial(roller, atk.critChance, atk.excellentChance, false);
  const raw = base * sp.mult - (sp.ignoreDef ? 0 : def.defense);
  const amount = Math.max(Math.round(raw), Math.max(1, Math.round(base * 0.15)));
  return { amount, kind: sp.kind };
}

// ─────────────────────────────────────────────────────────────────────────────
// Monstros: CreatureDef tem só {attack, level, hp}. Derivamos ofensa/defesa do MU
// a partir disso (escala por nível) até termos MonsterDefinition completo.
// ─────────────────────────────────────────────────────────────────────────────
export interface MonsterCombat extends DerivedStats {}

export function monsterCombat(attack: number, level: number): MonsterCombat {
  return {
    maxHp: 0,
    maxMana: 0,
    minPhys: Math.max(1, Math.round(attack * 0.85)),
    maxPhys: Math.max(1, Math.round(attack * 1.15)),
    minMagic: 0,
    maxMagic: 0,
    defense: Math.round(level * 0.6),
    defenseRate: Math.round(level * 1.0),
    attackRate: Math.round(level * 5 + 20),
    critChance: 0.03,
    excellentChance: 0,
  };
}
