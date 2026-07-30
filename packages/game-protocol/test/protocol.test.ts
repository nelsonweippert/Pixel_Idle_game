import { describe, it, expect } from "vitest";
import {
  ClientCommand,
  SimEvent,
  Snapshot,
  PROTOCOL_VERSION,
} from "../src/index";

describe("game-protocol — comandos", () => {
  it("aceita um startHunt válido", () => {
    const r = ClientCommand.safeParse({ type: "startHunt", regionId: "greenfields" });
    expect(r.success).toBe(true);
  });

  it("rejeita comando desconhecido", () => {
    const r = ClientCommand.safeParse({ type: "castFireball" });
    expect(r.success).toBe(false);
  });

  it("rejeita startHunt sem regionId", () => {
    const r = ClientCommand.safeParse({ type: "startHunt" });
    expect(r.success).toBe(false);
  });
});

describe("game-protocol — eventos da sim", () => {
  it("valida um spawn com slot lógico (sem pixel)", () => {
    const r = SimEvent.safeParse({
      type: "spawn",
      atSimMs: 0,
      entityId: "hero_knight",
      kind: "hero",
      name: "Knight",
      level: 8,
      hp: 900,
      maxHp: 900,
      vocation: "knight",
      slot: { row: "front", index: 0 },
      tint: 0x5b8fd6,
    });
    expect(r.success).toBe(true);
  });

  it("valida um damage com hpAfter", () => {
    const r = SimEvent.safeParse({
      type: "damage",
      atSimMs: 1000,
      sourceId: "hero_knight",
      targetId: "mob_0",
      amount: 42,
      kind: "crit",
      hpAfter: 18,
    });
    expect(r.success).toBe(true);
  });

  it("rejeita evento com type fora da união", () => {
    const r = SimEvent.safeParse({ type: "teleport", atSimMs: 0 });
    expect(r.success).toBe(false);
  });
});

describe("game-protocol — snapshot e versão", () => {
  it("valida um snapshot mínimo na versão corrente", () => {
    const r = Snapshot.safeParse({
      protocolVersion: PROTOCOL_VERSION,
      huntId: "h1",
      regionId: "greenfields",
      running: true,
      simTimeMs: 0,
      heroes: [],
      monsters: [],
      level: { level: 8, xp: 0, xpToNext: 9051, gold: 12500, xpRate: 120 },
      stamina: { currentMs: 43_200_000, maxMs: 43_200_000 },
    });
    expect(r.success).toBe(true);
  });

  it("rejeita snapshot de versão incompatível", () => {
    const r = Snapshot.safeParse({
      protocolVersion: 999,
      huntId: "h1",
      regionId: "greenfields",
      running: true,
      simTimeMs: 0,
      heroes: [],
      monsters: [],
      level: { level: 8, xp: 0, xpToNext: 9051, gold: 12500, xpRate: 120 },
      stamina: { currentMs: 1, maxMs: 1 },
    });
    expect(r.success).toBe(false);
  });
});
