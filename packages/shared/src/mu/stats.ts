/**
 * mu/stats.ts — MOTOR DE ATRIBUTOS DO MU (Season 6), portado do OpenMU.
 *
 * O MU é um sistema de AGREGAÇÃO de atributos: 5 stats base (STR/AGI/VIT/ENE/CMD)
 * geram os stats DERIVADOS (HP, mana, dano físico/mágico min-max, defesa, attack-rate,
 * defense-rate) via coeficientes POR CLASSE. Aqui vive a fonte de verdade dessas
 * fórmulas — puras, determinísticas, JSON-safe. game-core consome; UI/servidor idem.
 *
 * Fonte: OpenMU src/Persistence/Initialization/CharacterClasses/Class*.cs
 * (transcrito termo a termo). Ver também: OpenMU AttackableExtensions p/ combate.
 */

// Classes canônicas do MU S6 (1ª geração; 2ª/3ª compartilham fórmula).
export type MuClassId = "dw" | "dk" | "elf" | "mg" | "dl" | "sum";

// Vocações do jogo → classe MU + build. (mantém sync com VocationId em ../index)
export type VocId = "knight" | "cleric" | "sorcerer" | "ranger";

/** os 5 atributos base do MU */
export interface BaseAttrs {
  str: number;
  agi: number;
  vit: number;
  ene: number;
  cmd: number;
}

/** contribuição de stats vinda de EQUIPAMENTO (soma dos itens equipados).
 * Enquanto o inventário não existe, `assumedGear` gera um stand-in por nível. */
export interface GearTerms {
  weaponMin: number;
  weaponMax: number;
  magicMin: number;
  magicMax: number;
  armorDef: number; // entra no DefenseBase (antes do ×0.5 do MU)
  armorDefRate: number;
  critChance: number; // 0..1
  excellentChance: number; // 0..1
  bonusHp: number;
  bonusMana: number;
}

export const ZERO_GEAR: GearTerms = {
  weaponMin: 0,
  weaponMax: 0,
  magicMin: 0,
  magicMax: 0,
  armorDef: 0,
  armorDefRate: 0,
  critChance: 0,
  excellentChance: 0,
  bonusHp: 0,
  bonusMana: 0,
};

/** stats derivados — o que o combate e a HUD leem */
export interface DerivedStats {
  maxHp: number;
  maxMana: number;
  minPhys: number;
  maxPhys: number;
  minMagic: number;
  maxMagic: number;
  defense: number; // dano absorvido (DefenseFinal PvM)
  defenseRate: number; // esquiva PvM
  attackRate: number; // acerto PvM
  critChance: number; // 0..1
  excellentChance: number; // 0..1
}

// ─────────────────────────────────────────────────────────────────────────────
// Dados por classe: stats iniciais + pontos por nível (OpenMU CharacterClasses)
// ─────────────────────────────────────────────────────────────────────────────
interface ClassData {
  base: BaseAttrs;
  pointsPerLevel: number;
}

