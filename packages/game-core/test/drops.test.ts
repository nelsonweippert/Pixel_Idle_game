/**
 * Verifica o WIRING de drops MU end-to-end: ao caçar, a mochila da sessão (state.loot)
 * enche com instâncias reais do catálogo e o ouro cresce (money drop). Determinístico.
 */
import { describe, it, expect } from "vitest";
import { advance, buildContentBundle, createSession } from "../src";
import { MU_ITEMS } from "@pixel-idle/shared";

const content = buildContentBundle();
const ctx = { content };

describe("drops MU — wiring end-to-end", () => {
  it("caçar popula a mochila com itens do catálogo e sobe o ouro", () => {
    const s = createSession({ huntId: "t", seed: 5n, startLevel: 10, vocations: ["knight"] }, ctx);
    const goldBefore = s.level.gold;
    const { state } = advance(s, ctx, 180_000); // 3 min de caçada

    expect(state.loot.length).toBeGreaterThan(0);
    // toda instância aponta pra uma definição válida do catálogo
    for (const inst of state.loot) expect(MU_ITEMS[inst.defId]).toBeTruthy();
    // ouro subiu (money drops)
    expect(state.level.gold).toBeGreaterThan(goldBefore);
  });

  it("é determinístico (mesma seed → mesma mochila)", () => {
    const run = () => {
      const s = createSession({ huntId: "t", seed: 9n, startLevel: 12, vocations: ["knight"] }, ctx);
      return advance(s, ctx, 120_000).state.loot.map((i) => `${i.defId}:${i.level}:${i.excellent.length}`);
    };
    expect(run()).toEqual(run());
  });
});
