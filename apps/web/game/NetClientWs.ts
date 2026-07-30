"use client";

/**
 * NetClientWs — o MESMO client teatral, mas dirigido pelo SERVIDOR autoritativo
 * (@pixel-idle/game-server) via WebSocket. Não simula nada: recebe snapshot + stream
 * de SimEvent do protocolo, faz o conta-gotas igual ao NetClient e é dono das tiles.
 * API pública idêntica ao NetClient → HuntScene/HUD/CanvasStage não mudam.
 *
 * Prova a separação: trocar NetClient (local) por NetClientWs (servidor) não toca o
 * render. Fase A local ↔ Fase B servidor, mesmo contrato.
 */
import { PROTOCOL_VERSION, type ServerMessage, type SimEvent, type Snapshot } from "@pixel-idle/game-protocol";
import {
  REGION_BY_ID,
  REGIONS,
  type CombatEntity,
  type LevelInfo,
  type LootDrop,
  type RegionDef,
} from "@pixel-idle/shared";
import { heroTile, monsterTile, type EngineEvent, type EngineSnapshot } from "./NetClient";

const DEFAULT_SERVER =
  process.env.NEXT_PUBLIC_GAME_SERVER ?? "http://127.0.0.1:4000";

export class NetClientWs {
  region: RegionDef;
  heroes: CombatEntity[] = [];
  monsters: CombatEntity[] = [];
  running = false;

  private ws?: WebSocket;
  private connected = false;
  private wantHunt = false;
  private pendingRegion: string;
  private listeners: ((ev: EngineEvent) => void)[] = [];
  private queue: { at: number; e: SimEvent }[] = [];
  private clock = 0;
  private baseAt = 0;
  private levelInfo: LevelInfo;
  private lootFeed: EngineSnapshot["lootFeed"] = [];
  private xpPerHour = 0;

  constructor(startLevel = 8, regionId = "greenfields", private server = DEFAULT_SERVER) {
    this.region = REGION_BY_ID[regionId] ?? REGIONS[0];
    this.pendingRegion = regionId;
    this.levelInfo = { level: startLevel, xp: 0, xpToNext: 1, gold: 0, xpRate: 120 };
    void this.connect();
  }

  private async connect() {
    try {
      const res = await fetch(`${this.server}/auth/dev-token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vocation: "knight", name: "Ashen" }),
      });
      const { token } = (await res.json()) as { token: string };
      const ws = new WebSocket(`${this.server.replace(/^http/, "ws")}/?token=${token}&v=${PROTOCOL_VERSION}`);
      this.ws = ws;
      ws.onopen = () => {
        this.connected = true;
        if (this.wantHunt) this.send({ type: "startHunt", regionId: this.pendingRegion });
      };
      ws.onmessage = (ev) => this.onMessage(JSON.parse(String(ev.data)) as ServerMessage);
      ws.onclose = () => {
        this.connected = false;
      };
    } catch {
      // servidor offline — a cena fica vazia; o NetClient local é o fallback padrão
    }
  }

  private send(cmd: unknown) {
    if (this.ws && this.connected) this.ws.send(JSON.stringify(cmd));
  }

  private onMessage(msg: ServerMessage) {
    switch (msg.t) {
      case "snapshot":
        this.applySnapshot(msg.snapshot);
        break;
      case "events":
        this.enqueue(msg.events);
        break;
      case "ended":
        this.running = false;
        break;
      default:
        break; // party/social/market/offlineReport: fora do escopo da cena
    }
  }

  private applySnapshot(s: Snapshot) {
    this.region = REGION_BY_ID[s.regionId] ?? this.region;
    this.levelInfo = { ...s.level };
    this.running = s.running;
    this.heroes = s.heroes.map((h) => ({
      id: h.entityId,
      kind: "hero",
      name: h.name,
      level: h.level,
      hp: h.hp,
      maxHp: h.maxHp,
      tile: h.vocation ? heroTile(h.vocation) : { x: 5, y: 4 },
      color: h.tint,
      vocation: h.vocation,
    }));
    this.monsters = s.monsters.map((m) => ({
      id: m.entityId,
      kind: "monster",
      name: m.name,
      level: m.level,
      hp: m.hp,
      maxHp: m.maxHp,
      tile: { ...monsterTile(m.slot.index) },
      color: m.tint,
    }));
  }

  /** agenda o batch de eventos do servidor ao longo de ~1s real (conta-gotas) */
  private enqueue(events: SimEvent[]) {
    const base = Math.max(this.clock, this.baseAt);
    const n = events.length;
    events.forEach((e, i) => this.queue.push({ at: base + (n > 1 ? (i / n) * 1000 : 0), e }));
    this.baseAt = base + 1000;
  }

  // ── API espelhando o NetClient ──────────────────────────────────────────────
  on(cb: (ev: EngineEvent) => void) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }
  private emit(ev: EngineEvent) {
    for (const l of this.listeners) l(ev);
  }
  start() {
    this.wantHunt = true;
    this.running = true;
    if (this.connected) this.send({ type: "startHunt", regionId: this.pendingRegion });
  }
  stop() {
    this.wantHunt = false;
    this.running = false;
    this.send({ type: "leaveHunt" });
  }
  setRegion(regionId: string) {
    this.pendingRegion = regionId;
    this.region = REGION_BY_ID[regionId] ?? this.region;
    this.send({ type: "setRegion", regionId });
  }

  tick(dtMs: number) {
    const dt = Math.min(dtMs, 250);
    this.clock += dt;
    while (this.queue.length && this.queue[0].at <= this.clock) this.apply(this.queue.shift()!.e);
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
        this.levelInfo = { ...this.levelInfo, level: e.level };
        break;
      case "sessionEnd":
        this.running = false;
        break;
    }
  }

  snapshot(): EngineSnapshot {
    return {
      heroes: this.heroes,
      monsters: this.monsters,
      levelInfo: this.levelInfo,
      region: this.region,
      lootFeed: this.lootFeed,
      xpPerHour: this.xpPerHour,
      running: this.running,
    };
  }
}
