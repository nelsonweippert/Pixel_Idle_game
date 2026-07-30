/**
 * NetClient — o CLIENT TEATRAL da hunt (Fase A).
 *
 * Substitui o MockEngine: a fonte de verdade agora é @pixel-idle/game-core (sim pura,
 * determinística). Este adaptador:
 *   1. roda advance() do core em passos de 1 segundo de sim (AD-003);
 *   2. traduz SimEvent (do protocolo) → EngineEvent (o que a cena já consome);
 *   3. é DONO das posições — mapeia slot lógico → tile (o core não decide pixel);
 *   4. faz CONTA-GOTAS: distribui os eventos de cada segundo de sim ao longo do
 *      segundo real seguinte, pra a cena ficar viva (senão o combate pulsaria 1×/s).
 *
 * A API pública espelha o MockEngine (region/heroes/monsters/running/on/tick/
 * snapshot/start/stop/setRegion) — HuntScene, HUD e CanvasStage não mudam.
 * Na Fase B, este adaptador vira um cliente WebSocket real e nada no render muda.
 */
import {
  advance,
  buildContentBundle,
  createSession,
  xpForLevel,
  type ContentBundle,
  type LevelInfo as SimLevel,
  type SessionState,
} from "@pixel-idle/game-core";
import type { SimEvent } from "@pixel-idle/game-protocol";
import {
  REGION_BY_ID,
  regionForLevel,
  assumedGear,
  gearTermsFromEquipment,
  canUseItem,
  computeDerived,
  MU_CLASSES,
  MU_BUILDS,
  EquipSlot,
  type BaseAttrs,
  type CombatEntity,
  type DerivedStats,
  type GearTerms,
  type ItemDefinition,
  type ItemInstance,
  type LevelInfo,
  type LootDrop,
  type MuClassId,
  type Rarity,
  type RegionDef,
  type VocId,
  type VocationId,
} from "@pixel-idle/shared";

/** soma dois conjuntos de GearTerms (gear assumido base + itens equipados) */
function sumGear(a: GearTerms, b: GearTerms): GearTerms {
  return {
    weaponMin: a.weaponMin + b.weaponMin, weaponMax: a.weaponMax + b.weaponMax,
    magicMin: a.magicMin + b.magicMin, magicMax: a.magicMax + b.magicMax,
    armorDef: a.armorDef + b.armorDef, armorDefRate: a.armorDefRate + b.armorDefRate,
    critChance: a.critChance + b.critChance, excellentChance: a.excellentChance + b.excellentChance,
    bonusHp: a.bonusHp + b.bonusHp, bonusMana: a.bonusMana + b.bonusMana,
  };
}

export const GRID = { w: 15, h: 9 };

/** posições fixas dos heróis (o client é dono das tiles; o core só dá o slot).
 *  PARTY AO CENTRO (estilo MU real): o grupo acampa no meio da arena — knight (tank)
 *  no centro exato, os demais em volta dele — e as criaturas nascem AO REDOR e marcham
 *  até a distância de combate. O grid é 15×9 → centro = (7,4). */
const HERO_FORMATION: Record<VocationId, { x: number; y: number }> = {
  knight: { x: 7, y: 4 }, // tank no centro
  ranger: { x: 6, y: 3 },
  sorcerer: { x: 6, y: 5 },
  cleric: { x: 6, y: 4 }, // healer colado atrás
};

/** slot lógico de monstro (0..3) → posição no ANEL ao redor da party (raio ~2-3 tiles),
 *  em ângulos espalhados (L, NE, SE, O) — cercam o grupo como no MU. A cena faz cada um
 *  ENTRAR pela borda na direção do seu ponto e marchar até ele (distância de combate). */
const MONSTER_TILES: { x: number; y: number }[] = [
  { x: 9, y: 4 }, // leste, colado no tank (melee)
  { x: 8, y: 2 }, // nordeste
  { x: 8, y: 6 }, // sudeste
  { x: 5, y: 3 }, // oeste (cercado!)
];
export const monsterTile = (slotIndex: number) => MONSTER_TILES[slotIndex % MONSTER_TILES.length];
export const heroTile = (v: VocationId) => ({ ...HERO_FORMATION[v] });

