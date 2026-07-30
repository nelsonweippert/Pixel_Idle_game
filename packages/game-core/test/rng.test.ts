import { describe, it, expect } from "vitest";
import { createRng, nextU32, RngCursor, type RngState } from "../src/index";

function seq(st: RngState, n: number): number[] {
  const out: number[] = [];
  let s = st;
  for (let i = 0; i < n; i++) {
    const r = nextU32(s);
    out.push(r.value);
    s = r.state;
  }
  return out;
}

describe("rng — PCG32 serializável", () => {
  it("é determinístico: mesma seed → mesma sequência", () => {
    expect(seq(createRng(42n, 0n), 8)).toEqual(seq(createRng(42n, 0n), 8));
  });

  it("streams diferentes (seq) → sequências diferentes", () => {
    expect(seq(createRng(42n, 0n), 8)).not.toEqual(seq(createRng(42n, 1n), 8));
  });

  it("estado é JSON-safe e reidrata continuando igual", () => {
    let st = createRng(7n, 0n);
    for (let i = 0; i < 5; i++) st = nextU32(st).state;
    const round = JSON.parse(JSON.stringify(st)) as RngState;
    expect(seq(round, 5)).toEqual(seq(st, 5));
  });

  it("cursor.float() fica em [0,1)", () => {
    const c = new RngCursor(createRng(1n, 0n));
    for (let i = 0; i < 200; i++) {
      const f = c.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it("cursor.int(n) fica em [0,n)", () => {
    const c = new RngCursor(createRng(9n, 3n));
    for (let i = 0; i < 200; i++) {
      const v = c.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });
});
