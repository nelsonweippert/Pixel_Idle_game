/**
 * Progressão Tibia-linear: level sobe pela curva (applyXp em materialize.ts, SEM
 * reset) e SKILLS sobem com uso. Aqui fica o treino de skill por tempo de hunt e a
 * curva de nível de skill. Endgame vem de gear/loot/marketplace, não de prestígio.
 */
import type { ContentBundle } from "@pixel-idle/game-core";
import type { Character } from "../store/types";

/** nível de uma skill a partir dos pontos acumulados (curva raiz — sobe rápido cedo) */
export function skillLevelFor(points: number): number {
  return Math.floor(Math.sqrt(Math.max(0, points)));
}

/**
 * Treina as skills da vocação pelo tempo caçado (1 ponto/seg dividido entre as skills
 * da classe). Chamado na materialização, por membro, com o dSim do segmento.
 */
export function trainFromHunt(char: Character, dSimMs: number, content: ContentBundle): void {
  if (dSimMs <= 0) return;
  const voc = content.vocations[char.vocation];
  if (!voc || voc.skills.length === 0) return;
  const gainEach = dSimMs / 1000 / voc.skills.length;
  for (const s of voc.skills) {
    char.skills[s] = (char.skills[s] ?? 0) + gainEach;
  }
}

export function skillSummary(char: Character): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [s, pts] of Object.entries(char.skills)) out[s] = skillLevelFor(pts);
  return out;
}