// ── eventos que a cena consome (mesmas formas do antigo MockEngine) ────────────
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

/** um item que o jogador possui (instância MU + sua definição de catálogo) */
export interface OwnedItem {
  inst: ItemInstance;
  def: ItemDefinition;
}

/** ficha de personagem MU do jogador local (atributos + derivados) */
export interface CharSheet {
  vocation: VocationId;
  name: string;
  muClass: MuClassId;
  level: number;
  attrs: BaseAttrs;
  derived: DerivedStats;
  hp: number;
  maxHp: number;
  gold: number;
  /** pontos de atributo não alocados (ganhos por nível, estilo MU) */
  availablePoints: number;
}

export interface EngineSnapshot {
  heroes: CombatEntity[];
  monsters: CombatEntity[];
  levelInfo: LevelInfo;
  region: RegionDef;
  lootFeed: { id: number; name: string; rarity: Rarity; amount: number }[];
  xpPerHour: number;
  running: boolean;
  /** ficha MU do jogador (local); WS ainda não envia → opcional */
  sheet?: CharSheet;
  /** mochila do jogador (instâncias dropadas) */
  inventory?: OwnedItem[];
  /** equipamento por slot (0..11) */
  equipment?: (OwnedItem | null)[];
  /** número do SET completo equipado (Helm+Armor+Pants+Gloves+Boots do mesmo tier)
   *  → a cena veste o herói com a armadura. null = sem set completo (corpo base). */
  heroSet?: number | null;
}

/** contrato comum do client teatral — NetClient (local) e NetClientWs (servidor) */
export interface HuntEngine {
  region: RegionDef;
  heroes: CombatEntity[];
  monsters: CombatEntity[];
  running: boolean;
  on(cb: (ev: EngineEvent) => void): () => void;
  tick(dtMs: number): void;
  snapshot(): EngineSnapshot;
  start(): void;
  stop(): void;
  setRegion(regionId: string): void;
  /** equipa item da mochila (uid) no seu slot; unequip devolve o slot pra mochila */
  equip?(uid: number): void;
  unequip?(slot: number): void;
  /** aloca 1 ponto num atributo (estilo MU); autoPoints distribui todos pela build */
  allocate?(stat: keyof BaseAttrs): void;
  autoPoints?(): void;
  /** número do SET completo equipado (a cena veste o herói); null = corpo base */
  heroSet?(): number | null;
  /** peça de armadura equipada POR SLOT (número do set de cada peça; null = corpo base).
   *  A cena compõe o herói em camadas — equipar QUALQUER peça já aparece no personagem. */
  heroPieces?(): HeroPieces;
}

/** número do set (tier) equipado em cada slot de armadura — null = sem peça (corpo nu).
 *  Armas/escudo são por defId (camada `wpn-<defId>` presa no osso da mão). */
export interface HeroPieces {
  helm: number | null;
  armor: number | null;
  pants: number | null;
  gloves: number | null;
  boots: number | null;
  weaponR: number | null; // defId da arma na mão direita
  weaponL: number | null; // defId da arma/escudo na mão esquerda
}

/** xp absoluto acumulado (a curva reinicia xp a cada nível; somamos os anteriores) */
function absoluteXp(level: SimLevel, content: ContentBundle): number {
  let sum = level.xp;
  for (let k = 1; k < level.level; k++) sum += xpForLevel(content, k);
  return sum;
}

let seedCounter = 1;

export class NetClient {
  region: RegionDef;
  heroes: CombatEntity[] = [];
  monsters: CombatEntity[] = [];
  running = false;

