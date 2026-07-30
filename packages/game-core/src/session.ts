/**
 * SessionState — a UNIDADE de simulação (AD-002 do MU): participantes + spot +
 * suprimentos + config. Shape 100% serializável (nada de bigint/função/Date), pra
 * persistir/reidratar e continuar bit-a-bit. Serve online (tick 1Hz) e offline
 * (fast-forward) com o MESMO código.
 *
 * Fase A: 1 conta = 1 classe (sessão N-participante). O NetClient local monta uma
 * party de 4 pra demo; o server real terá 1..4 contas por sessão.
 */
import type { VocationDef, RegionDef, CombatRole } from "@pixel-idle/shared";
import { deriveVocation, type BaseAttrs, type DerivedStats, type ItemInstance, type MuClassId, type VocId } from "@pixel-idle/shared";
import type { VocationId } from "@pixel-idle/game-protocol";
import { createRng, RngCursor, type RngState } from "./rng";
import type { ContentBundle } from "./content/index";
import { xpForLevel } from "./rewards";

export const SIM_VERSION = 1;
export const SIM_STEP_MS = 1000;
export const MAX_MONSTERS = 4;

const DEFAULT_STAMINA_MS = 12 * 60 * 60 * 1000; // 12h (AD-012)
const DEFAULT_PARTY: VocationId[] = ["knight", "ranger", "sorcerer", "cleric"];

/** um herói na sessão — setup congelado no início (freezeSetup) */
export interface Participant {
  charId: string;
  vocation: VocationId;
  name: string;
  role: CombatRole;
  level: number;
  maxHp: number;
  hp: number;
  /** resumo (média phys ou magic) — HUD/back-compat; combate usa `mu` (min/max) */
  attack: number;
  defense: number;
  attackSpeedMs: number;
  /** classe MU (dk/dw/elf/...) e atributos MU (STR/AGI/VIT/ENE/CMD) */
  muClass: MuClassId;
  attrs: BaseAttrs;
  /** stats derivados MU completos (dano min/max, attackRate, crit/exc...) */
  mu: DerivedStats;
  /** slot lógico de formação (row + ordinal); o client resolve o pixel */
  slot: { row: "front" | "back"; index: number };
  /** ms até o próximo ataque */
  cooldownMs: number;
  tint: number;
}

/** um monstro no campo */
export interface Monster {
  id: string;
  defId: number;
  name: string;
  level: number;
  maxHp: number;
  hp: number;
  attack: number;
  xp: number;
  tint: number;
  /** índice lógico no campo (0..MAX-1) — o client resolve o pixel */
  slotIndex: number;
  cooldownMs: number;
}

export interface LevelInfo {
  level: number;
  xp: number;
  xpToNext: number;
  gold: number;
  xpRate: number;
}

export interface StaminaInfo {
  currentMs: number;
  maxMs: number;
}

export interface SessionState {
  simVersion: number;
  huntId: string;
  regionId: string;
  running: boolean;
  endCause?: "stamina" | "death" | "manual";
  simTimeMs: number;
  rng: RngState;
  participants: Participant[];
  monsters: Monster[];
  nextMonsterSeq: number;
  nextItemSeq: number;
  /** uid incremental das instâncias de item dropadas */
  nextItemUid: number;
  respawnTimerMs: number;
  /** mochila da sessão: instâncias MU dropadas (cap aplicado no push) */
  loot: ItemInstance[];
  /** Fase A: progressão compartilhada da sessão (demo). Vira per-char com contas. */
  level: LevelInfo;
  stamina: StaminaInfo;
}

export interface CreateSessionOpts {
  huntId: string;
  seed: number | bigint;
  regionId?: string;
  startLevel?: number;
  vocations?: VocationId[];
  staminaMaxMs?: number;
}

export interface SimContext {
  content: ContentBundle;
}

