/**
 * Materialização: o mesmo advance() do core roda o período (online ou offline), e os
 * ganhos são creditados aos personagens de forma INCREMENTAL e idempotente (baselines
 * na HuntRecord + ledger append-only por ref). É o coração do "offline fiel" (AD-002).
 *
 * Progressão Tibia-linear: XP soma, sobe de nível, SEM reset. Stamina drena 1:1.
 */
import { advance, xpForLevel, type ContentBundle } from "@pixel-idle/game-core";
import type { OfflineReport } from "@pixel-idle/game-protocol";
import type { Character, HuntRecord, Store } from "../store/types";
import { trainFromHunt } from "../services/progression";

/** xp absoluto acumulado (a curva reinicia xp a cada nível) */
export function absoluteXp(level: { level: number; xp: number }, content: ContentBundle): number {
  let sum = level.xp;
  for (let k = 1; k < level.level; k++) sum += xpForLevel(content, k);
  return sum;
}

/** aplica xp a um personagem subindo de nível conforme a curva (linear, sem reset) */
export function applyXp(char: Character, gained: number, content: ContentBundle): void {
  char.xp += gained;
  let guard = 0;
  while (char.xp >= xpForLevel(content, char.level) && guard++ < 10_000) {
    char.xp -= xpForLevel(content, char.level);
    char.level += 1;
  }
}

/**
 * Credita aos personagens da hunt o delta desde a última materialização (baselines).
 * Idempotente: chamar duas vezes sem avançar a sim não credita nada. Split igualitário
 * do pool entre os membros (solo = tudo pra 1). Stamina drena por membro.
 */
export function materializeToChars(store: Store, content: ContentBundle, hunt: HuntRecord): void {
  const s = hunt.state;
  const nowXpAbs = absoluteXp(s.level, content);
  const nowGold = s.level.gold;
  const nowSim = s.simTimeMs;

  const dXp = Math.max(0, nowXpAbs - hunt.creditedXpAbs);
  const dGold = Math.max(0, nowGold - hunt.creditedGold);
  const dSim = Math.max(0, nowSim - hunt.creditedSimMs);
  if (dXp === 0 && dGold === 0 && dSim === 0) return;

  const n = hunt.charIds.length;
  for (const cid of hunt.charIds) {
    const c = store.getCharacter(cid);
    if (!c) continue;
    applyXp(c, dXp / n, content);
    c.gold += Math.round(dGold / n);
    c.staminaCurrentMs = Math.max(0, c.staminaCurrentMs - dSim);
    trainFromHunt(c, dSim, content); // skills sobem com o tempo caçado
    store.saveCharacter(c);
  }

  // ledger append-only do ouro creditado neste segmento (idempotente por ref)
  const ref = `${hunt.id}:gold:${hunt.creditedSimMs}->${nowSim}`;
  if (dGold > 0 && !store.ledgerHasRef(ref)) {
    store.appendLedger({
      id: store.nextId("led"),
      accountId: hunt.accountId,
      ref,
      amount: dGold,
      reason: "hunt",
    });
  }

  hunt.creditedXpAbs = nowXpAbs;
  hunt.creditedGold = nowGold;
  hunt.creditedSimMs = nowSim;
}

/**
 * Roda o gap offline: avança a sim do simTime atual por `elapsedReal` (limitado
 * naturalmente pela stamina dentro do advance), credita, e devolve o relatório.
 */
export function runOfflineGap(
  store: Store,
  content: ContentBundle,
  hunt: HuntRecord,
  nowRealMs: number,
): OfflineReport {
  const beforeXpAbs = absoluteXp(hunt.state.level, content);
  const beforeGold = hunt.state.level.gold;
  const fromSim = hunt.state.simTimeMs;

  const elapsed = Math.max(0, nowRealMs - hunt.lastSeenRealMs);
  const target = hunt.state.simTimeMs + elapsed;
  const { state, events } = advance(hunt.state, { content }, target);

  hunt.state = state;
  hunt.running = state.running;
  hunt.endCause = state.endCause;
  hunt.lastSeenRealMs = nowRealMs;

  materializeToChars(store, content, hunt);

  const kills = events.filter((e) => e.type === "kill").length;
  const drops = events.flatMap((e) => (e.type === "drop" ? [e.item] : []));
  return {
    huntId: hunt.id,
    fromSimMs: fromSim,
    toSimMs: state.simTimeMs,
    realElapsedMs: elapsed,
    kills,
    drops,
    xpGained: Math.max(0, absoluteXp(state.level, content) - beforeXpAbs),
    goldGained: Math.max(0, state.level.gold - beforeGold),
    ended: !state.running,
    cause: state.endCause,
  };
}
