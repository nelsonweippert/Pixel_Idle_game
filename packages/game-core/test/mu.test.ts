/**
 * Trava as FÓRMULAS DO MU (mu/stats, mu/xp) contra regressão. Valores conferidos
 * termo a termo com o OpenMU (CharacterClasses + CreateExpTable).
 */
import { describe, it, expect } from "vitest";
import { attrsFor, deriveVocation, muXpToNext, muXpToReach, monsterCombat, resolvePhysical } from "@pixel-idle/shared";
import { RngCursor, createRng } from "../src/rng";

describe("mu/stats — atributos e derivados (Dark Knight)", () => {
  it("aloca pontos por nível corretamente (knight L8)", () => {
    // L8 → 35 pontos; alloc DK: .40/.12/.43/.05
    const a = attrsFor("knight", 8);
    expect(a).toEqual({ str: 42, agi: 24, vit: 40, ene: 11, cmd: 0 });
  });

  it("deriva HP/dano do MU (DK L8): maxHp=35+2L+3VIT", () => {
    const { cls, derived } = deriveVocation("knight", 8);
    expect(cls).toBe("dk");
    expect(derived.maxHp).toBe(171); // 35 + 16 + 3*40
    expect(derived.minPhys).toBeLessThan(derived.maxPhys);
    expect(derived.maxPhys).toBeGreaterThan(30);
  });

  it("sorcerer é caster (dano mágico > físico)", () => {
    const { cls, derived } = deriveVocation("sorcerer", 8);
    expect(cls).toBe("dw");
    expect(derived.maxMagic).toBeGreaterThan(derived.maxPhys);
  });
});

describe("mu/xp — curva de experiência do MU", () => {
  it("XP acumulada: 10*(L+8)*(L-1)^2", () => {
    expect(muXpToReach(1)).toBe(0);
    expect(muXpToReach(2)).toBe(100); // 10*10*1
    expect(muXpToReach(10)).toBe(14580); // 10*18*81
  });
  it("xpToNext é a diferença acumulada", () => {
    expect(muXpToNext(1)).toBe(100);
    expect(muXpToNext(9)).toBe(muXpToReach(10) - muXpToReach(9));
  });
});

describe("mu/combat — resolução determinística", () => {
  it("mesma seed → mesmo resultado (determinismo)", () => {
    const { derived } = deriveVocation("knight", 20);
    const def = monsterCombat(40, 6); // Bull Fighter-ish
    const a = resolvePhysical(derived, def, new RngCursor(createRng(7n, 0n)));
    const b = resolvePhysical(derived, def, new RngCursor(createRng(7n, 0n)));
    expect(a).toEqual(b); // mesma seed → mesmo golpe (determinismo)
    expect(a.amount).toBeGreaterThanOrEqual(0);
    // ao longo de vários golpes, deve haver dano real (não só miss)
    const cur = new RngCursor(createRng(1n, 0n));
    let hits = 0;
    for (let i = 0; i < 50; i++) if (resolvePhysical(derived, def, cur).amount > 0) hits++;
    expect(hits).toBeGreaterThan(30);
  });
});