  private content: ContentBundle;
  private sim: SessionState;
  private listeners: Listener[] = [];
  private queue: { at: number; e: SimEvent }[] = [];
  private clock = 0; // ms reais acumulados enquanto caçando
  private nextAdvanceAt = 0; // quando avançar o próximo segundo de sim
  private levelInfo: LevelInfo;
  private lootFeed: EngineSnapshot["lootFeed"] = [];
  private xpAccum = 0;
  private elapsedReal = 0;
  private equipment: (OwnedItem | null)[] = new Array(12).fill(null);
  // alocação de pontos estilo MU (client-side): alloc = atributos escolhidos (começa na
  // base da classe), availablePoints = pontos por nível ainda não gastos.
  private alloc: BaseAttrs | null = null;
  private availablePoints = 0;
  private lastLevel = 0;

  constructor(startLevel = 8, regionId?: string) {
    this.content = buildContentBundle();
    this.sim = this.freshSession(startLevel, regionId);
    this.region = REGION_BY_ID[this.sim.regionId] ?? regionForLevel(startLevel);
    this.rebuildDisplay();
    this.levelInfo = { ...this.sim.level };
  }

  private freshSession(startLevel: number, regionId?: string): SessionState {
    return createSession(
      {
        huntId: "local",
        seed: (Date.now() ^ (seedCounter++ << 20)) >>> 0,
        startLevel,
        regionId,
        vocations: ["knight"], // primeira cena: só o Knight (a base que já temos)
        staminaMaxMs: 24 * 60 * 60 * 1000, // Fase A: stamina alta (offline é Fase B)
      },
      { content: this.content },
    );
  }

  /** reconstrói as entidades de display (com tile) a partir do estado do core */
  private rebuildDisplay() {
    this.heroes = this.sim.participants.map((p) => ({
      id: p.charId,
      kind: "hero",
      name: p.name,
      level: p.level,
      hp: p.hp,
      maxHp: p.maxHp,
      tile: { ...HERO_FORMATION[p.vocation] },
      color: p.tint,
      vocation: p.vocation,
    }));
    this.monsters = this.sim.monsters.map((m) => ({
      id: m.id,
      kind: "monster",
      name: m.name,
      level: m.level,
      hp: m.hp,
      maxHp: m.maxHp,
      tile: { ...monsterTile(m.slotIndex) },
      color: m.tint,
    }));
  }

