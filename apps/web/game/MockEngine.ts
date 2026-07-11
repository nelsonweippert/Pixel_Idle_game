/**
 * MockEngine — simulação de hunt rodando NO CLIENT (Fase 0).
 *
 * ⚠️ ARQUITETURA: esta classe é a "fonte de verdade" temporária. Ela produz
 * exatamente as mesmas formas que o servidor autoritativo vai emitir na Fase 3
 * (CombatEntity[], LevelInfo, LootDrop, eventos de hit/death). Quando o servidor
 * entrar, trocamos ESTA classe por um cliente WebSocket que recebe snapshot+patch
 * — e a HuntScene (render) e a HUD (React) NÃO mudam. É esse desacoplamento que
 * torna "a arquitetura visual" evoluível.
 */

import {
  type CombatEntity,
  type CreatureDef,
  type LevelInfo,
  type LootDrop,
  type Rarity,
  type RegionDef,
  regionForLevel,
  REGION_BY_ID,
  VOCATION_LIST,
} from "@pixel-idle/shared";

export const GRID = { w: 15, h: 9 };

const HERO_FORMATION: Record<string, { x: number; y: number }> = {
  knight: { x: 6, y: 4 }, // tank na frente
  ranger: { x: 4, y: 3 },
  sorcerer: { x: 4, y: 5 },
  cleric: { x: 3, y: 4 }, // healer atrás
};

const MAX_MONSTERS = 4;

export interface EngineHit {
  type: "hit";
  sourceId: string;
  targetId: string;
  amount: number;
  kind: "physical" | "magic" | "heal" | "crit";
}
export interface EngineDeath {
  type: "death";
  id: string;
}
export interface EngineSpawn {
  type: "spawn";
  entity: CombatEntity;
}
export interface EngineLoot {
  type: "loot";
  drop: LootDrop;
  monsterName: string;
}
export type EngineEvent = EngineHit | EngineDeath | EngineSpawn | EngineLoot;
type Listener = (ev: EngineEvent) => void;

const LOOT_NAMES: Record<Rarity, string[]> = {
  common: ["Copper Pouch", "Wolf Pelt", "Cracked Fang", "Torn Cloth", "Bone Shard"],
  uncommon: ["Iron Ingot", "Health Vial", "Hunter's Charm", "Sturdy Buckler"],
  rare: ["Silver Amulet", "Enchanted Quiver", "Runed Gauntlets", "Mana Crystal"],
  epic: ["Dragonhide Cloak", "Warlord's Sigil", "Astral Grimoire"],
  legendary: ["Crown of the Fallen King", "Heart of the Abyss"],
};
const RARITY_WEIGHTS: [Rarity, number][] = [
  ["common", 60],
  ["uncommon", 25],
  ["rare", 10],
  ["epic", 4],
  ["legendary", 1],
];

function rollRarity(): Rarity {
  const total = RARITY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [rarity, w] of RARITY_WEIGHTS) {
    if ((r -= w) <= 0) return rarity;
  }
  return "common";
}
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const vary = (n: number, spread = 0.15) => n * (1 - spread + Math.random() * spread * 2);

export interface EngineSnapshot {
  heroes: CombatEntity[];
  monsters: CombatEntity[];
  levelInfo: LevelInfo;
  region: RegionDef;
  lootFeed: { id: number; name: string; rarity: Rarity; amount: number }[];
  xpPerHour: number;
  running: boolean;
}

export class MockEngine {
  heroes: CombatEntity[] = [];
  monsters: CombatEntity[] = [];
  levelInfo: LevelInfo;
  region: RegionDef;
  running = false;

  private heroCd = new Map<string, number>();
  private monsterCd = new Map<string, number>();
  private heroAtk = new Map<string, number>();
  private heroSpeed = new Map<string, number>();
  private monsterAtk = new Map<string, number>();
  private idc = 0;
  private respawnTimer = 0;
  private listeners: Listener[] = [];
  private lootFeed: EngineSnapshot["lootFeed"] = [];
  private xpAccum = 0;
  private elapsed = 0;

