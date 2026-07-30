/**
 * Recompensas de kill: XP (com curva de level), gold e drop. Level-up reescala os
 * participantes preservando a razão de HP. Emite eventos (levelUp, drop) — nunca
 * posições.
 */
import type { SimEvent } from "@pixel-idle/game-protocol";
import { deriveVocation, muXpToNext, type VocId } from "@pixel-idle/shared";
import type { RngCursor } from "./rng";
import type { ContentBundle } from "./content/index";
import type { Monster, SessionState } from "./session";
import { dropToWire, rollMuDrop } from "./loot";

/** curva de XP até o próximo nível — CURVA DO MU (mu/xp). `content` mantido p/ assinatura. */
export function xpForLevel(_content: ContentBundle, level: number): number {
  return muXpToNext(level);
}

export function grantKillRewards(
  state: SessionState,
  content: ContentBundle,
  rng: RngCursor,
  m: Monster,
  atSimMs: number,
  events: SimEvent[],
): void {
  const gainedXp = Math.round(m.xp * (state.level.xpRate / 100));
  state.level.xp += gainedXp;
  while (state.level.xp >= state.level.xpToNext) levelUp(state, content, atSimMs, events);

  // drop MU: money (soma no ouro) ou item (empilha na mochila + feed). ~30% item, 50% money.
  const drop = rollMuDrop(content, rng, m, gainedXp, state.nextItemUid);
  if (drop.kind === "money") {
    state.level.gold += drop.money;
  } else if (drop.kind === "item") {
    state.nextItemUid++;
    state.loot.push(drop.instance);
    if (state.loot.length > 200) state.loot.shift();
    events.push({ type: "drop", atSimMs, fromName: m.name, item: dropToWire(drop.instance, drop.def) });
  }
}

function levelUp(
  state: SessionState,
  content: ContentBundle,
  atSimMs: number,
  events: SimEvent[],
): void {
  state.level.xp -= state.level.xpToNext;
  state.level.level += 1;
  state.level.xpToNext = xpForLevel(content, state.level.level);
  const lvl = state.level.level;
  for (const p of state.participants) {
    const ratio = p.hp / p.maxHp;
    // reescala pelos stats MU do novo nível (gear assumido; itens reais entram na fase 3)
    const { attrs, derived } = deriveVocation(p.vocation as VocId, lvl);
    const isCaster = p.role === "mage" || p.role === "healer";
    p.attrs = attrs;
    p.mu = derived;
    p.maxHp = derived.maxHp;
    p.hp = Math.round(p.maxHp * ratio);
    p.defense = derived.defense;
    p.attack = Math.round(isCaster ? (derived.minMagic + derived.maxMagic) / 2 : (derived.minPhys + derived.maxPhys) / 2);
    p.level = lvl;
    events.push({ type: "levelUp", atSimMs, charId: p.charId, level: lvl });
  }
}
