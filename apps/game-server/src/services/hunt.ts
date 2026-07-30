/**
 * Monta a HuntRecord a partir de 1..N personagens (setup congelado). Level da sessão
 * = do líder (monstros escalam a ele); stamina = MÍNIMA entre membros (o 1º a zerar
 * encerra pra todos — AD-012). Ganhos são creditados por membro na materialização.
 */
import { createSession, type ContentBundle } from "@pixel-idle/game-core";
import type { HuntRecord, Store } from "../store/types";
import { absoluteXp } from "../runtime/materialize";

export function createHuntRecord(o: {
  store: Store;
  content: ContentBundle;
  huntId: string;
  charIds: string[];
  leaderCharId: string;
  regionId: string;
  seed: number;
  now: number;
}): HuntRecord {
  const { store, content } = o;
  const chars = o.charIds.map((id) => {
    const c = store.getCharacter(id);
    if (!c) throw new Error(`personagem inexistente: ${id}`);
    return c;
  });
  const leader = store.getCharacter(o.leaderCharId);
  if (!leader) throw new Error("líder inexistente");

  const state = createSession(
    {
      huntId: o.huntId,
      seed: o.seed,
      startLevel: leader.level,
      regionId: o.regionId,
      vocations: chars.map((c) => c.vocation),
      staminaMaxMs: Math.max(...chars.map((c) => c.staminaMaxMs)),
    },
    { content },
  );
  // thread progressão do líder (pool compartilhado) + stamina mínima
  state.level.xp = leader.xp;
  state.level.gold = leader.gold;
  state.stamina.currentMs = Math.min(...chars.map((c) => c.staminaCurrentMs));

  return {
    id: o.huntId,
    accountId: leader.accountId,
    charIds: o.charIds,
    leaderCharId: o.leaderCharId,
    regionId: state.regionId,
    running: true,
    state,
    lastSeenRealMs: o.now,
    createdRealMs: o.now,
    creditedXpAbs: absoluteXp(state.level, content),
    creditedGold: state.level.gold,
    creditedSimMs: 0,
  };
}