/** deriva os stats de um herói no nível dado — FÓRMULAS DO MU (mu/stats) */
function deriveParticipant(v: VocationDef, level: number, rowIndex: number): Participant {
  const { attrs, cls, derived } = deriveVocation(v.id as VocId, level);
  const isCaster = v.role === "mage" || v.role === "healer";
  const attack = Math.round(isCaster ? (derived.minMagic + derived.maxMagic) / 2 : (derived.minPhys + derived.maxPhys) / 2);
  return {
    charId: `hero_${v.id}`,
    vocation: v.id,
    name: v.name,
    role: v.role,
    level,
    maxHp: derived.maxHp,
    hp: derived.maxHp,
    attack,
    defense: derived.defense,
    attackSpeedMs: v.base.attackSpeedMs,
    muClass: cls,
    attrs,
    mu: derived,
    slot: { row: v.row, index: rowIndex },
    cooldownMs: 0,
    tint: v.color,
  };
}

function pickRegionForLevel(content: ContentBundle, level: number): RegionDef {
  return (
    [...content.regionList].reverse().find((r) => level >= r.levelRange[0]) ??
    content.regionList[0]
  );
}

/**
 * spawnMonster — insere um monstro no menor slot livre do campo. Usa o cursor de RNG
 * (determinístico). Retorna o monstro criado pra o caller decidir se emite evento
 * (createSession NÃO emite; combat SIM).
 */
export function spawnMonster(state: SessionState, content: ContentBundle, rng: RngCursor): Monster {
  const region = content.regions[state.regionId];
  const def = rng.pick(region.creatures);
  const used = new Set(state.monsters.map((m) => m.slotIndex));
  let slotIndex = 0;
  while (used.has(slotIndex) && slotIndex < MAX_MONSTERS) slotIndex++;
  const m: Monster = {
    id: `mob_${state.nextMonsterSeq++}`,
    defId: def.id,
    name: def.name,
    level: def.level,
    maxHp: def.hp,
    hp: def.hp,
    attack: def.attack,
    xp: def.xp,
    tint: def.color,
    slotIndex,
    cooldownMs: 800 + rng.int(800),
  };
  state.monsters.push(m);
  return m;
}

/**
 * freezeSetup — sela o estado inicial via clone profundo, cortando referências
 * externas e ASSERTANDO que tudo é JSON-safe (sem bigint/função/Date). Pré-requisito
 * do determinismo: nada de fora muta o setup no meio da hunt.
 */
function freezeSetup(state: SessionState): SessionState {
  return structuredClone(state);
}

export function createSession(opts: CreateSessionOpts, ctx: SimContext): SessionState {
  const { content } = ctx;
  const startLevel = opts.startLevel ?? 8;
  const region = opts.regionId ? content.regions[opts.regionId] : pickRegionForLevel(content, startLevel);
  if (!region) throw new Error(`região inexistente: ${opts.regionId}`);
  const vocations = opts.vocations ?? DEFAULT_PARTY;

  const cursor = new RngCursor(createRng(opts.seed, 0n));

  const rowCounters: Record<"front" | "back", number> = { front: 0, back: 0 };
  const participants = vocations.map((vid) => {
    const v = content.vocations[vid];
    if (!v) throw new Error(`vocação inexistente: ${vid}`);
    const p = deriveParticipant(v, startLevel, rowCounters[v.row]++);
    p.cooldownMs = cursor.int(600); // stagger determinístico dos primeiros ataques
    return p;
  });

  const staminaMax = opts.staminaMaxMs ?? DEFAULT_STAMINA_MS;
  const state: SessionState = {
    simVersion: SIM_VERSION,
    huntId: opts.huntId,
    regionId: region.id,
    running: true,
    simTimeMs: 0,
    rng: cursor.state,
    participants,
    monsters: [],
    nextMonsterSeq: 0,
    nextItemSeq: 0,
    nextItemUid: 1,
    respawnTimerMs: 0,
    loot: [],
    level: {
      level: startLevel,
      xp: 0,
      xpToNext: xpForLevel(content, startLevel),
      gold: 12500,
      xpRate: 120,
    },
    stamina: { currentMs: staminaMax, maxMs: staminaMax },
  };

  // spawn inicial (sem eventos — vira o snapshot; respawns em advance emitem)
  for (let i = 0; i < MAX_MONSTERS; i++) spawnMonster(state, content, cursor);
  state.rng = cursor.state;

  return freezeSetup(state);
}