  constructor(startLevel = 8, regionId?: string) {
    this.levelInfo = {
      level: startLevel,
      xp: 0,
      xpToNext: this.xpForLevel(startLevel),
      gold: 12500,
      xpRate: 120,
    };
    this.region = regionId ? REGION_BY_ID[regionId] : regionForLevel(startLevel);
    this.buildHeroes();
    for (let i = 0; i < MAX_MONSTERS; i++) this.spawnMonster();
  }

  // ── ciclo de vida ─────────────────────────────────────────────────────────
  on(cb: Listener) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }
  private emit(ev: EngineEvent) {
    for (const l of this.listeners) l(ev);
  }
  start() {
    this.running = true;
  }
  stop() {
    this.running = false;
  }

  setRegion(regionId: string) {
    this.region = REGION_BY_ID[regionId] ?? this.region;
    for (const m of this.monsters) this.emit({ type: "death", id: m.id });
    this.monsters = [];
    for (let i = 0; i < MAX_MONSTERS; i++) this.spawnMonster();
  }

  // ── setup ────────────────────────────────────────────────────────────────
  private buildHeroes() {
    const lvl = this.levelInfo.level;
    this.heroes = VOCATION_LIST.map((v) => {
      const maxHp = Math.round(v.base.hp * (1 + lvl * 0.08));
      const atk = v.base.attack * (1 + lvl * 0.06);
      const tile = HERO_FORMATION[v.id];
      const id = `hero_${v.id}`;
      this.heroCd.set(id, Math.random() * 600);
      this.heroAtk.set(id, atk);
      this.heroSpeed.set(id, v.base.attackSpeedMs);
      return {
        id,
        kind: "hero",
        name: v.name,
        level: lvl,
        hp: maxHp,
        maxHp,
        tile: { ...tile },
        color: v.color,
        vocation: v.id,
      } satisfies CombatEntity;
    });
  }

  private spawnMonster() {
    if (this.monsters.length >= MAX_MONSTERS) return;
    const def: CreatureDef = pick(this.region.creatures);
    const id = `mob_${this.idc++}`;
    const used = new Set(this.monsters.map((m) => `${m.tile.x},${m.tile.y}`));
    let tile = { x: 0, y: 0 };
    for (let tries = 0; tries < 20; tries++) {
      tile = { x: 9 + Math.floor(Math.random() * 4), y: 2 + Math.floor(Math.random() * 5) };
      if (!used.has(`${tile.x},${tile.y}`)) break;
    }
    const entity: CombatEntity = {
      id,
      kind: "monster",
      name: def.name,
      level: def.level,
      hp: def.hp,
      maxHp: def.hp,
      tile,
      color: def.color,
    };
    this.monsterCd.set(id, 800 + Math.random() * 800);
    this.monsterAtk.set(id, def.attack);
    (entity as CombatEntity & { xp: number }).xp = def.xp;
    this.monsters.push(entity);
    this.emit({ type: "spawn", entity });
  }

  private frontMonster(): CombatEntity | undefined {
    if (this.monsters.length === 0) return undefined;
    return [...this.monsters].sort((a, b) => a.tile.x - b.tile.x)[0];
  }
  private tank(): CombatEntity {
    return this.heroes.find((h) => h.vocation === "knight") ?? this.heroes[0];
  }

  // ── tick ───────────────────────────────────────────────────────────────────
  tick(dtMs: number) {
    if (!this.running) return;
    const dt = Math.min(dtMs, 100);
    this.elapsed += dt;

    // heróis agem
    for (const h of this.heroes) {
      const cd = (this.heroCd.get(h.id) ?? 0) - dt;
      if (cd > 0) {
        this.heroCd.set(h.id, cd);
        continue;
      }
      this.heroCd.set(h.id, this.heroSpeed.get(h.id) ?? 1400);
      this.heroAction(h);
    }

    // monstros agem (miram no tank)
    const tank = this.tank();
    for (const m of this.monsters) {
      const cd = (this.monsterCd.get(m.id) ?? 0) - dt;
      if (cd > 0) {
        this.monsterCd.set(m.id, cd);
        continue;
      }
      this.monsterCd.set(m.id, 1400 + Math.random() * 600);
      const raw = vary(this.monsterAtk.get(m.id) ?? 10);
      const knightDef = VOCATION_LIST.find((v) => v.id === "knight")!.base.defense;
      const dmg = Math.max(1, Math.round(raw - knightDef * 0.4));
      tank.hp = Math.max(1, tank.hp - dmg); // Fase 0: party não wipe
      this.emit({ type: "hit", sourceId: m.id, targetId: tank.id, amount: dmg, kind: "physical" });
    }

    // respawn
    this.respawnTimer -= dt;
    if (this.monsters.length < MAX_MONSTERS && this.respawnTimer <= 0) {
      this.spawnMonster();
      this.respawnTimer = 600;
    }
  }

  private heroAction(h: CombatEntity) {
    if (h.vocation === "cleric") {
      const hurt = [...this.heroes]
        .filter((x) => x.hp < x.maxHp * 0.8)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt) {
        const heal = Math.round(vary((this.heroAtk.get(h.id) ?? 20) * 6));
        hurt.hp = Math.min(hurt.maxHp, hurt.hp + heal);
        this.emit({ type: "hit", sourceId: h.id, targetId: hurt.id, amount: heal, kind: "heal" });
        return;
      }
    }
    const target = this.frontMonster();
    if (!target) return;
    const crit = Math.random() < 0.18;
    let dmg = Math.round(vary(this.heroAtk.get(h.id) ?? 20));
    const kind: EngineHit["kind"] =
      h.vocation === "sorcerer" || h.vocation === "cleric" ? "magic" : "physical";
    if (crit) dmg = Math.round(dmg * 2);
    target.hp -= dmg;
    this.emit({
      type: "hit",
      sourceId: h.id,
      targetId: target.id,
      amount: dmg,
      kind: crit ? "crit" : kind,
    });
    if (target.hp <= 0) this.killMonster(target);
  }

  private killMonster(m: CombatEntity) {
    this.monsters = this.monsters.filter((x) => x.id !== m.id);
    this.monsterCd.delete(m.id);
    this.monsterAtk.delete(m.id);
    this.emit({ type: "death", id: m.id });

    // xp + gold
    const xp = (m as CombatEntity & { xp?: number }).xp ?? 10;
    const gainedXp = Math.round(xp * (this.levelInfo.xpRate / 100));
    this.levelInfo.xp += gainedXp;
    this.xpAccum += gainedXp;
    this.levelInfo.gold += Math.round(vary(m.level * 12 + 20));
    while (this.levelInfo.xp >= this.levelInfo.xpToNext) this.levelUp();

    // loot
    const rarity = rollRarity();
    const drop: LootDrop = {
      item: {
        id: 1000 + this.idc,
        name: pick(LOOT_NAMES[rarity]),
        rarity,
        value: Math.round(vary(m.level * 8 + 5)),
      },
      amount: rarity === "common" ? 1 + Math.floor(Math.random() * 3) : 1,
    };
    this.lootFeed.unshift({
      id: this.idc++,
      name: drop.item.name,
      rarity,
      amount: drop.amount,
    });
    this.lootFeed = this.lootFeed.slice(0, 14);
    this.emit({ type: "loot", drop, monsterName: m.name });

    this.respawnTimer = Math.min(this.respawnTimer, 500);
  }

  private levelUp() {
    this.levelInfo.xp -= this.levelInfo.xpToNext;
    this.levelInfo.level += 1;
    this.levelInfo.xpToNext = this.xpForLevel(this.levelInfo.level);
    // reescala heróis mantendo a razão de hp
    const lvl = this.levelInfo.level;
    for (const h of this.heroes) {
      const v = VOCATION_LIST.find((x) => x.id === h.vocation)!;
      const ratio = h.hp / h.maxHp;
      h.maxHp = Math.round(v.base.hp * (1 + lvl * 0.08));
      h.hp = Math.round(h.maxHp * ratio);
      h.level = lvl;
      this.heroAtk.set(h.id, v.base.attack * (1 + lvl * 0.06));
    }
  }

  private xpForLevel(level: number) {
    return Math.round(400 * Math.pow(level, 1.5));
  }

  snapshot(): EngineSnapshot {
    const xpPerHour =
      this.elapsed > 0 ? Math.round((this.xpAccum / this.elapsed) * 3_600_000) : 0;
    return {
      heroes: this.heroes,
      monsters: this.monsters,
      levelInfo: this.levelInfo,
      region: this.region,
      lootFeed: this.lootFeed,
      xpPerHour,
      running: this.running,
    };
  }
}
