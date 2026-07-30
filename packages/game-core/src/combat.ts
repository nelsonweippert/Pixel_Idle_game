/**
 * combatStep — UM passo de 1000ms de auto-combat, determinístico. Porta a lógica do
 * MockEngine com rigor: sem Math.random (usa o cursor), sem posições (só alvo
 * lógico), emitindo eventos por retorno. Cada ator resolve TODOS os ataques cujo
 * cooldown venceu dentro do passo (loop while), então a granularidade grossa de 1s
 * não distorce DPS.
 */
import type { SimEvent, SpawnEvent } from "@pixel-idle/game-protocol";
import { monsterCombat, resolveMagic, resolvePhysical, type HitKind } from "@pixel-idle/shared";
import type { RngCursor } from "./rng";
import type { ContentBundle } from "./content/index";
import { MAX_MONSTERS, spawnMonster, type Monster, type Participant, type SessionState } from "./session";
import { grantKillRewards } from "./rewards";

const ACTIONS_GUARD = 64; // teto de ações por ator por passo (segurança)

export function spawnEventFor(m: Monster, atSimMs: number): SpawnEvent {
  return {
    type: "spawn",
    atSimMs,
    entityId: m.id,
    kind: "monster",
    name: m.name,
    level: m.level,
    hp: m.hp,
    maxHp: m.maxHp,
    slot: { row: "front", index: m.slotIndex },
    tint: m.tint,
  };
}

function frontMonster(state: SessionState): Monster | undefined {
  if (state.monsters.length === 0) return undefined;
  return [...state.monsters].sort((a, b) => a.slotIndex - b.slotIndex)[0];
}

function tankOf(state: SessionState): Participant {
  return state.participants.find((p) => p.role === "tank") ?? state.participants[0];
}

export function combatStep(
  state: SessionState,
  content: ContentBundle,
  rng: RngCursor,
  stepMs: number,
  atSimMs: number,
  events: SimEvent[],
): void {
  // heróis agem
  for (const p of state.participants) {
    p.cooldownMs -= stepMs;
    let guard = 0;
    while (p.cooldownMs <= 0 && guard++ < ACTIONS_GUARD) {
      p.cooldownMs += p.attackSpeedMs;
      heroAction(state, content, rng, p, atSimMs, events);
    }
  }

  // monstros agem (miram no tank; Fase A: party não wipe → piso de 1 HP)
  const tank = tankOf(state);
  for (const m of state.monsters) {
    m.cooldownMs -= stepMs;
    let guard = 0;
    while (m.cooldownMs <= 0 && guard++ < ACTIONS_GUARD) {
      m.cooldownMs += 1400 + rng.int(600);
      const res = resolvePhysical(monsterCombat(m.attack, m.level), { defense: tank.mu.defense, defenseRate: tank.mu.defenseRate }, rng);
      if (res.kind === "miss") continue;
      tank.hp = Math.max(1, tank.hp - res.amount);
      events.push({
        type: "damage",
        atSimMs,
        sourceId: m.id,
        targetId: tank.charId,
        amount: res.amount,
        kind: res.kind === "crit" ? "crit" : "physical",
        hpAfter: tank.hp,
      });
    }
  }

  // respawn
  state.respawnTimerMs -= stepMs;
  while (state.monsters.length < MAX_MONSTERS && state.respawnTimerMs <= 0) {
    const m = spawnMonster(state, content, rng);
    events.push(spawnEventFor(m, atSimMs));
    state.respawnTimerMs += 600;
  }
}

function heroAction(
  state: SessionState,
  content: ContentBundle,
  rng: RngCursor,
  p: Participant,
  atSimMs: number,
  events: SimEvent[],
): void {
  // healer prioriza curar o aliado mais ferido (<80% hp) — cura escala com poder mágico (ENE)
  if (p.role === "healer") {
    const hurt = state.participants
      .filter((x) => x.hp < x.maxHp * 0.8)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (hurt) {
      const heal = Math.round(rng.vary(((p.mu.minMagic + p.mu.maxMagic) / 2) * 1.6));
      hurt.hp = Math.min(hurt.maxHp, hurt.hp + heal);
      events.push({
        type: "damage",
        atSimMs,
        sourceId: p.charId,
        targetId: hurt.charId,
        amount: heal,
        kind: "heal",
        hpAfter: hurt.hp,
      });
      return;
    }
  }

  const target = frontMonster(state);
  if (!target) return; // nada pra bater (o cooldown já foi consumido, como no MockEngine)

  const isCaster = p.role === "mage" || p.role === "healer";
  const mc = monsterCombat(target.attack, target.level);
  const res = isCaster ? resolveMagic(p.mu, mc, rng) : resolvePhysical(p.mu, mc, rng);
  if (res.kind === "miss") return; // errou (cooldown já consumido)
  target.hp -= res.amount;
  events.push({
    type: "damage",
    atSimMs,
    sourceId: p.charId,
    targetId: target.id,
    amount: res.amount,
    kind: wireDamageKind(res.kind),
    hpAfter: Math.max(0, target.hp),
  });

  if (target.hp <= 0) killMonster(state, content, rng, target, p, atSimMs, events);
}

/** mapeia HitKind do MU → DamageKind do protocolo (excellent vira "crit" no fio) */
function wireDamageKind(k: HitKind): "physical" | "magic" | "crit" {
  if (k === "crit" || k === "excellent") return "crit";
  if (k === "magic") return "magic";
  return "physical";
}

function killMonster(
  state: SessionState,
  content: ContentBundle,
  rng: RngCursor,
  m: Monster,
  killer: Participant,
  atSimMs: number,
  events: SimEvent[],
): void {
  state.monsters = state.monsters.filter((x) => x.id !== m.id);
  events.push({ type: "kill", atSimMs, entityId: m.id, by: killer.charId });
  grantKillRewards(state, content, rng, m, atSimMs, events);
  if (state.respawnTimerMs > 500) state.respawnTimerMs = 500;
}