export const MU_CLASSES: Record<MuClassId, ClassData> = {
  dk: { base: { str: 28, agi: 20, vit: 25, ene: 10, cmd: 0 }, pointsPerLevel: 5 },
  dw: { base: { str: 18, agi: 18, vit: 15, ene: 30, cmd: 0 }, pointsPerLevel: 5 },
  elf: { base: { str: 22, agi: 25, vit: 20, ene: 15, cmd: 0 }, pointsPerLevel: 5 },
  mg: { base: { str: 26, agi: 26, vit: 26, ene: 26, cmd: 0 }, pointsPerLevel: 7 },
  dl: { base: { str: 26, agi: 20, vit: 20, ene: 15, cmd: 25 }, pointsPerLevel: 7 },
  sum: { base: { str: 21, agi: 21, vit: 18, ene: 23, cmd: 0 }, pointsPerLevel: 5 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Build por vocação: classe MU + como os pontos ganhos por nível são distribuídos.
// (No MU o jogador aloca livre; num idle a build é automática. `alloc` soma 1.0.)
// ─────────────────────────────────────────────────────────────────────────────
export interface VocBuild {
  cls: MuClassId;
  alloc: BaseAttrs; // frações (somam ~1) dos pontos ganhos por nível
  gear: GearProfile; // curva de "gear assumido" (stand-in até o inventário existir)
}

/** curva de gear assumido por build — substituída pelos itens reais na fase 3 */
interface GearProfile {
  wMin0: number;
  wMinK: number;
  wMax0: number;
  wMaxK: number;
  mMin0: number;
  mMinK: number;
  mMax0: number;
  mMaxK: number;
  defK: number;
  crit: number;
  exc: number;
}

export const MU_BUILDS: Record<VocId, VocBuild> = {
  // Dark Knight — tank STR/VIT, arma corpo-a-corpo
  knight: {
    cls: "dk",
    alloc: { str: 0.4, agi: 0.12, vit: 0.43, ene: 0.05, cmd: 0 },
    gear: { wMin0: 6, wMinK: 2.2, wMax0: 10, wMaxK: 3.0, mMin0: 0, mMinK: 0, mMax0: 0, mMaxK: 0, defK: 1.3, crit: 0.05, exc: 0.01 },
  },
  // Dark Wizard — nuker ENE
  sorcerer: {
    cls: "dw",
    alloc: { str: 0.08, agi: 0.12, vit: 0.2, ene: 0.6, cmd: 0 },
    gear: { wMin0: 1, wMinK: 0.4, wMax0: 2, wMaxK: 0.6, mMin0: 8, mMinK: 2.6, mMax0: 14, mMaxK: 3.4, defK: 0.6, crit: 0.04, exc: 0.02 },
  },
  // Fairy Elf (arqueiro) — DPS físico AGI à distância
  ranger: {
    cls: "elf",
    alloc: { str: 0.3, agi: 0.55, vit: 0.15, ene: 0, cmd: 0 },
    gear: { wMin0: 8, wMinK: 2.6, wMax0: 12, wMaxK: 3.4, mMin0: 0, mMinK: 0, mMax0: 0, mMaxK: 0, defK: 0.9, crit: 0.08, exc: 0.02 },
  },
  // Fairy Elf (suporte) — heal/buff ENE/VIT (a Elf É a healer do MU)
  cleric: {
    cls: "elf",
    alloc: { str: 0.05, agi: 0.2, vit: 0.35, ene: 0.4, cmd: 0 },
    gear: { wMin0: 2, wMinK: 0.8, wMax0: 4, wMaxK: 1.2, mMin0: 4, mMinK: 1.4, mMax0: 7, mMaxK: 2.0, defK: 1.1, crit: 0.03, exc: 0.01 },
  },
};

/** gear assumido no nível dado (stand-in até o inventário real) */
export function assumedGear(voc: VocId, level: number): GearTerms {
  const g = MU_BUILDS[voc].gear;
  return {
    weaponMin: g.wMin0 + g.wMinK * level,
    weaponMax: g.wMax0 + g.wMaxK * level,
    magicMin: g.mMin0 + g.mMinK * level,
    magicMax: g.mMax0 + g.mMaxK * level,
    armorDef: g.defK * level,
    armorDefRate: level * 1.0,
    critChance: g.crit,
    excellentChance: g.exc,
    bonusHp: 0,
    bonusMana: 0,
  };
}

/** atributos totais de uma vocação no nível dado (base da classe + pontos alocados) */
export function attrsFor(voc: VocId, level: number): BaseAttrs {
  const build = MU_BUILDS[voc];
  const cls = MU_CLASSES[build.cls];
  const points = Math.max(0, level - 1) * cls.pointsPerLevel;
  const a = { ...cls.base };
  a.str += Math.floor(points * build.alloc.str);
  a.agi += Math.floor(points * build.alloc.agi);
  a.vit += Math.floor(points * build.alloc.vit);
  a.ene += Math.floor(points * build.alloc.ene);
  a.cmd += Math.floor(points * build.alloc.cmd);
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────
// computeDerived — as fórmulas derivadas POR CLASSE (OpenMU, termo a termo).
// DefenseFinal = 0.5 * DefenseBase (regra comum do MU).
// ─────────────────────────────────────────────────────────────────────────────
export function computeDerived(cls: MuClassId, a: BaseAttrs, level: number, gear: GearTerms): DerivedStats {
  let maxHp = 0;
  let maxMana = 0;
  let defBase = 0;
  let defenseRate = 0;
  let attackRate = 0;
  let minPhys = 0;
  let maxPhys = 0;
  let minMagic = 0;
  let maxMagic = 0;

  switch (cls) {
    case "dk":
      maxHp = 35 + 2 * level + 3 * a.vit;
      maxMana = 10 + a.ene + 0.5 * level;
      defBase = a.agi / 3;
      defenseRate = a.agi / 3;
      attackRate = 5 * level + 1.5 * a.agi + 0.25 * a.str;
      minPhys = a.str / 6;
      maxPhys = a.str / 4;
      break;
    case "dw":
      maxHp = 30 + level + 2 * a.vit;
      maxMana = 2 * a.ene + 2 * level;
      defBase = 0.25 * a.agi;
      defenseRate = a.agi / 3;
      attackRate = 5 * level + 1.5 * a.agi + 0.25 * a.str;
      minPhys = a.str / 8;
      maxPhys = a.str / 4;
      minMagic = a.ene / 9;
      maxMagic = a.ene / 4;
      break;
    case "elf":
      maxHp = 39 + level + 2 * a.vit;
      maxMana = 6 + 1.5 * a.ene + 1.5 * level;
      defBase = a.agi / 10;
      defenseRate = 0.25 * a.agi;
      attackRate = 5 * level + 1.5 * a.agi + 0.25 * a.str;
      // archery: usa AGI+STR; a build suporte tem pouco desses e vive do gear mágico
      minPhys = a.agi / 7 + a.str / 14;
      maxPhys = a.agi / 4 + a.str / 8;
      minMagic = a.ene / 9;
      maxMagic = a.ene / 4;
      break;
    case "mg":
      maxHp = 57 + level + 2 * a.vit;
      maxMana = 7 + 2 * a.ene + level;
      defBase = a.agi / 5;
      defenseRate = a.agi / 3;
      attackRate = 5 * level + 1.5 * a.agi + 0.25 * a.str;
      minPhys = a.str / 6 + a.ene / 12;
      maxPhys = a.str / 4 + a.ene / 8;
      minMagic = a.ene / 9;
      maxMagic = a.ene / 4;
      break;
    case "dl":
      maxHp = 48.5 + 1.5 * level + 2 * a.vit;
      maxMana = 38 + 1.5 * (a.ene - 15) + level;
      defBase = a.agi / 7;
      defenseRate = a.agi / 7;
      attackRate = 5 * level + 2.5 * a.agi + a.str / 6 + a.cmd / 10;
      minPhys = a.str / 7 + a.ene / 14;
      maxPhys = a.str / 5 + a.ene / 10;
      break;
    case "sum":
      maxHp = 39 + level + 2 * a.vit;
      maxMana = 6 + 1.7 * a.ene + 1.5 * level;
      defBase = a.agi / 3;
      defenseRate = 0.25 * a.agi;
      attackRate = 5 * level + 1.5 * a.agi + 0.25 * a.str;
      minPhys = (a.str + a.agi) / 7;
      maxPhys = (a.str + a.agi) / 4;
      minMagic = a.ene / 9;
      maxMagic = a.ene / 4;
      break;
  }

  return {
    maxHp: Math.round(maxHp + gear.bonusHp),
    maxMana: Math.round(maxMana + gear.bonusMana),
    minPhys: Math.round(minPhys + gear.weaponMin),
    maxPhys: Math.round(maxPhys + gear.weaponMax),
    minMagic: Math.round(minMagic + gear.magicMin),
    maxMagic: Math.round(maxMagic + gear.magicMax),
    defense: Math.round(0.5 * (defBase + gear.armorDef)),
    defenseRate: Math.round(defenseRate + gear.armorDefRate),
    attackRate: Math.round(attackRate),
    critChance: gear.critChance,
    excellentChance: gear.excellentChance,
  };
}

/** atalho: stats derivados de uma vocação no nível dado, com gear assumido */
export function deriveVocation(voc: VocId, level: number, gear?: GearTerms): { attrs: BaseAttrs; cls: MuClassId; derived: DerivedStats } {
  const cls = MU_BUILDS[voc].cls;
  const attrs = attrsFor(voc, level);
  const g = gear ?? assumedGear(voc, level);
  return { attrs, cls, derived: computeDerived(cls, attrs, level, g) };
}