  // ── ciclo de vida (API do MockEngine) ──────────────────────────────────────
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
    const region = REGION_BY_ID[regionId];
    if (!region) return;
    // tira os monstros atuais de cena (sync não remove monstro; só death)
    for (const m of this.monsters) this.emit({ type: "death", id: m.id });
    this.queue = [];
    const carried = { ...this.sim.level };
    this.sim = this.freshSession(carried.level, regionId);
    this.sim.level = carried; // preserva progressão (xp/gold)
    this.region = region;
    this.rebuildDisplay();
    this.levelInfo = { ...this.sim.level };
  }

  // ── tick: avança o core e pinga os eventos ─────────────────────────────────
  tick(dtMs: number) {
    if (!this.running) return;
    const dt = Math.min(dtMs, 250); // Fase A: sem catch-up de offline
    this.clock += dt;
    this.elapsedReal += dt;
    this.pump();
    this.drain();
  }

  /** avança a sim em passos de 1s de sim conforme o relógio real passa */
  private pump() {
    while (this.running && this.clock >= this.nextAdvanceAt) {
      const before = absoluteXp(this.sim.level, this.content);
      const { state, events } = advance(this.sim, { content: this.content }, this.sim.simTimeMs + 1000);
      this.sim = state;

      const base = this.nextAdvanceAt;
      const n = events.length;
      events.forEach((e, i) => this.queue.push({ at: base + (n > 1 ? (i / n) * 1000 : 0), e }));

      this.xpAccum += Math.max(0, absoluteXp(this.sim.level, this.content) - before);
      this.syncHeroStats();
      this.levelInfo = { ...this.sim.level };
      if (!this.sim.running) this.running = false;
      this.nextAdvanceAt += 1000;
    }
  }

  /** dispara os eventos cujo tempo agendado já chegou */
  private drain() {
    while (this.queue.length && this.queue[0].at <= this.clock) {
      this.apply(this.queue.shift()!.e);
    }
  }

  private find(id: string): CombatEntity | undefined {
    return this.heroes.find((h) => h.id === id) ?? this.monsters.find((m) => m.id === id);
  }

  private apply(e: SimEvent) {
    switch (e.type) {
      case "spawn": {
        const ent: CombatEntity = {
          id: e.entityId,
          kind: "monster",
          name: e.name,
          level: e.level,
          hp: e.hp,
          maxHp: e.maxHp,
          tile: { ...monsterTile(e.slot.index) },
          color: e.tint,
        };
        if (!this.monsters.some((m) => m.id === ent.id)) this.monsters.push(ent);
        this.emit({ type: "spawn", entity: ent });
        break;
      }
      case "damage": {
        const target = this.find(e.targetId);
        if (target) target.hp = e.hpAfter;
        this.emit({ type: "hit", sourceId: e.sourceId, targetId: e.targetId, amount: e.amount, kind: e.kind });
        break;
      }
      case "kill": {
        this.monsters = this.monsters.filter((m) => m.id !== e.entityId);
        this.emit({ type: "death", id: e.entityId });
        break;
      }
      case "drop": {
        const drop: LootDrop = {
          item: { id: e.item.id, name: e.item.name, rarity: e.item.rarity, value: e.item.value },
          amount: e.item.amount,
        };
        this.lootFeed.unshift({ id: e.item.id, name: e.item.name, rarity: e.item.rarity, amount: e.item.amount });
        this.lootFeed = this.lootFeed.slice(0, 14);
        this.emit({ type: "loot", drop, monsterName: e.fromName });
        break;
      }
      case "levelUp":
        // topo/party já refletem via syncHeroStats + levelInfo; nada pra cena
        break;
      case "sessionEnd":
        this.running = false;
        break;
    }
  }

  /** propaga level/maxHp dos participantes pro display (hp em si pinga por evento) */
  private syncHeroStats() {
    for (const h of this.heroes) {
      const p = this.sim.participants.find((x) => x.charId === h.id);
      if (p) {
        h.level = p.level;
        h.maxHp = p.maxHp;
      }
    }
  }

  /** ficha MU do jogador local (participants[0]) */
  private buildSheet(): CharSheet | undefined {
    const p = this.sim.participants[0];
    if (!p) return undefined;
    return {
      vocation: p.vocation,
      name: p.name,
      muClass: p.muClass,
      level: p.level,
      attrs: p.attrs,
      derived: p.mu,
      hp: p.hp,
      maxHp: p.maxHp,
      gold: this.sim.level.gold,
      availablePoints: this.availablePoints,
    };
  }

  /** recomputa os stats MU do jogador = base(gear assumido) + itens equipados.
   *  Reflete o EQUIPAMENTO no personagem (dano/def/HP/crit mudam ao equipar). */
  private recomputeStats() {
    const p = this.sim.participants[0];
    if (!p) return;
    this.ensurePoints();
    const equipped = this.equipment.filter((x): x is OwnedItem => !!x).map((o) => ({ def: o.def, inst: o.inst }));
    const gear = sumGear(assumedGear(p.vocation as VocId, p.level), gearTermsFromEquipment(equipped));
    // atributos = alocação do jogador (base + pontos gastos); derivados via computeDerived
    const attrs = this.alloc!;
    const derived = computeDerived(p.muClass, attrs, p.level, gear);
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    p.attrs = { ...attrs };
    p.mu = derived;
    p.maxHp = derived.maxHp;
    p.hp = Math.round(p.maxHp * ratio);
    p.defense = derived.defense;
    const isCaster = p.role === "mage" || p.role === "healer";
    p.attack = Math.round(isCaster ? (derived.minMagic + derived.maxMagic) / 2 : (derived.minPhys + derived.maxPhys) / 2);
  }

  /** inicializa/atualiza a pool de pontos: alloc começa na base da classe; cada nível
   *  concede `pointsPerLevel` pontos NÃO alocados (o jogador distribui, estilo MU). */
  private ensurePoints() {
    const p = this.sim.participants[0];
    if (!p) return;
    const ppl = MU_CLASSES[p.muClass].pointsPerLevel;
    if (!this.alloc) {
      this.alloc = { ...MU_CLASSES[p.muClass].base };
      this.availablePoints = ppl * Math.max(0, p.level - 1);
      this.lastLevel = p.level;
    } else if (p.level > this.lastLevel) {
      this.availablePoints += ppl * (p.level - this.lastLevel);
      this.lastLevel = p.level;
    }
  }

  /** roda no snapshot: garante que os stats do jogador reflitam a alocação (o core
   *  reseta attrs no level-up; aqui reafirmamos + concedemos os pontos novos). */
  private syncPlayerStats() {
    const p = this.sim.participants[0];
    if (!p) return;
    if (!this.alloc || p.level !== this.lastLevel) this.recomputeStats();
  }

  /** aloca 1 ponto num atributo (estilo MU) — só se houver ponto disponível */
  allocate(stat: keyof BaseAttrs) {
    this.ensurePoints();
    if (this.availablePoints <= 0 || !this.alloc) return;
    this.alloc[stat] = (this.alloc[stat] ?? 0) + 1;
    this.availablePoints -= 1;
    this.recomputeStats();
  }

  /** distribui TODOS os pontos disponíveis pela build da vocação (conveniência idle) */
  autoPoints() {
    const p = this.sim.participants[0];
    if (!p) return;
    this.ensurePoints();
    let pts = this.availablePoints;
    if (pts <= 0 || !this.alloc) return;
    const frac = MU_BUILDS[p.vocation as VocId].alloc;
    const keys: (keyof BaseAttrs)[] = ["str", "agi", "vit", "ene", "cmd"];
    let primary = keys[0];
    for (const k of keys) if ((frac[k] ?? 0) > (frac[primary] ?? 0)) primary = k;
    let spent = 0;
    for (const k of keys) {
      if (k === primary) continue;
      const add = Math.floor(pts * (frac[k] ?? 0));
      this.alloc[k] += add;
      spent += add;
    }
    this.alloc[primary] += pts - spent; // resto vai pro atributo principal
    this.availablePoints = 0;
    this.recomputeStats();
  }

  /** equipa um item da mochila (uid) no seu slot MU (swap se ocupado; anel busca slot livre) */
  equip(uid: number) {
    const idx = this.sim.loot.findIndex((i) => i.uid === uid);
    if (idx < 0) return;
    const inst = this.sim.loot[idx];
    const def = this.content.muItems[inst.defId];
    if (!def || def.slot == null) return; // consumível/jewel: não equipável
    // regra do MU: só equipa se a classe permite e os requisitos (nível/atributos) batem
    const p = this.sim.participants[0];
    if (p && !canUseItem(def, { muClass: p.muClass, level: p.level, ...p.attrs }).ok) return;
    let slot: number = def.slot;
    if (slot === EquipSlot.Ring1 && this.equipment[EquipSlot.Ring1] && !this.equipment[EquipSlot.Ring2]) slot = EquipSlot.Ring2;
    this.sim.loot.splice(idx, 1);
    const cur = this.equipment[slot];
    if (cur) this.sim.loot.push(cur.inst); // devolve o antigo pra mochila
    this.equipment[slot] = { inst, def };
    this.recomputeStats();
  }

  /** DEV: joga itens direto na MOCHILA (por defId) — QA de ícones/tooltip/equipar. */
  debugGrantLoot(defIds: number[]) {
    let uid = -3000;
    for (const id of defIds) {
      const def = this.content.muItems[id];
      if (!def) continue;
      this.sim.loot.push({ uid: uid--, defId: id, level: id === 1 ? 1 : 0, durability: def.durability, luck: false, skill: false, option: 0, excellent: [], sockets: [] });
    }
  }

  /** DEV: força UMA peça/arma (grupo, número) no slot dela — testa combos MISTOS.
   *  Cobre TODOS os equipáveis (slot vem do próprio def: armas 0/1, armadura 2..6). */
  debugGrantPiece(group: number, n: number) {
    const def = this.content.muItemList.find((d) => d.group === group && d.number === n);
    if (!def || def.slot == null) return;
    const inst: ItemInstance = { uid: -2000 - group, defId: def.id, level: 0, durability: def.durability, luck: false, skill: false, option: 0, excellent: [], sockets: [] };
    this.equipment[def.slot] = { inst, def };
    this.recomputeStats();
  }

  /** DEV: força um SET completo (número `n`) no equipamento — usado pra verificar a
   *  representação da armadura no herói sem depender de drops/requisitos. */
  debugGrantSet(n: number) {
    const slotByGroup: Record<number, number> = { 7: EquipSlot.Helm, 8: EquipSlot.Armor, 9: EquipSlot.Pants, 10: EquipSlot.Gloves, 11: EquipSlot.Boots };
    let uid = -1000;
    for (const def of this.content.muItemList) {
      if (def.group < 7 || def.group > 11 || def.number !== n) continue;
      const slot = slotByGroup[def.group];
      const inst: ItemInstance = { uid: uid--, defId: def.id, level: 0, durability: def.durability, luck: false, skill: false, option: 0, excellent: [], sockets: [] };
      this.equipment[slot] = { inst, def };
    }
    this.recomputeStats();
  }

  /** desequipa o slot: devolve o item pra mochila */
  unequip(slot: number) {
    const cur = this.equipment[slot];
    if (!cur) return;
    this.equipment[slot] = null;
    this.sim.loot.push(cur.inst);
    this.recomputeStats();
  }

  /** mochila do jogador: instâncias dropadas (sim.loot) resolvidas pelo catálogo */
  private buildInventory(): OwnedItem[] {
    const out: OwnedItem[] = [];
    for (const inst of this.sim.loot) {
      const def = this.content.muItems[inst.defId];
      if (def) out.push({ inst, def });
    }
    return out;
  }

  snapshot(): EngineSnapshot {
    this.syncPlayerStats(); // reafirma a alocação de pontos do jogador (core reseta no level-up)
    const xpPerHour =
      this.elapsedReal > 0 ? Math.round((this.xpAccum / this.elapsedReal) * 3_600_000) : 0;
    return {
      heroes: this.heroes,
      monsters: this.monsters,
      levelInfo: this.levelInfo,
      region: this.region,
      lootFeed: this.lootFeed,
      xpPerHour,
      running: this.running,
      sheet: this.buildSheet(),
      inventory: this.buildInventory(),
      equipment: this.equipment,
      heroSet: this.equippedSet(),
    };
  }

  /** número do SET equipado (público — a cena consulta a cada frame, barato) */
  heroSet(): number | null {
    return this.equippedSet();
  }

  /** peça equipada por slot de armadura → número do set daquela peça (paper-doll);
   *  armas/escudo por defId (a camada da arma é única por item, não por tier). */
  heroPieces(): HeroPieces {
    const n = (slot: number) => this.equipment[slot]?.def.number ?? null;
    return {
      helm: n(EquipSlot.Helm),
      armor: n(EquipSlot.Armor),
      pants: n(EquipSlot.Pants),
      gloves: n(EquipSlot.Gloves),
      boots: n(EquipSlot.Boots),
      weaponR: this.equipment[EquipSlot.WeaponRight]?.def.id ?? null,
      weaponL: this.equipment[EquipSlot.WeaponLeft]?.def.id ?? null,
    };
  }

  /** detecta um SET completo: os 5 slots de armadura (Helm..Boots) preenchidos e todos
   *  com o MESMO `number` (tier). Devolve esse número (a cena carrega set-<n>) ou null. */
  private equippedSet(): number | null {
    const slots = [EquipSlot.Helm, EquipSlot.Armor, EquipSlot.Pants, EquipSlot.Gloves, EquipSlot.Boots];
    const pieces = slots.map((s) => this.equipment[s]);
    if (pieces.some((p) => !p)) return null;
    const n = pieces[0]!.def.number;
    return pieces.every((p) => p!.def.number === n) ? n : null;
  }
}
