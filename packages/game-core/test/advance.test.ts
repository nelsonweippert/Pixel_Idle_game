import { describe, it, expect } from "vitest";
import {
  advance,
  buildContentBundle,
  buildSnapshot,
  createSession,
  type CreateSessionOpts,
} from "../src/index";

const content = buildContentBundle();
const ctx = { content };

function newSession(overrides: Partial<CreateSessionOpts> = {}) {
  return createSession(
    { huntId: "h1", seed: 20260712n, startLevel: 8, staminaMaxMs: 24 * 3600 * 1000, ...overrides },
    ctx,
  );
}

describe("advance — montagem da sessão", () => {
  it("createSession monta 4 heróis, 4 monstros, rodando em t=0", () => {
    const s = newSession();
    expect(s.participants).toHaveLength(4);
    expect(s.monsters).toHaveLength(4);
    expect(s.running).toBe(true);
    expect(s.simTimeMs).toBe(0);
  });

  it("buildSnapshot projeta com slot lógico (sem pixel)", () => {
    const snap = buildSnapshot(newSession());
    expect(snap.heroes).toHaveLength(4);
    expect(snap.heroes[0].slot).toHaveProperty("row");
    expect(snap.monsters.every((m) => m.slot.row === "front")).toBe(true);
    expect(snap.protocolVersion).toBe(1);
  });
});

describe("advance — determinismo", () => {
  it("mesma seed → timeline e estado idênticos", () => {
    const a = advance(newSession(), ctx, 30_000);
    const b = advance(newSession(), ctx, 30_000);
    expect(a.events).toEqual(b.events);
    expect(a.state).toEqual(b.state);
  });

  it("seeds diferentes → timelines diferentes", () => {
    const a = advance(newSession({ seed: 1n }), ctx, 30_000);
    const b = advance(newSession({ seed: 2n }), ctx, 30_000);
    expect(a.events).not.toEqual(b.events);
  });

  it("é RESUMÍVEL: 1×60s ≡ 60×1s (eventos e estado final iguais)", () => {
    const oneShot = advance(newSession(), ctx, 60_000);
    let s = newSession();
    const evs: unknown[] = [];
    for (let t = 0; t < 60; t++) {
      const r = advance(s, ctx, (t + 1) * 1000);
      s = r.state;
      evs.push(...r.events);
    }
    expect(evs).toEqual(oneShot.events);
    expect(s).toEqual(oneShot.state);
  });

  it("não muta o estado de entrada (value-semantics)", () => {
    const s = newSession();
    const before = JSON.stringify(s);
    advance(s, ctx, 10_000);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("advance — combate e interrupção", () => {
  it("emite spawn/damage/kill/drop ao longo da hunt", () => {
    const kinds = new Set(advance(newSession(), ctx, 30_000).events.map((e) => e.type));
    expect(kinds.has("damage")).toBe(true);
    expect(kinds.has("kill")).toBe(true);
    expect(kinds.has("drop")).toBe(true);
    expect(kinds.has("spawn")).toBe(true); // respawns durante a hunt
  });

  it("stamina zera → sessionEnd(cause:stamina) e a sessão para", () => {
    const r = advance(newSession({ staminaMaxMs: 5000 }), ctx, 60_000);
    expect(r.state.running).toBe(false);
    expect(r.state.endCause).toBe("stamina");
    const ends = r.events.filter((e) => e.type === "sessionEnd");
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ cause: "stamina" });
    expect(r.state.simTimeMs).toBeLessThanOrEqual(6000);
  });

  it("hp do tank nunca zera na Fase A (party não wipe)", () => {
    const r = advance(newSession(), ctx, 120_000);
    const tank = r.state.participants.find((p) => p.role === "tank")!;
    expect(tank.hp).toBeGreaterThanOrEqual(1);
  });
});

describe("advance — golden replay", () => {
  it("timeline de 20s com seed fixa (snapshot comitado)", () => {
    const r = advance(newSession({ seed: 42n }), ctx, 20_000);
    expect(r.events).toMatchSnapshot();
  });
});
