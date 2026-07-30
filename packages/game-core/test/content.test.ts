import { describe, it, expect } from "vitest";
import { buildContentBundle, validateContent } from "../src/index";

describe("content — bundle e validação", () => {
  it("o bundle real (shared) passa na validação", () => {
    expect(() => validateContent(buildContentBundle())).not.toThrow();
  });

  it("região sem criaturas é reprovada", () => {
    const b = buildContentBundle();
    const broken = { ...b, regionList: [{ ...b.regionList[0], creatures: [] }] };
    expect(() => validateContent(broken)).toThrow(/sem criaturas/);
  });

  it("pool de loot vazio é reprovado", () => {
    const b = buildContentBundle();
    const broken = { ...b, loot: { ...b.loot, names: { ...b.loot.names, legendary: [] } } };
    expect(() => validateContent(broken)).toThrow(/legendary/);
  });
});
