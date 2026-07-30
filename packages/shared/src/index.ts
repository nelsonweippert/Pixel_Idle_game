/**
 * @pixel-idle/shared — domínio compartilhado entre client (web) e futuro servidor.
 *
 * Aqui vivem as REGRAS e ENTIDADES do jogo em tipos puros: classes/vocações,
 * combatentes, itens/loot e o protocolo de rede (espelhando o padrão snapshot+patch
 * do Stonegy que engenharia-reversamos). O client renderiza isto; na Fase 3 o
 * servidor autoritativo passa a ser a fonte de verdade.
 */

import vocationsJson from "../content/vocations.json";
import gameJson from "../content/game.json";

export * from "./world";
export * from "./mu";

// ─────────────────────────────────────────────────────────────────────────────
// Classes / Vocações  (Tank · Healer · Mage · Archer)
// ─────────────────────────────────────────────────────────────────────────────

export type VocationId = "knight" | "cleric" | "sorcerer" | "ranger";
export type CombatRole = "tank" | "healer" | "mage" | "archer";
export type GridRow = "front" | "back";

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  magic: number;
  /** intervalo entre ataques, em ms */
  attackSpeedMs: number;
  /** alcance em tiles */
  range: number;
}

export interface VocationDef {
  id: VocationId;
  /** nome de classe exibido */
  name: string;
  /** papel no combate */
  role: CombatRole;
  tagline: string;
  /** cor do placeholder no Pixi (0xRRGGBB) */
  color: number;
  /** cor de acento na UI (css) */
  accent: string;
  /** linha de formação: front = tank/melee, back = ranged/caster */
  row: GridRow;
  base: BaseStats;
  /** 4 slots de skill (igual start_hunt.skillsSelected do Stonegy) */
  skills: string[];
}

// dados canônicos em ../content/vocations.json (balancear sem tocar código)
export const VOCATIONS: Record<VocationId, VocationDef> = vocationsJson as unknown as Record<
  VocationId,
  VocationDef
>;

export const VOCATION_LIST: VocationDef[] = [
  VOCATIONS.knight,
  VOCATIONS.cleric,
  VOCATIONS.sorcerer,
  VOCATIONS.ranger,
];

// ─────────────────────────────────────────────────────────────────────────────
// Tabelas de loot + curva de XP (dados canônicos em ../content/game.json)
// ─────────────────────────────────────────────────────────────────────────────
export const LOOT_TABLE = gameJson.loot as unknown as {
  names: Record<Rarity, string[]>;
  rarityWeights: ReadonlyArray<readonly [Rarity, number]>;
};
export const XP_CURVE = gameJson.xpCurve as { base: number; exp: number };

// ─────────────────────────────────────────────────────────────────────────────
// Combate (entidades que a cena Pixi desenha)
// ─────────────────────────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

export type EntityKind = "hero" | "monster";

export interface CombatEntity {
  id: string;
  kind: EntityKind;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  /** posição na grade da hunt */
  tile: Vec2;
  color: number;
  /** só heróis: qual vocação */
  vocation?: VocationId;
}

export type DamageKind = "physical" | "magic" | "heal";

export interface FloatingText {
  id: number;
  text: string;
  kind: DamageKind | "crit" | "info";
  at: Vec2;
}

// ─────────────────────────────────────────────────────────────────────────────
// Itens & Loot
// ─────────────────────────────────────────────────────────────────────────────

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#c7c7c7",
  uncommon: "#6fbf73",
  rare: "#5b8fd6",
  epic: "#a06cd5",
  legendary: "#f2a03d",
};

export interface ItemDef {
  id: number;
  name: string;
  rarity: Rarity;
  /** valor de venda em gold */
  value: number;
  icon?: string;
}

export interface LootDrop {
  item: ItemDef;
  amount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Progressão
// ─────────────────────────────────────────────────────────────────────────────

export interface LevelInfo {
  level: number;
  xp: number;
  xpToNext: number;
  gold: number;
  /** taxa de xp/h atual (base 100 = 1x) */
  xpRate: number;
}

/** stamina no modelo Stonegy: consome caçando, recupera parado */
export interface Stamina {
  currentMs: number;
  maxMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Protocolo de rede  (Fase 3 — espelha o padrão do Stonegy: 1 WS, {type,data},
// snapshot no bootstrap + patches incrementais. Definido já pra o client ser
// escrito contra o contrato certo desde agora.)
// ─────────────────────────────────────────────────────────────────────────────

export interface HuntSnapshot {
  huntId: number;
  regionId: string;
  heroes: CombatEntity[];
  monsters: CombatEntity[];
  levelInfo: LevelInfo;
}

/** client → servidor: INTENÇÕES */
export type ClientMessage =
  | { type: "auth"; data: { tokenKey: string; characterId: string; worldId: number } }
  | { type: "start_hunt"; data: { huntId: number; skillsSelected: (string | null)[] } }
  | { type: "leave_hunt"; data: Record<string, never> }
  | { type: "hunt_change_party_position"; data: Vec2 }
  | { type: "quick_sell_items"; data: { itemIds: number[] } };

/** servidor → client: ESTADO */
export type ServerMessage =
  | { type: "hunt_bootstrap"; data: HuntSnapshot }
  | { type: "hunt:update_monsters"; data: { monsters: CombatEntity[] } }
  | { type: "hunt:update_players"; data: { heroes: CombatEntity[] } }
  | { type: "levelinfo:patch"; data: Partial<LevelInfo> }
  | { type: "hunt_finished"; data: { loot: LootDrop[] } };
