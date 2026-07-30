/**
 * buildSnapshot — projeta o SessionState no Snapshot do protocolo (o estado completo
 * entregue em toda (re)conexão). É aqui que participantes/monstros viram Combatant
 * com slot lógico; o client resolve o pixel. Serve o NetClient local hoje e o
 * servidor na Fase B.
 */
import type { Snapshot } from "@pixel-idle/game-protocol";
import { PROTOCOL_VERSION } from "@pixel-idle/game-protocol";
import type { SessionState } from "./session";

export function buildSnapshot(state: SessionState): Snapshot {
  return {
    protocolVersion: PROTOCOL_VERSION,
    huntId: state.huntId,
    regionId: state.regionId,
    running: state.running,
    simTimeMs: state.simTimeMs,
    heroes: state.participants.map((p) => ({
      entityId: p.charId,
      kind: "hero" as const,
      name: p.name,
      level: p.level,
      hp: p.hp,
      maxHp: p.maxHp,
      vocation: p.vocation,
      slot: p.slot,
      tint: p.tint,
    })),
    monsters: state.monsters.map((m) => ({
      entityId: m.id,
      kind: "monster" as const,
      name: m.name,
      level: m.level,
      hp: m.hp,
      maxHp: m.maxHp,
      slot: { row: "front" as const, index: m.slotIndex },
      tint: m.tint,
    })),
    level: state.level,
    stamina: state.stamina,
  };
}
