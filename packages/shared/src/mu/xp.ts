/**
 * mu/xp.ts — CURVA DE EXPERIÊNCIA do MU (Season 6), do OpenMU.
 * `muXpToReach(level)` = XP acumulada pra ATINGIR o nível (tabela do MU);
 * `muXpToNext(level)` = XP pra ir de `level` → `level+1`.
 * Fonte: GameConfigurationInitializerBase.cs (CreateExpTable).
 */

export const MU_MAX_LEVEL = 400;
export const MU_MAX_MASTER_LEVEL = 200;

/** XP acumulada necessária pra atingir `level` (0 no nível 0/1) */
export function muXpToReach(level: number): number {
  if (level <= 1) return 0;
  let xp = 10 * (level + 8) * (level - 1) * (level - 1);
  if (level >= 256) {
    xp += 1000 * (level - 247) * (level - 256) * (level - 256);
  }
  return Math.round(xp);
}

/** XP pra subir DE `level` PARA `level+1` (o que a HUD chama de xpToNext) */
export function muXpToNext(level: number): number {
  return muXpToReach(level + 1) - muXpToReach(level);
}

/** XP de master-level (trilha separada, cap 200) */
export function muMasterXpToNext(masterLevel: number): number {
  const f = (l: number) => 505 * l * l * l + 228045 * l * l + 35278500 * l;
  return Math.round(f(masterLevel) - f(masterLevel - 1));
}
